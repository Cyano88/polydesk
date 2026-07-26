import type { Request, Response } from 'express'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { isAddress } from 'viem'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'
import { sendTransactionalEmail } from './email-provider.js'
import {
  crossedLossThreshold,
  normalizeLpOrderLifecycle,
  polymarketPositionUrl,
  shouldAlertNewPosition,
  type PolymarketResolutionEvent,
} from './polymarket-alert-rules.js'
import { registerPolymarketAlertAsset } from './polymarket-alert-events.js'
import { fetchHashPayLinkPolymarketFundingStatus } from './hashpaylink-polymarket-funding.js'
import { latestHashPayLinkCheckoutEvent, type StoredHashPayLinkWebhookEvent } from './hashpaylink-webhook-store.js'

const DATA_API_ORIGIN = 'https://data-api.polymarket.com'
const CLOB_API_ORIGIN = 'https://clob.polymarket.com'
const REQUEST_TIMEOUT_MS = 10_000
const ALERT_FROM_NAME = process.env.POLYMARKET_ALERT_FROM_NAME ?? 'PolyDesk'
const POLYMARKET_RELAYER_URL = (process.env.POLYMARKET_RELAYER_URL ?? process.env.RELAYER_URL ?? '').trim()
const POLYMARKET_CHAIN_ID = Number(process.env.POLYMARKET_CHAIN_ID ?? 137)
const POLYMARKET_RPC_URL = (process.env.POLYMARKET_RPC_URL ?? process.env.POLYGON_RPC_URL ?? '').trim()
const POLYMARKET_BUILDER_API_KEY = (process.env.POLYMARKET_BUILDER_API_KEY ?? process.env.BUILDER_API_KEY ?? '').trim()
const POLYMARKET_BUILDER_SECRET = (process.env.POLYMARKET_BUILDER_SECRET ?? process.env.BUILDER_SECRET ?? '').trim()
const POLYMARKET_BUILDER_PASS_PHRASE = (
  process.env.POLYMARKET_BUILDER_PASS_PHRASE
  ?? process.env.POLYMARKET_BUILDER_PASSPHRASE
  ?? process.env.BUILDER_PASS_PHRASE
  ?? process.env.BUILDER_PASSPHRASE
  ?? ''
).trim()

const { Pool } = pg
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

let schemaReady: Promise<void> | null = null

function requirePool() {
  if (!pool) {
    const err = new Error('Polymarket portfolio storage is not configured. Add DATABASE_URL on Render.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  return pool
}

function collectErrorText(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.message} ${collectErrorText(value.cause, depth + 1)}`.trim()
  if (typeof value !== 'object') return String(value)
  const record = value as Record<string, unknown>
  return ['message', 'error', 'errorMsg', 'statusText', 'data', 'response', 'body']
    .map(key => collectErrorText(record[key], depth + 1))
    .filter(Boolean)
    .join(' ')
}

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = requirePool().query(`
      create table if not exists polymarket_profiles (
        privy_user_id text primary key,
        polymarket_address text not null,
        watched_address text,
        trading_address text,
        preferred_funding_network text not null default 'base',
        telegram_owner text,
        telegram_id text,
        last_synced_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists polymarket_alert_settings (
        privy_user_id text primary key references polymarket_profiles(privy_user_id) on delete cascade,
        loss_threshold_percent integer not null default 20,
        resolved_alerts_enabled boolean not null default true,
        claimable_alerts_enabled boolean not null default true,
        movement_alerts_enabled boolean not null default false,
        alert_email text,
        updated_at timestamptz not null default now()
      );

      alter table polymarket_profiles
        add column if not exists watched_address text,
        add column if not exists trading_address text,
        add column if not exists deposit_wallet_address text,
        add column if not exists deposit_wallet_status text,
        add column if not exists deposit_wallet_tx_id text,
        add column if not exists deposit_wallet_tx_hash text,
        add column if not exists telegram_owner text,
        add column if not exists telegram_id text;

      alter table polymarket_alert_settings
        add column if not exists alert_email text,
        add column if not exists alert_email_verified boolean not null default false,
        add column if not exists new_position_alerts_enabled boolean not null default false,
        add column if not exists positions_initialized boolean not null default false;

      create table if not exists polymarket_watchlist (
        id serial primary key,
        privy_user_id text not null,
        market_id text not null,
        market_slug text,
        market_url text,
        label text,
        created_at timestamptz not null default now(),
        unique (privy_user_id, market_id)
      );

      create table if not exists polymarket_funding_attempts (
        id serial primary key,
        privy_user_id text not null,
        polymarket_address text not null,
        request_id text,
        network text not null,
        amount text not null,
        status text not null,
        tx_hash text,
        deposit_address text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      alter table polymarket_funding_attempts
        add column if not exists checkout_id text,
        add column if not exists payment_attempt_id text,
        add column if not exists webhook_event_id text,
        add column if not exists webhook_updated_at timestamptz;

      create table if not exists polymarket_alert_history (
        id serial primary key,
        privy_user_id text not null,
        alert_type text not null,
        market_id text,
        title text not null,
        body text,
        severity text not null default 'info',
        source_snapshot jsonb,
        created_at timestamptz not null default now(),
        read_at timestamptz
      );

      alter table polymarket_alert_history
        add column if not exists email_status text not null default 'disabled',
        add column if not exists email_attempts integer not null default 0,
        add column if not exists email_sent_at timestamptz,
        add column if not exists email_next_attempt_at timestamptz,
        add column if not exists email_last_error text;

      create table if not exists polymarket_position_alert_state (
        privy_user_id text not null,
        market_id text not null,
        asset_id text not null,
        position_address text,
        below_loss_threshold boolean not null default false,
        loss_threshold_percent integer,
        resolution_status text not null default 'open',
        last_percent_pnl double precision,
        updated_at timestamptz not null default now(),
        primary key (privy_user_id, market_id, asset_id)
      );

      alter table polymarket_position_alert_state
        add column if not exists position_address text;

      create table if not exists polymarket_public_watch_tokens (
        watch_id uuid primary key,
        privy_user_id text not null unique references polymarket_profiles(privy_user_id) on delete cascade,
        token_hash text not null unique,
        email text not null,
        verified_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists polymarket_lp_order_watch (
        order_id text primary key,
        owner_privy_user_id text not null references polymarket_profiles(privy_user_id) on delete cascade,
        position_address text not null,
        market_id text,
        asset_id text,
        market_title text not null,
        market_url text not null,
        outcome text,
        side text not null default 'BUY',
        price double precision,
        original_size double precision,
        matched_size double precision not null default 0,
        status text not null default 'live',
        last_checked_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists polymarket_funding_attempts_user_idx
        on polymarket_funding_attempts (privy_user_id, created_at desc);
      create index if not exists polymarket_funding_attempts_checkout_idx
        on polymarket_funding_attempts (checkout_id) where checkout_id is not null;
      create index if not exists polymarket_alert_history_user_idx
        on polymarket_alert_history (privy_user_id, created_at desc);
      create index if not exists polymarket_watchlist_user_idx
        on polymarket_watchlist (privy_user_id);
      create index if not exists polymarket_alert_email_retry_idx
        on polymarket_alert_history (email_next_attempt_at)
        where email_status in ('pending', 'failed');
      create index if not exists polymarket_lp_order_watch_owner_idx
        on polymarket_lp_order_watch (owner_privy_user_id, created_at desc);
      create index if not exists polymarket_lp_order_watch_active_idx
        on polymarket_lp_order_watch (last_checked_at)
        where status in ('live', 'partial');
      create unique index if not exists polymarket_lp_lifecycle_alert_unique_idx
        on polymarket_alert_history (privy_user_id, alert_type, ((source_snapshot ->> 'orderId')))
        where alert_type like 'lp-order-%';
    `).then(() => undefined)
  }
  return schemaReady
}

function bearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization ?? ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function linkedEmail(user: User) {
  for (const account of user.linkedAccounts ?? []) {
    if (account.type === 'email' && 'address' in account && typeof account.address === 'string') {
      return account.address.trim().toLowerCase()
    }
  }
  return ''
}

async function verifiedPrivySession(req: Request, includeEmail = false) {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    const err = new Error('Privy is not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET on the server.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  const token = bearerToken(req)
  if (!token) {
    const err = new Error('Missing Privy access token.')
    ;(err as Error & { status?: number }).status = 401
    throw err
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  if (!includeEmail) return { userId: claims.userId, email: '' }
  const user = await client.getUserById(claims.userId)
  return { userId: claims.userId, email: linkedEmail(user) }
}

function cleanString(value: unknown, max = 96) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export async function applyHashPayLinkFundingEvent(event: Pick<StoredHashPayLinkWebhookEvent, 'id' | 'event' | 'checkoutId' | 'createdAt' | 'data'>) {
  await ensureSchema()
  const status = event.event === 'payment.failed'
    ? 'failed'
    : event.event === 'payment.processing' || event.event === 'payment.confirmed'
      ? 'bridging'
      : 'pending'
  const transaction = cleanString(event.data.transactionHash ?? event.data.gatewayTransferId, 96) || null
  const result = await requirePool().query(
    `update polymarket_funding_attempts
        set status = case when status = 'bridge_complete' then status else $1 end,
            tx_hash = coalesce($2, tx_hash),
            webhook_event_id = $3,
            webhook_updated_at = $4,
            updated_at = now()
      where checkout_id = $5
        and (webhook_updated_at is null or webhook_updated_at <= $4)`,
    [status, transaction, event.id, event.createdAt, event.checkoutId],
  )
  return result.rowCount ?? 0
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return ''
  return raw
}

function cleanEmail(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return ''
  return raw
}

function watchTokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function publicWatchOrigin(req: Request) {
  const configured = (process.env.POLYDESK_PUBLIC_ORIGIN ?? process.env.PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')
  if (/^https?:\/\/[^/]+$/i.test(configured)) return configured
  const forwardedHost = cleanString(req.headers['x-forwarded-host'] ?? req.headers.host, 180)
  const forwardedProto = cleanString(req.headers['x-forwarded-proto'], 12) || 'https'
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'https://polydesk.trade'
}

async function publicWatchIdentity(token: unknown) {
  const raw = cleanString(token, 160)
  if (!/^[a-f0-9]{64}$/i.test(raw)) return null
  return (await requirePool().query(
    `select privy_user_id, email, verified_at
       from polymarket_public_watch_tokens
      where token_hash = $1
      limit 1`,
    [watchTokenHash(raw)],
  )).rows[0] ?? null
}

async function sendPublicWatchConfirmation(input: {
  req: Request
  to: string
  token: string
  address: string
  threshold: number
}) {
  const confirmUrl = `${publicWatchOrigin(input.req)}/api/polymarket-portfolio?action=verify-public-watch&token=${encodeURIComponent(input.token)}`
  const shortAddress = `${input.address.slice(0, 6)}...${input.address.slice(-4)}`
  await sendTransactionalEmail({
    to: input.to,
    fromEmail: process.env.POLYMARKET_ALERT_FROM_EMAIL,
    fromName: process.env.POLYMARKET_ALERT_FROM_NAME ?? ALERT_FROM_NAME,
    subject: 'Confirm your PolyDesk portfolio watch',
    text: `Confirm alerts for ${shortAddress}. PolyDesk will alert you when a filled position crosses ${input.threshold}% down or resolves. ${confirmUrl}`,
    html: `<div style="margin:0 auto;max-width:520px;padding:28px;font-family:Inter,Arial,sans-serif;color:#111827">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280">PolyDesk</p>
      <h1 style="margin:0 0 10px;font-size:22px">Confirm portfolio alerts</h1>
      <p style="margin:0 0 18px;color:#4b5563">Watch ${shortAddress} and alert when a filled position crosses ${input.threshold}% down or resolves.</p>
      <a href="${confirmUrl}" style="display:inline-block;border-radius:10px;background:#111827;color:#fff;padding:11px 16px;text-decoration:none;font-size:14px;font-weight:700">Confirm alerts</a>
      <p style="margin:18px 0 0;color:#6b7280;font-size:12px">If you did not request this, ignore this email.</p>
    </div>`,
    context: 'Portfolio watch confirmation',
  })
}

function serializeAlertRecord(row: Record<string, unknown>) {
  const snapshot = row.source_snapshot && typeof row.source_snapshot === 'object'
    ? row.source_snapshot as Record<string, unknown>
    : {}
  return {
    id: Number(row.id),
    alertType: String(row.alert_type),
    marketId: row.market_id ? String(row.market_id) : null,
    title: String(row.title),
    body: row.body ? String(row.body) : null,
    severity: String(row.severity),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : null,
    emailStatus: row.email_status ? String(row.email_status) : 'disabled',
    emailSentAt: row.email_sent_at instanceof Date ? row.email_sent_at.toISOString() : null,
    actionLabel: snapshot.alertActionLabel ? String(snapshot.alertActionLabel) : null,
    actionUrl: snapshot.alertActionUrl ? String(snapshot.alertActionUrl) : null,
  }
}

const SUPPORTED_NETWORKS = new Set(['base', 'arbitrum', 'solana'])

function hasPolymarketRelayerConfig() {
  return Boolean(
    POLYMARKET_RELAYER_URL
    && POLYMARKET_BUILDER_API_KEY
    && POLYMARKET_BUILDER_SECRET
    && POLYMARKET_BUILDER_PASS_PHRASE,
  )
}

async function createDepositWalletClient(ownerAddress: string) {
  if (!hasPolymarketRelayerConfig()) {
    const err = new Error('Polymarket deposit wallet relayer is not configured.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  const [{ RelayClient }, { BuilderConfig }, { createWalletClient, http }, { polygon }] = await Promise.all([
    import('@polymarket/builder-relayer-client'),
    import('@polymarket/builder-signing-sdk'),
    import('viem'),
    import('viem/chains'),
  ])
  const walletClient = createWalletClient({
    account: { address: ownerAddress as `0x${string}`, type: 'json-rpc' },
    chain: polygon,
    transport: http(POLYMARKET_RPC_URL || undefined),
  })
  const builderConfig = new BuilderConfig({
    localBuilderCreds: {
      key: POLYMARKET_BUILDER_API_KEY,
      secret: POLYMARKET_BUILDER_SECRET,
      passphrase: POLYMARKET_BUILDER_PASS_PHRASE,
    },
  })
  return new RelayClient(POLYMARKET_RELAYER_URL, POLYMARKET_CHAIN_ID, walletClient, builderConfig as never, undefined, { chain: polygon })
}

async function ensurePolymarketDepositWallet(ownerAddress: string) {
  const client = await createDepositWalletClient(ownerAddress)
  const depositWalletAddress = await client.deriveDepositWalletAddress()
  const readyWallet = () => ({
    depositWalletAddress,
    depositWalletStatus: 'ready',
    depositWalletTxId: null as string | null,
    depositWalletTxHash: null as string | null,
  })
  let deployed = false
  try {
    deployed = await client.getDeployed(depositWalletAddress, 'WALLET')
  } catch {
    deployed = false
  }
  if (deployed) {
    return readyWallet()
  }
  let response: Awaited<ReturnType<typeof client.deployDepositWallet>>
  try {
    response = await client.deployDepositWallet()
  } catch (err) {
    const message = collectErrorText(err)
    if (message.toLowerCase().includes('wallet already deployed')) {
      try {
        deployed = await client.getDeployed(depositWalletAddress, 'WALLET')
      } catch {
        deployed = true
      }
      if (deployed) return readyWallet()
    }
    throw err
  }
  return {
    depositWalletAddress,
    depositWalletStatus: response.state || 'pending',
    depositWalletTxId: response.transactionID || null,
    depositWalletTxHash: response.transactionHash || null,
  }
}

async function dataApiFetch<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${DATA_API_ORIGIN}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: unknown }).error)
        : text.slice(0, 160)
      throw new Error(message || `Polymarket data-api HTTP ${response.status}`)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

type PolymarketPosition = {
  conditionId?: string
  asset?: string
  market?: string
  eventSlug?: string
  slug?: string
  title?: string
  icon?: string
  outcome?: string
  size?: number
  avgPrice?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
  redeemable?: boolean
  endDate?: string
  curPrice?: number
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function sendPolymarketAlertEmail(input: {
  to: string
  title: string
  body: string
  severity: string
  address: string
  actionLabel: string
  actionUrl: string
}) {
  const subject = input.severity === 'warning'
    ? `Polymarket alert: ${input.title}`
    : `Polymarket update: ${input.title}`
  const text = [
    input.title,
    '',
    input.body,
    '',
    `Profile: ${input.address}`,
    '',
    `${input.actionLabel}: ${input.actionUrl}`,
    '',
    'PolyDesk',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:620px">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280">PolyDesk for Polymarket</p>
      <h2 style="margin:0 0 10px;font-size:20px">${escapeHtml(input.title)}</h2>
      <p style="margin:0 0 14px;color:#4b5563">${escapeHtml(input.body)}</p>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:14px 0;background:#f9fafb">
        <div style="font-size:12px;color:#6b7280">Profile</div>
        <div style="font-family:monospace;font-size:13px;color:#111827">${escapeHtml(input.address)}</div>
      </div>
      <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:700">${escapeHtml(input.actionLabel)}</a>
      <p style="margin:14px 0 0;color:#6b7280;font-size:12px">PolyDesk never closes or claims a position without your signed approval.</p>
    </div>
  `
  await sendTransactionalEmail({
    to: input.to,
    fromEmail: process.env.POLYMARKET_ALERT_FROM_EMAIL,
    fromName: process.env.POLYMARKET_ALERT_FROM_NAME ?? ALERT_FROM_NAME,
    subject,
    text,
    html,
    context: 'Polymarket alert',
  })
}

type AlertEmailDetails = {
  alertId: number
  to: string
  title: string
  body: string
  severity: string
  address: string
  actionLabel: string
  actionUrl: string
}

async function deliverAlertEmail(input: AlertEmailDetails) {
  const client = await requirePool().connect()
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock($1)', [input.alertId])
    const current = (await client.query(
      `select email_status, email_attempts, email_next_attempt_at
         from polymarket_alert_history
        where id = $1
        for update`,
      [input.alertId],
    )).rows[0]
    if (
      !current
      || current.email_status === 'sent'
      || current.email_status === 'disabled'
      || Number(current.email_attempts) >= 5
      || (current.email_next_attempt_at instanceof Date && current.email_next_attempt_at.getTime() > Date.now())
    ) {
      await client.query('commit')
      return
    }
    await client.query(
      `update polymarket_alert_history
          set email_status = 'sending',
              email_attempts = email_attempts + 1,
              email_next_attempt_at = null
        where id = $1`,
      [input.alertId],
    )
    try {
      await sendPolymarketAlertEmail(input)
      await client.query(
        `update polymarket_alert_history
            set email_status = 'sent',
                email_sent_at = now(),
                email_last_error = null,
                email_next_attempt_at = null
          where id = $1`,
        [input.alertId],
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email provider unavailable.'
      await client.query(
        `update polymarket_alert_history
            set email_status = 'failed',
                email_last_error = $2,
                email_next_attempt_at = case
                  when email_attempts < 5 then now() + make_interval(mins => least(60, 5 * email_attempts))
                  else null
                end
          where id = $1`,
        [input.alertId, message.slice(0, 180)],
      )
      console.warn('[polymarket-alert] delivery failed', { alertId: input.alertId, message })
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function retryPendingAlertEmails(privyUserId: string, address: string, to: string | null) {
  if (!to) return
  const rows = (await requirePool().query(
    `select id, title, body, severity, source_snapshot
       from polymarket_alert_history
      where privy_user_id = $1
        and email_status in ('pending', 'failed')
        and email_attempts < 5
        and (email_next_attempt_at is null or email_next_attempt_at <= now())
      order by created_at asc
      limit 10`,
    [privyUserId],
  )).rows
  for (const row of rows) {
    const snapshot = row.source_snapshot && typeof row.source_snapshot === 'object'
      ? row.source_snapshot as Record<string, unknown>
      : {}
    await deliverAlertEmail({
      alertId: Number(row.id),
      to,
      title: String(row.title),
      body: String(row.body ?? ''),
      severity: String(row.severity),
      address,
      actionLabel: String(snapshot.alertActionLabel || 'Review position'),
      actionUrl: String(snapshot.alertActionUrl || 'https://polymarket.com/portfolio'),
    })
  }
}

function localPolymarketBuilderConfig() {
  if (!POLYMARKET_BUILDER_API_KEY || !POLYMARKET_BUILDER_SECRET || !POLYMARKET_BUILDER_PASS_PHRASE) return null
  return new BuilderConfig({
    localBuilderCreds: {
      key: POLYMARKET_BUILDER_API_KEY,
      secret: POLYMARKET_BUILDER_SECRET,
      passphrase: POLYMARKET_BUILDER_PASS_PHRASE,
    },
  })
}

type BuilderAttributedOrder = {
  id?: string
  orderID?: string
  market?: string
  asset_id?: string
  maker_address?: string
  owner?: string
  status?: string
  original_size?: string | number
  size_matched?: string | number
}

async function fetchBuilderAttributedOrder(orderId: string) {
  const config = localPolymarketBuilderConfig()
  if (!config) throw new Error('Polymarket builder credentials are not configured.')
  const path = `/order/${orderId}`
  const headers = await config.generateBuilderHeaders('GET', path)
  if (!headers) throw new Error('Could not authorize the Polymarket order check.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${CLOB_API_ORIGIN}${path}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
      },
    })
    if (!response.ok) {
      throw new Error(`Polymarket order check returned HTTP ${response.status}.`)
    }
    return await response.json() as BuilderAttributedOrder
  } finally {
    clearTimeout(timer)
  }
}

function serializeLpOrder(row: Record<string, unknown>) {
  return {
    orderId: String(row.order_id),
    positionAddress: String(row.position_address),
    marketId: row.market_id ? String(row.market_id) : null,
    assetId: row.asset_id ? String(row.asset_id) : null,
    marketTitle: String(row.market_title),
    marketUrl: String(row.market_url),
    outcome: row.outcome ? String(row.outcome) : null,
    side: String(row.side),
    price: row.price == null ? null : Number(row.price),
    originalSize: row.original_size == null ? null : Number(row.original_size),
    matchedSize: Number(row.matched_size || 0),
    status: String(row.status),
    lastCheckedAt: row.last_checked_at instanceof Date ? row.last_checked_at.toISOString() : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
  }
}

async function insertLpLifecycleAlerts(input: {
  ownerPrivyUserId: string
  positionAddress: string
  orderId: string
  marketId: string
  marketTitle: string
  marketUrl: string
  outcome: string
  lifecycle: 'partial' | 'filled' | 'cancelled' | 'expired'
  matchedSize: number
  originalSize: number
}) {
  const recipients = (await requirePool().query(
    `select distinct p.privy_user_id,
            s.alert_email,
            s.alert_email_verified
       from polymarket_profiles p
       left join polymarket_alert_settings s on s.privy_user_id = p.privy_user_id
      where p.privy_user_id = $1
         or (
           lower(coalesce(p.watched_address, p.polymarket_address)) = lower($2)
           and s.alert_email_verified = true
         )`,
    [input.ownerPrivyUserId, input.positionAddress],
  )).rows
  const label = input.outcome ? `${input.outcome} order` : 'LP order'
  const content = input.lifecycle === 'partial'
    ? {
        title: `${label} partly matched`,
        body: `${input.matchedSize.toLocaleString()} of ${input.originalSize.toLocaleString()} shares have matched.`,
        severity: 'info',
      }
    : input.lifecycle === 'filled'
      ? {
          title: `${label} fully matched`,
          body: `Your ${input.marketTitle} order is now a filled position.`,
          severity: 'success',
        }
      : input.lifecycle === 'cancelled'
        ? {
            title: `${label} cancelled`,
            body: input.matchedSize > 0
              ? `${input.matchedSize.toLocaleString()} shares matched before the remaining order was cancelled.`
              : 'The resting order was cancelled before it matched.',
            severity: 'info',
          }
        : {
            title: `${label} expired`,
            body: input.matchedSize > 0
              ? `${input.matchedSize.toLocaleString()} shares matched before the remaining order expired.`
              : 'The resting order expired before it matched.',
            severity: 'info',
          }

  for (const recipient of recipients) {
    const isOwnerProfile = String(recipient.privy_user_id) === input.ownerPrivyUserId
    const email = !isOwnerProfile && recipient.alert_email_verified && recipient.alert_email
      ? String(recipient.alert_email)
      : null
    await requirePool().query(
      `insert into polymarket_alert_history
        (privy_user_id, alert_type, market_id, title, body, severity, source_snapshot, email_status)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       on conflict do nothing`,
      [
        recipient.privy_user_id,
        `lp-order-${input.lifecycle}`,
        input.marketId || input.orderId,
        content.title,
        content.body,
        content.severity,
        JSON.stringify({
          orderId: input.orderId,
          positionAddress: input.positionAddress,
          lifecycle: input.lifecycle,
          matchedSize: input.matchedSize,
          originalSize: input.originalSize,
          alertActionLabel: 'View market',
          alertActionUrl: input.marketUrl,
        }),
        email ? 'pending' : 'disabled',
      ],
    )
    if (email) {
      await retryPendingAlertEmails(String(recipient.privy_user_id), input.positionAddress, email)
    }
  }
}

export async function reconcilePolymarketLpOrders() {
  if (!pool || !localPolymarketBuilderConfig()) return
  await ensureSchema()
  const orders = (await requirePool().query(
    `select *
       from polymarket_lp_order_watch
      where status in ('live', 'partial')
      order by coalesce(last_checked_at, created_at) asc
      limit 100`,
  )).rows

  for (let offset = 0; offset < orders.length; offset += 4) {
    await Promise.all(orders.slice(offset, offset + 4).map(async row => {
      const orderId = String(row.order_id)
      try {
        const remote = await fetchBuilderAttributedOrder(orderId)
        const reportedAddress = cleanString(remote.maker_address ?? remote.owner, 64)
        if (reportedAddress && isAddress(reportedAddress) && reportedAddress.toLowerCase() !== String(row.position_address).toLowerCase()) {
          console.warn('[polymarket-alert] attributed order address mismatch', { orderId })
          return
        }
        const originalSize = Number(remote.original_size ?? row.original_size ?? 0)
        const matchedSize = Number(remote.size_matched ?? row.matched_size ?? 0)
        const lifecycle = normalizeLpOrderLifecycle({
          status: remote.status,
          originalSize,
          matchedSize,
        })
        const previous = String(row.status)
        await requirePool().query(
          `update polymarket_lp_order_watch
              set market_id = coalesce(nullif($2, ''), market_id),
                  asset_id = coalesce(nullif($3, ''), asset_id),
                  original_size = case when $4 > 0 then $4 else original_size end,
                  matched_size = greatest(0, $5),
                  status = $6,
                  last_checked_at = now(),
                  updated_at = now()
            where order_id = $1`,
          [
            orderId,
            cleanString(remote.market, 96),
            cleanString(remote.asset_id, 128),
            Number.isFinite(originalSize) ? originalSize : 0,
            Number.isFinite(matchedSize) ? matchedSize : 0,
            lifecycle,
          ],
        )
        if (lifecycle !== previous && lifecycle !== 'live') {
          await insertLpLifecycleAlerts({
            ownerPrivyUserId: String(row.owner_privy_user_id),
            positionAddress: String(row.position_address),
            orderId,
            marketId: cleanString(remote.market ?? row.market_id, 96),
            marketTitle: String(row.market_title),
            marketUrl: String(row.market_url),
            outcome: String(row.outcome ?? ''),
            lifecycle,
            matchedSize: Number.isFinite(matchedSize) ? matchedSize : 0,
            originalSize: Number.isFinite(originalSize) ? originalSize : 0,
          })
        }
      } catch (error) {
        console.warn('[polymarket-alert] LP order reconciliation failed', {
          orderId,
          message: error instanceof Error ? error.message : 'unknown_error',
        })
      }
    }))
  }
}

async function loadProfileBundle(privyUserId: string) {
  await ensureSchema()
  const profile = (await requirePool().query(
    'select * from polymarket_profiles where privy_user_id = $1 limit 1',
    [privyUserId],
  )).rows[0]
  if (!profile) {
    return { profile: null, settings: null, watchlist: [], fundingAttempts: [], alerts: [], lpOrders: [] }
  }
  const [settingsRes, watchRes, fundRes, alertsRes, lpOrdersRes] = await Promise.all([
    requirePool().query('select * from polymarket_alert_settings where privy_user_id = $1 limit 1', [privyUserId]),
    requirePool().query('select * from polymarket_watchlist where privy_user_id = $1 order by created_at desc', [privyUserId]),
    requirePool().query('select * from polymarket_funding_attempts where privy_user_id = $1 order by created_at desc limit 25', [privyUserId]),
    requirePool().query('select * from polymarket_alert_history where privy_user_id = $1 order by created_at desc limit 50', [privyUserId]),
    requirePool().query(
      `select o.*
         from polymarket_lp_order_watch o
        where o.owner_privy_user_id = $1
           or lower(o.position_address) = lower(coalesce($2, ''))
        order by o.created_at desc
        limit 50`,
      [privyUserId, profile.watched_address],
    ),
  ])
  return {
    profile: {
      polymarketAddress: profile.polymarket_address as string,
      watchedAddress: profile.watched_address
        ? String(profile.watched_address)
        : profile.trading_address
          ? null
          : String(profile.polymarket_address),
      tradingAddress: profile.trading_address ? String(profile.trading_address) : null,
      depositWalletAddress: profile.deposit_wallet_address ? String(profile.deposit_wallet_address) : null,
      depositWalletStatus: profile.deposit_wallet_status ? String(profile.deposit_wallet_status) : null,
      depositWalletTxId: profile.deposit_wallet_tx_id ? String(profile.deposit_wallet_tx_id) : null,
      depositWalletTxHash: profile.deposit_wallet_tx_hash ? String(profile.deposit_wallet_tx_hash) : null,
      // Clamp to a known network so a stale/corrupt value doesn't reach the
      // bridge call with a confusing 502.
      preferredFundingNetwork: SUPPORTED_NETWORKS.has(String(profile.preferred_funding_network))
        ? String(profile.preferred_funding_network)
        : 'base',
      telegramOwner: profile.telegram_owner ? String(profile.telegram_owner) : null,
      telegramId: profile.telegram_id ? String(profile.telegram_id) : null,
      lastSyncedAt: profile.last_synced_at instanceof Date ? profile.last_synced_at.toISOString() : null,
      createdAt: profile.created_at instanceof Date ? profile.created_at.toISOString() : null,
    },
    settings: settingsRes.rows[0]
      ? {
          lossThresholdPercent: Number(settingsRes.rows[0].loss_threshold_percent),
          resolvedAlertsEnabled: Boolean(settingsRes.rows[0].resolved_alerts_enabled),
          claimableAlertsEnabled: Boolean(settingsRes.rows[0].claimable_alerts_enabled),
          newPositionAlertsEnabled: Boolean(settingsRes.rows[0].new_position_alerts_enabled),
          movementAlertsEnabled: Boolean(settingsRes.rows[0].movement_alerts_enabled),
          alertEmail: settingsRes.rows[0].alert_email_verified && settingsRes.rows[0].alert_email
            ? String(settingsRes.rows[0].alert_email)
            : '',
        }
      : { lossThresholdPercent: 20, resolvedAlertsEnabled: true, claimableAlertsEnabled: true, newPositionAlertsEnabled: false, movementAlertsEnabled: false, alertEmail: '' },
    watchlist: watchRes.rows.map(row => ({
      id: Number(row.id),
      marketId: String(row.market_id),
      marketSlug: row.market_slug ? String(row.market_slug) : null,
      marketUrl: row.market_url ? String(row.market_url) : null,
      label: row.label ? String(row.label) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    })),
    fundingAttempts: fundRes.rows.map(row => ({
      id: Number(row.id),
      requestId: row.request_id ? String(row.request_id) : null,
      network: String(row.network),
      amount: String(row.amount),
      status: String(row.status),
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      depositAddress: row.deposit_address ? String(row.deposit_address) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    })),
    alerts: alertsRes.rows.map(serializeAlertRecord),
    lpOrders: lpOrdersRes.rows.map(serializeLpOrder),
  }
}

async function insertPositionAlert(input: {
  privyUserId: string
  alertType: 'loss-threshold' | 'claimable' | 'resolved-loss' | 'new-position'
  marketId: string
  title: string
  body: string
  severity: 'warning' | 'success' | 'info'
  position: PolymarketPosition
  emailEnabled: boolean
  actionLabel: string
  actionUrl: string
}, runQuery: (text: string, values: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> = (text, values) =>
  requirePool().query(text, values)) {
  const snapshot = {
    ...input.position,
    alertActionLabel: input.actionLabel,
    alertActionUrl: input.actionUrl,
  }
  const result = await runQuery(
    `insert into polymarket_alert_history
      (privy_user_id, alert_type, market_id, title, body, severity, source_snapshot, email_status)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     returning id`,
    [
      input.privyUserId,
      input.alertType,
      input.marketId,
      input.title,
      input.body,
      input.severity,
      JSON.stringify(snapshot),
      input.emailEnabled ? 'pending' : 'disabled',
    ],
  )
  return Number(result.rows[0]?.id || 0)
}

async function evaluateAlerts(privyUserId: string, address: string) {
  await ensureSchema()
  const settingsRow = (await requirePool().query(
    'select * from polymarket_alert_settings where privy_user_id = $1 limit 1',
    [privyUserId],
  )).rows[0]
  if (!settingsRow) return 0
  const lossThreshold = Number(settingsRow.loss_threshold_percent)
  const claimableEnabled = Boolean(settingsRow.claimable_alerts_enabled)
  const newPositionAlertsEnabled = Boolean(settingsRow.new_position_alerts_enabled)
  const positionsInitialized = Boolean(settingsRow.positions_initialized)
  const alertEmail = settingsRow.alert_email_verified && settingsRow.alert_email
    ? String(settingsRow.alert_email)
    : null
  // Treat threshold = 0 as "loss alerts disabled" so users have an off switch
  // without needing a separate flag column.
  const lossAlertsEnabled = Number.isFinite(lossThreshold) && lossThreshold > 0

  let positions: PolymarketPosition[] = []
  try {
    positions = await dataApiFetch<PolymarketPosition[]>(`/positions?user=${encodeURIComponent(address)}&sizeThreshold=0&limit=100`)
    if (!Array.isArray(positions)) positions = []
  } catch {
    return 0
  }
  const trackedLpAssets = new Set((await requirePool().query(
    `select distinct asset_id
       from polymarket_lp_order_watch
      where lower(position_address) = lower($1)
        and asset_id is not null`,
    [address],
  )).rows.map(row => String(row.asset_id)))

  let inserted = 0
  for (const position of positions) {
    const marketId = cleanString(position.conditionId ?? position.market ?? position.asset, 96)
    const assetId = cleanString(position.asset, 128)
    if (!marketId || !assetId) continue
    const title = cleanString(position.title ?? position.slug ?? 'Polymarket position', 160)
    const actionUrl = polymarketPositionUrl(position)
    const client = await requirePool().connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${privyUserId}:${marketId}:${assetId}`])
      const previous = (await client.query(
        `select below_loss_threshold, loss_threshold_percent, resolution_status
           from polymarket_position_alert_state
          where privy_user_id = $1 and market_id = $2 and asset_id = $3`,
        [privyUserId, marketId, assetId],
      )).rows[0]

      const threshold = crossedLossThreshold({
        percentPnl: position.percentPnl,
        thresholdPercent: lossThreshold,
        wasBelowThreshold: Boolean(previous?.below_loss_threshold)
          && Number(previous?.loss_threshold_percent) === lossThreshold,
      })
      const positionSize = typeof position.size === 'number' ? position.size : Number(position.size)
      const claimable = claimableEnabled
        && position.redeemable === true
        && Number.isFinite(positionSize)
        && positionSize > 0
      const shouldAlertClaimable = claimable && previous?.resolution_status !== 'claimable'
        && previous?.resolution_status !== 'lost'
      const alertNewPosition = shouldAlertNewPosition({
        enabled: newPositionAlertsEnabled,
        positionsInitialized,
        positionAlreadyKnown: Boolean(previous) || trackedLpAssets.has(assetId),
        size: positionSize,
      })

      await client.query(
        `insert into polymarket_position_alert_state
          (privy_user_id, market_id, asset_id, position_address, below_loss_threshold, loss_threshold_percent, resolution_status, last_percent_pnl)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (privy_user_id, market_id, asset_id) do update set
           position_address = excluded.position_address,
           below_loss_threshold = excluded.below_loss_threshold,
           loss_threshold_percent = excluded.loss_threshold_percent,
           resolution_status = case
             when polymarket_position_alert_state.resolution_status = 'lost' then 'lost'
             else excluded.resolution_status
           end,
           last_percent_pnl = excluded.last_percent_pnl,
           updated_at = now()`,
        [
          privyUserId,
          marketId,
          assetId,
          address,
          lossAlertsEnabled ? threshold.belowThreshold : false,
          lossAlertsEnabled ? lossThreshold : 0,
          claimable ? 'claimable' : String(previous?.resolution_status || 'open'),
          threshold.percentPnl,
        ],
      )
      if (threshold.shouldAlert) {
        const roundedLoss = Math.abs(Math.round(threshold.percentPnl ?? 0))
        await insertPositionAlert({
          privyUserId,
          alertType: 'loss-threshold',
          marketId,
          title: `${title} is down ${roundedLoss}%`,
          body: `Your position crossed the ${lossThreshold}% loss alert. Review it before deciding whether to close.`,
          severity: 'warning',
          position,
          emailEnabled: Boolean(alertEmail),
          actionLabel: 'Review position',
          actionUrl,
        }, (text, values) => client.query(text, values))
        inserted += 1
      }
      if (alertNewPosition) {
        await insertPositionAlert({
          privyUserId,
          alertType: 'new-position',
          marketId,
          title: `New position: ${title}`,
          body: `${position.outcome || 'A new outcome'} position opened on the watched wallet.`,
          severity: 'info',
          position,
          emailEnabled: Boolean(alertEmail),
          actionLabel: 'View position',
          actionUrl,
        }, (text, values) => client.query(text, values))
        inserted += 1
      }
      if (shouldAlertClaimable) {
        await insertPositionAlert({
          privyUserId,
          alertType: 'claimable',
          marketId,
          title: `Ready to claim: ${title}`,
          body: `Your ${position.outcome || 'winning'} position is confirmed and ready to claim.`,
          severity: 'success',
          position,
          emailEnabled: Boolean(alertEmail),
          actionLabel: 'Claim winnings',
          actionUrl,
        }, (text, values) => client.query(text, values))
        inserted += 1
      }
      await client.query('commit')
      registerPolymarketAlertAsset(assetId)
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  await requirePool().query(
    'update polymarket_alert_settings set positions_initialized = true, updated_at = now() where privy_user_id = $1',
    [privyUserId],
  )
  await retryPendingAlertEmails(privyUserId, address, alertEmail)
  await requirePool().query(
    'update polymarket_profiles set last_synced_at = now(), updated_at = now() where privy_user_id = $1',
    [privyUserId],
  )
  return inserted
}

export async function bootstrapPolymarketAlertMonitor() {
  if (!pool) return [] as string[]
  await ensureSchema()
  const profiles = (await requirePool().query(
    `select p.privy_user_id, coalesce(p.watched_address, p.polymarket_address) as address
       from polymarket_profiles p
       join polymarket_alert_settings s on s.privy_user_id = p.privy_user_id
      where s.alert_email is not null
        and s.alert_email_verified = true
        and (
          s.loss_threshold_percent > 0
          or s.new_position_alerts_enabled = true
          or s.claimable_alerts_enabled = true
          or s.resolved_alerts_enabled = true
        )`,
  )).rows
  for (let offset = 0; offset < profiles.length; offset += 4) {
    await Promise.all(profiles.slice(offset, offset + 4).map(row =>
      evaluateAlerts(String(row.privy_user_id), String(row.address)).catch(error => {
        console.warn('[polymarket-alert] bootstrap evaluation failed', {
          userId: String(row.privy_user_id),
          message: error instanceof Error ? error.message : 'unknown_error',
        })
      }),
    ))
  }
  const assets = (await requirePool().query(
    `select distinct s.asset_id
       from polymarket_position_alert_state s
       join polymarket_profiles p on p.privy_user_id = s.privy_user_id
      where s.resolution_status <> 'lost'
        and lower(s.position_address) = lower(coalesce(p.watched_address, p.polymarket_address))`,
  )).rows
  return assets.map(row => String(row.asset_id)).filter(Boolean)
}

export async function reconcilePolymarketWatchedPortfolios() {
  if (!pool) return
  await ensureSchema()
  const profiles = (await requirePool().query(
    `select p.privy_user_id, coalesce(p.watched_address, p.polymarket_address) as address
       from polymarket_profiles p
       join polymarket_alert_settings s on s.privy_user_id = p.privy_user_id
      where s.alert_email is not null
        and s.alert_email_verified = true
        and (
          s.loss_threshold_percent > 0
          or s.new_position_alerts_enabled = true
          or s.claimable_alerts_enabled = true
          or s.resolved_alerts_enabled = true
        )`,
  )).rows
  for (let offset = 0; offset < profiles.length; offset += 4) {
    await Promise.all(profiles.slice(offset, offset + 4).map(row =>
      evaluateAlerts(String(row.privy_user_id), String(row.address)).catch(error => {
        console.warn('[polymarket-alert] portfolio reconciliation failed', {
          userId: String(row.privy_user_id),
          message: error instanceof Error ? error.message : 'unknown_error',
        })
      }),
    ))
  }
}

export async function evaluatePolymarketAlertAssets(assetIds: string[]) {
  if (!pool || assetIds.length === 0) return
  await ensureSchema()
  const profiles = (await requirePool().query(
    `select distinct s.privy_user_id, coalesce(p.watched_address, p.polymarket_address) as address
      from polymarket_position_alert_state s
       join polymarket_profiles p on p.privy_user_id = s.privy_user_id
      where s.asset_id = any($1::text[])
        and lower(s.position_address) = lower(coalesce(p.watched_address, p.polymarket_address))`,
    [assetIds],
  )).rows
  await Promise.all(profiles.map(row =>
    evaluateAlerts(String(row.privy_user_id), String(row.address)).catch(error => {
      console.warn('[polymarket-alert] live evaluation failed', {
        userId: String(row.privy_user_id),
        message: error instanceof Error ? error.message : 'unknown_error',
      })
    }),
  ))
}

export async function processPolymarketResolutionEvent(event: PolymarketResolutionEvent) {
  if (!pool || !event.market || !event.winningAssetId) return
  await ensureSchema()
  const rows = (await requirePool().query(
    `select s.privy_user_id, s.market_id, s.asset_id, s.resolution_status,
            p.polymarket_address, p.watched_address,
            a.alert_email, a.alert_email_verified, a.resolved_alerts_enabled
       from polymarket_position_alert_state s
      join polymarket_profiles p on p.privy_user_id = s.privy_user_id
       join polymarket_alert_settings a on a.privy_user_id = s.privy_user_id
      where lower(s.market_id) = lower($1)
        and lower(s.position_address) = lower(coalesce(p.watched_address, p.polymarket_address))`,
    [event.market],
  )).rows

  for (const row of rows) {
    const address = String(row.watched_address || row.polymarket_address)
    const alertEmail = row.alert_email_verified && row.alert_email ? String(row.alert_email) : null
    if (String(row.asset_id).toLowerCase() === event.winningAssetId.toLowerCase()) {
      await evaluateAlerts(String(row.privy_user_id), address)
      continue
    }
    if (!row.resolved_alerts_enabled || row.resolution_status === 'lost') continue
    const client = await requirePool().connect()
    let alertId = 0
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [
        `${row.privy_user_id}:${row.market_id}:${row.asset_id}`,
      ])
      const current = (await client.query(
        `select resolution_status
           from polymarket_position_alert_state
          where privy_user_id = $1 and market_id = $2 and asset_id = $3
          for update`,
        [row.privy_user_id, row.market_id, row.asset_id],
      )).rows[0]
      if (current?.resolution_status === 'lost') {
        await client.query('commit')
        continue
      }
      await client.query(
        `update polymarket_position_alert_state
            set resolution_status = 'lost', updated_at = now()
          where privy_user_id = $1 and market_id = $2 and asset_id = $3`,
        [row.privy_user_id, row.market_id, row.asset_id],
      )
      const title = cleanString(event.question || 'Polymarket position', 160)
      const actionUrl = event.slug
        ? `https://polymarket.com/event/${encodeURIComponent(event.slug)}`
        : 'https://polymarket.com/portfolio'
      const inserted = await client.query(
        `insert into polymarket_alert_history
          (privy_user_id, alert_type, market_id, title, body, severity, source_snapshot, email_status)
         values ($1,'resolved-loss',$2,$3,$4,'info',$5::jsonb,$6)
         returning id`,
        [
          row.privy_user_id,
          row.market_id,
          `Result confirmed: ${title}`,
          `${event.winningOutcome} won. This position settled with no payout.`,
          JSON.stringify({
            asset: row.asset_id,
            winningAssetId: event.winningAssetId,
            winningOutcome: event.winningOutcome,
            alertActionLabel: 'View result',
            alertActionUrl: actionUrl,
          }),
          alertEmail ? 'pending' : 'disabled',
        ],
      )
      alertId = Number(inserted.rows[0]?.id || 0)
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
    if (alertId && alertEmail) {
      await retryPendingAlertEmails(String(row.privy_user_id), address, alertEmail)
    }
  }
}

export async function reconcilePolymarketResolutionAlerts() {
  if (!pool) return
  await ensureSchema()
  const markets = (await requirePool().query(
    `select distinct s.market_id
       from polymarket_position_alert_state s
       join polymarket_profiles p on p.privy_user_id = s.privy_user_id
       join polymarket_alert_settings a on a.privy_user_id = s.privy_user_id
      where s.resolution_status = 'open'
        and lower(s.position_address) = lower(coalesce(p.watched_address, p.polymarket_address))
        and (a.claimable_alerts_enabled = true or a.resolved_alerts_enabled = true)
      limit 500`,
  )).rows

  for (let offset = 0; offset < markets.length; offset += 4) {
    await Promise.all(markets.slice(offset, offset + 4).map(async row => {
      const marketId = String(row.market_id)
      if (!/^0x[a-fA-F0-9]{64}$/.test(marketId)) return
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(`${CLOB_API_ORIGIN}/markets/${encodeURIComponent(marketId)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const market = await response.json() as {
          closed?: boolean
          question?: string
          market_slug?: string
          tokens?: Array<{ token_id?: string; outcome?: string; winner?: boolean }>
        }
        const winners = Array.isArray(market.tokens)
          ? market.tokens.filter(token => token.winner === true && token.token_id)
          : []
        if (market.closed !== true || winners.length !== 1) return
        await processPolymarketResolutionEvent({
          market: marketId,
          winningAssetId: String(winners[0].token_id),
          winningOutcome: String(winners[0].outcome || 'Winning outcome'),
          question: cleanString(market.question, 160) || undefined,
          slug: cleanString(market.market_slug, 180) || undefined,
        })
      } catch (error) {
        console.warn('[polymarket-alert] resolution reconciliation failed', {
          marketId,
          message: error instanceof Error ? error.message : 'unknown_error',
        })
      } finally {
        clearTimeout(timer)
      }
    }))
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    const queryAction = cleanString(req.query.action, 32).toLowerCase()
    const bodyAction = req.method === 'POST' ? cleanString((req.body ?? {}).action, 32).toLowerCase() : ''
    const action = bodyAction || queryAction

    // Public proxy actions — no auth required, used for live read.
    if (req.method === 'GET' && action === 'value') {
      const address = cleanString(req.query.address, 64)
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Provide a valid 0x Polymarket address.' })
      const data = await dataApiFetch<unknown>(`/value?user=${encodeURIComponent(address)}`)
      return res.json({ ok: true, value: data })
    }
    if (req.method === 'GET' && action === 'positions') {
      const address = cleanString(req.query.address, 64)
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Provide a valid 0x Polymarket address.' })
      const sizeThreshold = cleanString(req.query.sizeThreshold, 12) || '1'
      const limit = cleanString(req.query.limit, 6) || '50'
      const url = `/positions?user=${encodeURIComponent(address)}&sizeThreshold=${encodeURIComponent(sizeThreshold)}&limit=${encodeURIComponent(limit)}`
      const data = await dataApiFetch<unknown>(url)
      return res.json({ ok: true, positions: Array.isArray(data) ? data : [] })
    }
    if (req.method === 'GET' && action === 'activity') {
      const address = cleanString(req.query.address, 64)
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Provide a valid 0x Polymarket address.' })
      const requestedLimit = Number(req.query.limit ?? 50)
      const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 50
      const data = await dataApiFetch<unknown>(`/activity?user=${encodeURIComponent(address)}&limit=${limit}&sortBy=TIMESTAMP&sortDirection=DESC`)
      return res.json({ ok: true, activity: Array.isArray(data) ? data : [] })
    }

    if (req.method === 'GET' && action === 'verify-public-watch') {
      await ensureSchema()
      const token = cleanString(req.query.token, 160)
      const watch = await publicWatchIdentity(token)
      if (!watch) return res.status(400).send('This portfolio confirmation link is invalid.')
      const client = await requirePool().connect()
      try {
        await client.query('begin')
        await client.query(
          `update polymarket_public_watch_tokens
              set verified_at = now(), updated_at = now()
            where privy_user_id = $1`,
          [watch.privy_user_id],
        )
        await client.query(
          `update polymarket_alert_settings
              set alert_email = $2, alert_email_verified = true, updated_at = now()
            where privy_user_id = $1`,
          [watch.privy_user_id, watch.email],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
      const profile = (await requirePool().query(
        'select coalesce(watched_address, polymarket_address) as address from polymarket_profiles where privy_user_id = $1',
        [watch.privy_user_id],
      )).rows[0]
      if (profile?.address) void evaluateAlerts(String(watch.privy_user_id), String(profile.address))
      return res.redirect(302, `${publicWatchOrigin(req)}/?service=portfolio&portfolio=watch&watchToken=${encodeURIComponent(token)}`)
    }

    if (req.method === 'GET' && action === 'public-watch') {
      await ensureSchema()
      const watch = await publicWatchIdentity(req.query.token)
      if (!watch) return res.status(401).json({ ok: false, error: 'This portfolio watch link is invalid.' })
      const bundle = await loadProfileBundle(String(watch.privy_user_id))
      return res.json({
        ok: true,
        ...bundle,
        verifiedEmail: watch.verified_at ? String(watch.email) : '',
        emailConfirmationPending: !watch.verified_at,
      })
    }

    if (req.method === 'POST' && action === 'create-public-watch') {
      await ensureSchema()
      const body = (req.body ?? {}) as Record<string, unknown>
      const address = cleanString(body.address, 64)
      const email = cleanEmail(body.email)
      const threshold = Math.max(1, Math.min(95, Math.round(Number(body.lossThresholdPercent ?? 20))))
      const newPositionAlertsEnabled = Boolean(body.newPositionAlertsEnabled)
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Enter a valid public Polymarket wallet.' })
      if (!email) return res.status(400).json({ ok: false, error: 'Enter an email you can confirm.' })
      const watchId = randomUUID()
      const token = randomBytes(32).toString('hex')
      const publicId = `public-watch:${watchId}`
      const client = await requirePool().connect()
      try {
        await client.query('begin')
        await client.query(
          `insert into polymarket_profiles
            (privy_user_id, polymarket_address, watched_address, preferred_funding_network)
           values ($1,$2,$2,'base')`,
          [publicId, address],
        )
        await client.query(
          `insert into polymarket_alert_settings
            (privy_user_id, loss_threshold_percent, resolved_alerts_enabled, claimable_alerts_enabled, new_position_alerts_enabled, alert_email, alert_email_verified)
           values ($1,$2,true,true,$3,null,false)`,
          [publicId, threshold, newPositionAlertsEnabled],
        )
        await client.query(
          `insert into polymarket_public_watch_tokens
            (watch_id, privy_user_id, token_hash, email)
           values ($1,$2,$3,$4)`,
          [watchId, publicId, watchTokenHash(token), email],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
      try {
        await sendPublicWatchConfirmation({ req, to: email, token, address, threshold })
      } catch (error) {
        await requirePool().query('delete from polymarket_profiles where privy_user_id = $1', [publicId]).catch(() => undefined)
        throw error
      }
      return res.status(202).json({
        ok: true,
        pending: true,
        address,
        lossThresholdPercent: threshold,
        message: 'Check your email to confirm alerts.',
      })
    }

    if (req.method === 'POST' && action === 'mark-public-alert-read') {
      await ensureSchema()
      const body = (req.body ?? {}) as Record<string, unknown>
      const watch = await publicWatchIdentity(body.token)
      const alertId = Number(body.alertId)
      if (!watch) return res.status(401).json({ ok: false, error: 'This portfolio watch link is invalid.' })
      if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ ok: false, error: 'alertId is required.' })
      await requirePool().query(
        'update polymarket_alert_history set read_at = now() where id = $1 and privy_user_id = $2',
        [alertId, watch.privy_user_id],
      )
      return res.json({ ok: true })
    }

    if (req.method === 'POST' && action === 'delete-public-watch') {
      await ensureSchema()
      const body = (req.body ?? {}) as Record<string, unknown>
      const watch = await publicWatchIdentity(body.token)
      if (!watch) return res.status(401).json({ ok: false, error: 'This portfolio watch link is invalid.' })
      await requirePool().query('delete from polymarket_profiles where privy_user_id = $1', [watch.privy_user_id])
      return res.json({ ok: true })
    }

    if (req.method === 'POST' && action === 'update-public-watch') {
      await ensureSchema()
      const body = (req.body ?? {}) as Record<string, unknown>
      const token = cleanString(body.token, 160)
      const watch = await publicWatchIdentity(token)
      if (!watch) return res.status(401).json({ ok: false, error: 'This portfolio watch link is invalid.' })
      const threshold = Math.max(0, Math.min(95, Math.round(Number(body.lossThresholdPercent ?? 20))))
      const resolved = Boolean(body.resolvedAlertsEnabled)
      const claimable = Boolean(body.claimableAlertsEnabled)
      const newPositionAlertsEnabled = Boolean(body.newPositionAlertsEnabled)
      const email = cleanEmail(body.alertEmail)
      if (!email) return res.status(400).json({ ok: false, error: 'Enter an email you can confirm.' })
      const emailChanged = String(watch.email).toLowerCase() !== email
      const verified = !emailChanged && Boolean(watch.verified_at)
      const client = await requirePool().connect()
      try {
        await client.query('begin')
        await client.query(
          `update polymarket_public_watch_tokens
              set email = $2,
                  verified_at = case when $3 then verified_at else null end,
                  updated_at = now()
            where privy_user_id = $1`,
          [watch.privy_user_id, email, verified],
        )
        await client.query(
          `update polymarket_alert_settings
              set loss_threshold_percent = $2,
                  resolved_alerts_enabled = $3,
                  claimable_alerts_enabled = $4,
                  new_position_alerts_enabled = $5,
                  alert_email = case when $6 then $7 else null end,
                  alert_email_verified = $6,
                  updated_at = now()
            where privy_user_id = $1`,
          [watch.privy_user_id, threshold, resolved, claimable, newPositionAlertsEnabled, verified, email],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
      if (!verified) {
        const profile = (await requirePool().query(
          'select coalesce(watched_address, polymarket_address) as address from polymarket_profiles where privy_user_id = $1',
          [watch.privy_user_id],
        )).rows[0]
        await sendPublicWatchConfirmation({
          req,
          to: email,
          token,
          address: String(profile?.address ?? ''),
          threshold,
        })
      }
      const bundle = await loadProfileBundle(String(watch.privy_user_id))
      return res.json({
        ok: true,
        ...bundle,
        verifiedEmail: verified ? email : '',
        emailConfirmationPending: !verified,
      })
    }

    // All persistence actions require Privy auth.
    let privyUserId: string
    let verifiedEmail = ''
    try {
      const needsVerifiedEmail = action === 'save-alert-settings'
        || action === 'save-profile'
        || (req.method === 'GET' && (action === 'profile' || action === ''))
      const session = await verifiedPrivySession(req, needsVerifiedEmail)
      privyUserId = session.userId
      verifiedEmail = session.email
    } catch (err) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 401).json({ ok: false, error: e.message || 'Privy auth failed.' })
    }

    await ensureSchema()

    if (req.method === 'GET' && (action === 'profile' || action === '')) {
      const emailReconcile = await requirePool().query(
        `update polymarket_alert_settings
            set alert_email_verified = false,
                alert_email = null,
                updated_at = now()
          where privy_user_id = $1
            and alert_email_verified = true
            and lower(coalesce(alert_email, '')) <> lower($2)`,
        [privyUserId, verifiedEmail],
      )
      if ((emailReconcile.rowCount ?? 0) > 0) {
        await requirePool().query(
          `update polymarket_alert_history
              set email_status = 'disabled', email_next_attempt_at = null
            where privy_user_id = $1 and email_status in ('pending', 'failed')`,
          [privyUserId],
        )
      }
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle, verifiedEmail })
    }

    if (req.method === 'GET' && action === 'funding-attempts') {
      const rows = (await requirePool().query(
        'select * from polymarket_funding_attempts where privy_user_id = $1 order by created_at desc limit 50',
        [privyUserId],
      )).rows
      return res.json({ ok: true, fundingAttempts: rows })
    }

    if (req.method === 'GET' && action === 'alert-history') {
      const rows = (await requirePool().query(
        'select * from polymarket_alert_history where privy_user_id = $1 order by created_at desc limit 100',
        [privyUserId],
      )).rows
      return res.json({ ok: true, alerts: rows.map(serializeAlertRecord) })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const body = (req.body ?? {}) as Record<string, unknown>

    if (action === 'register-lp-order') {
      const orderId = cleanString(body.orderId, 96)
      const positionAddress = cleanString(body.positionAddress, 64)
      const marketId = cleanString(body.marketId, 96)
      const assetId = cleanString(body.assetId, 128)
      const marketTitle = cleanString(body.marketTitle, 180)
      const marketUrl = cleanString(body.marketUrl, 320)
      const outcome = cleanString(body.outcome, 24).toUpperCase()
      const side = cleanString(body.side, 8).toUpperCase() || 'BUY'
      const price = Number(body.price)
      const originalSize = Number(body.originalSize)
      if (!/^0x[a-fA-F0-9]{64}$/.test(orderId)) {
        return res.status(400).json({ ok: false, error: 'A valid Polymarket order ID is required.' })
      }
      if (!isAddress(positionAddress)) {
        return res.status(400).json({ ok: false, error: 'A valid Polymarket trading account is required.' })
      }
      if (!marketTitle || !marketUrl) {
        return res.status(400).json({ ok: false, error: 'Market details are required.' })
      }
      try {
        const parsed = new URL(marketUrl)
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'polymarket.com') throw new Error()
      } catch {
        return res.status(400).json({ ok: false, error: 'Use the canonical Polymarket market URL.' })
      }
      if (!Number.isFinite(price) || price <= 0 || price >= 1 || !Number.isFinite(originalSize) || originalSize <= 0) {
        return res.status(400).json({ ok: false, error: 'Valid order price and size are required.' })
      }
      const profile = (await requirePool().query(
        `select deposit_wallet_address
           from polymarket_profiles
          where privy_user_id = $1
          limit 1`,
        [privyUserId],
      )).rows[0]
      if (
        !profile?.deposit_wallet_address
        || String(profile.deposit_wallet_address).toLowerCase() !== positionAddress.toLowerCase()
      ) {
        return res.status(403).json({ ok: false, error: 'This trading account is not linked to the signed-in PolyDesk profile.' })
      }
      const result = await requirePool().query(
        `insert into polymarket_lp_order_watch
          (order_id, owner_privy_user_id, position_address, market_id, asset_id, market_title, market_url, outcome, side, price, original_size)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (order_id) do update set
           market_id = coalesce(polymarket_lp_order_watch.market_id, excluded.market_id),
           asset_id = coalesce(polymarket_lp_order_watch.asset_id, excluded.asset_id),
           market_title = excluded.market_title,
           market_url = excluded.market_url,
           outcome = excluded.outcome,
           price = excluded.price,
           original_size = excluded.original_size,
           updated_at = now()
         where polymarket_lp_order_watch.owner_privy_user_id = excluded.owner_privy_user_id
           and lower(polymarket_lp_order_watch.position_address) = lower(excluded.position_address)
         returning *`,
        [
          orderId,
          privyUserId,
          positionAddress,
          marketId || null,
          assetId || null,
          marketTitle,
          marketUrl,
          outcome || null,
          side === 'SELL' ? 'SELL' : 'BUY',
          price,
          originalSize,
        ],
      )
      if (!result.rows[0]) {
        return res.status(409).json({ ok: false, error: 'This order is already registered to another trading account.' })
      }
      void reconcilePolymarketLpOrders()
      return res.status(201).json({ ok: true, order: serializeLpOrder(result.rows[0]) })
    }

    if (action === 'mark-lp-order-cancelled') {
      const orderId = cleanString(body.orderId, 96)
      if (!/^0x[a-fA-F0-9]{64}$/.test(orderId)) {
        return res.status(400).json({ ok: false, error: 'A valid Polymarket order ID is required.' })
      }
      const row = (await requirePool().query(
        `update polymarket_lp_order_watch
            set status = 'cancelled', last_checked_at = now(), updated_at = now()
          where order_id = $1
            and owner_privy_user_id = $2
            and status in ('live', 'partial')
          returning *`,
        [orderId, privyUserId],
      )).rows[0]
      if (!row) return res.json({ ok: true, monitored: false })
      await insertLpLifecycleAlerts({
        ownerPrivyUserId: privyUserId,
        positionAddress: String(row.position_address),
        orderId,
        marketId: cleanString(row.market_id, 96),
        marketTitle: String(row.market_title),
        marketUrl: String(row.market_url),
        outcome: String(row.outcome ?? ''),
        lifecycle: 'cancelled',
        matchedSize: Number(row.matched_size || 0),
        originalSize: Number(row.original_size || 0),
      })
      return res.json({ ok: true, monitored: true })
    }

    if (action === 'save-profile') {
      const address = cleanString(body.address, 64)
      const network = cleanString(body.fundingNetwork, 12) || 'base'
      const mode = cleanString(body.mode, 16) || 'watch'
      const telegramOwner = cleanString(body.telegramOwner, 96) || null
      const telegramId = cleanString(body.telegramId, 48) || null
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Provide a valid 0x Polymarket address.' })
      if (!SUPPORTED_NETWORKS.has(network)) return res.status(400).json({ ok: false, error: 'Unsupported funding network.' })
      const watchedAddress = mode === 'trading' ? null : address
      const tradingAddress = mode === 'trading' ? address : null
      await requirePool().query(
        `insert into polymarket_profiles (privy_user_id, polymarket_address, watched_address, trading_address, preferred_funding_network, telegram_owner, telegram_id)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (privy_user_id) do update set
           polymarket_address = case
             when $8 = 'trading' and coalesce(polymarket_profiles.watched_address, '') <> '' then polymarket_profiles.polymarket_address
             else excluded.polymarket_address
           end,
           watched_address = coalesce(excluded.watched_address, polymarket_profiles.watched_address),
           trading_address = coalesce(excluded.trading_address, polymarket_profiles.trading_address),
           preferred_funding_network = excluded.preferred_funding_network,
           telegram_owner = coalesce(excluded.telegram_owner, polymarket_profiles.telegram_owner),
           telegram_id = coalesce(excluded.telegram_id, polymarket_profiles.telegram_id),
           updated_at = now()`,
        [privyUserId, address, watchedAddress, tradingAddress, network, telegramOwner, telegramId, mode],
      )
      await requirePool().query(
        `insert into polymarket_alert_settings (privy_user_id) values ($1)
         on conflict (privy_user_id) do nothing`,
        [privyUserId],
      )
      if (mode === 'watch') {
        const loss = Math.max(0, Math.min(95, Math.round(Number(body.lossThresholdPercent ?? 20))))
        const emailAlertsEnabled = Boolean(body.emailAlertsEnabled)
        await requirePool().query(
          `update polymarket_alert_settings
              set loss_threshold_percent = $2,
                  alert_email = $3,
                  alert_email_verified = $4,
                  updated_at = now()
            where privy_user_id = $1`,
          [privyUserId, loss, emailAlertsEnabled && verifiedEmail ? verifiedEmail : null, emailAlertsEnabled && Boolean(verifiedEmail)],
        )
      }
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle, verifiedEmail })
    }

    if (action === 'ensure-deposit-wallet') {
      const ownerAddress = cleanString(body.ownerAddress, 64)
      if (!isAddress(ownerAddress)) return res.status(400).json({ ok: false, error: 'Provide a valid owner wallet address.' })
      const profileRow = (await requirePool().query(
        'select trading_address, deposit_wallet_address, deposit_wallet_status from polymarket_profiles where privy_user_id = $1',
        [privyUserId],
      )).rows[0]
      if (profileRow?.trading_address && String(profileRow.trading_address).toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(409).json({ ok: false, error: 'Connect the saved Main Wallet before activating Polymarket wallet.' })
      }
      const wallet = await ensurePolymarketDepositWallet(ownerAddress)
      await requirePool().query(
        `insert into polymarket_profiles
          (privy_user_id, polymarket_address, trading_address, deposit_wallet_address, deposit_wallet_status, deposit_wallet_tx_id, deposit_wallet_tx_hash)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (privy_user_id) do update set
           trading_address = coalesce(polymarket_profiles.trading_address, excluded.trading_address),
           deposit_wallet_address = excluded.deposit_wallet_address,
           deposit_wallet_status = excluded.deposit_wallet_status,
           deposit_wallet_tx_id = excluded.deposit_wallet_tx_id,
           deposit_wallet_tx_hash = excluded.deposit_wallet_tx_hash,
           updated_at = now()`,
        [
          privyUserId,
          ownerAddress,
          ownerAddress,
          wallet.depositWalletAddress,
          wallet.depositWalletStatus,
          wallet.depositWalletTxId,
          wallet.depositWalletTxHash,
        ],
      )
      await requirePool().query(
        `insert into polymarket_alert_settings (privy_user_id) values ($1)
         on conflict (privy_user_id) do nothing`,
        [privyUserId],
      )
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle })
    }

    if (action === 'verify-deposit-wallet') {
      const ownerAddress = cleanString(body.ownerAddress, 64)
      const depositWalletAddress = cleanString(body.depositWalletAddress, 64)
      if (!isAddress(ownerAddress) || !isAddress(depositWalletAddress)) {
        return res.status(400).json({ ok: false, error: 'Provide valid owner and Polymarket wallet addresses.' })
      }
      const profileRow = (await requirePool().query(
        'select trading_address, deposit_wallet_address, deposit_wallet_status from polymarket_profiles where privy_user_id = $1',
        [privyUserId],
      )).rows[0]
      if (!profileRow?.trading_address || String(profileRow.trading_address).toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(409).json({ ok: false, error: 'Connect the saved Main Wallet before trading.' })
      }
      const wallet = await ensurePolymarketDepositWallet(ownerAddress)
      await requirePool().query(
        `update polymarket_profiles
            set deposit_wallet_address = $2,
                deposit_wallet_status = $3,
                deposit_wallet_tx_id = $4,
                deposit_wallet_tx_hash = $5,
                updated_at = now()
          where privy_user_id = $1`,
        [
          privyUserId,
          wallet.depositWalletAddress,
          wallet.depositWalletStatus,
          wallet.depositWalletTxId,
          wallet.depositWalletTxHash,
        ],
      )
      if (wallet.depositWalletAddress.toLowerCase() !== depositWalletAddress.toLowerCase()) {
        return res.status(409).json({
          ok: false,
          error: 'Your saved Polymarket wallet was stale and has been refreshed. Try the trade again.',
          profile: (await loadProfileBundle(privyUserId)).profile,
        })
      }
      if (String(wallet.depositWalletStatus || '').toLowerCase() !== 'ready') {
        return res.status(409).json({ ok: false, error: 'Polymarket wallet is not deployed yet. Wait for activation, then retry.' })
      }
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle })
    }

    if (action === 'disconnect') {
      await requirePool().query('delete from polymarket_watchlist where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_funding_attempts where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_alert_history where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_position_alert_state where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_profiles where privy_user_id = $1', [privyUserId])
      return res.json({ ok: true, profile: null, settings: null, watchlist: [], fundingAttempts: [], alerts: [] })
    }

    if (action === 'disconnect-watch') {
      await requirePool().query(
        `update polymarket_profiles
            set watched_address = null,
                polymarket_address = coalesce(trading_address, polymarket_address),
                updated_at = now()
          where privy_user_id = $1`,
        [privyUserId],
      )
      await requirePool().query('delete from polymarket_alert_history where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_position_alert_state where privy_user_id = $1', [privyUserId])
      await requirePool().query(
        `update polymarket_alert_settings
            set loss_threshold_percent = 0,
                resolved_alerts_enabled = false,
                claimable_alerts_enabled = false,
                movement_alerts_enabled = false,
                new_position_alerts_enabled = false,
                positions_initialized = false,
                alert_email = null,
                alert_email_verified = false,
                updated_at = now()
          where privy_user_id = $1`,
        [privyUserId],
      )
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle })
    }

    if (action === 'disconnect-trading') {
      await requirePool().query(
        `update polymarket_profiles
            set trading_address = null,
                deposit_wallet_address = null,
                deposit_wallet_status = null,
                deposit_wallet_tx_id = null,
                deposit_wallet_tx_hash = null,
                updated_at = now()
          where privy_user_id = $1`,
        [privyUserId],
      )
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle })
    }

    if (action === 'save-alert-settings') {
      // 0 means "loss alerts disabled" — see evaluateAlerts. 95 is the
      // generous upper bound (anything beyond is effectively the same as off).
      const loss = Math.max(0, Math.min(95, Math.round(Number(body.lossThresholdPercent ?? 20))))
      const resolved = Boolean(body.resolvedAlertsEnabled)
      const claimable = Boolean(body.claimableAlertsEnabled)
      const newPositionAlertsEnabled = Boolean(body.newPositionAlertsEnabled)
      const movement = false
      const alertEmail = cleanEmail(body.alertEmail)
      if (alertEmail === '') return res.status(400).json({ ok: false, error: 'Enter a valid alert email or leave it blank.' })
      if (alertEmail && (!verifiedEmail || alertEmail !== verifiedEmail)) {
        return res.status(400).json({
          ok: false,
          error: verifiedEmail
            ? 'Use the verified email connected to this PolyDesk account.'
            : 'Connect and verify an email before enabling email alerts.',
        })
      }
      const profileExists = (await requirePool().query('select 1 from polymarket_profiles where privy_user_id = $1 and coalesce(watched_address, polymarket_address) is not null', [privyUserId])).rowCount
      if (!profileExists) return res.status(409).json({ ok: false, error: 'Save a watched Polymarket account first.' })
      await requirePool().query(
        `insert into polymarket_alert_settings
          (privy_user_id, loss_threshold_percent, resolved_alerts_enabled, claimable_alerts_enabled, new_position_alerts_enabled, movement_alerts_enabled, alert_email, alert_email_verified)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (privy_user_id) do update set
           loss_threshold_percent = excluded.loss_threshold_percent,
           resolved_alerts_enabled = excluded.resolved_alerts_enabled,
           claimable_alerts_enabled = excluded.claimable_alerts_enabled,
           new_position_alerts_enabled = excluded.new_position_alerts_enabled,
           movement_alerts_enabled = excluded.movement_alerts_enabled,
           alert_email = excluded.alert_email,
           alert_email_verified = excluded.alert_email_verified,
           updated_at = now()`,
        [privyUserId, loss, resolved, claimable, newPositionAlertsEnabled, movement, alertEmail, Boolean(alertEmail)],
      )
      await requirePool().query(
        `update polymarket_alert_history
            set email_status = 'disabled', email_next_attempt_at = null
          where privy_user_id = $1 and email_status in ('pending', 'failed')`,
        [privyUserId],
      )
      return res.json({
        ok: true,
        settings: {
          lossThresholdPercent: loss,
          resolvedAlertsEnabled: resolved,
          claimableAlertsEnabled: claimable,
          newPositionAlertsEnabled,
          movementAlertsEnabled: movement,
          alertEmail: alertEmail ?? '',
        },
      })
    }

    if (action === 'add-watch') {
      const marketId = cleanString(body.marketId, 96)
      if (!marketId) return res.status(400).json({ ok: false, error: 'marketId is required.' })
      const profileExists = (await requirePool().query('select 1 from polymarket_profiles where privy_user_id = $1 and coalesce(watched_address, polymarket_address) is not null', [privyUserId])).rowCount
      if (!profileExists) return res.status(409).json({ ok: false, error: 'Save a watched Polymarket account first.' })
      const marketSlug = cleanString(body.marketSlug, 160) || null
      const marketUrl = cleanString(body.marketUrl, 280) || null
      const label = cleanString(body.label, 80) || null
      await requirePool().query(
        `insert into polymarket_watchlist (privy_user_id, market_id, market_slug, market_url, label)
         values ($1,$2,$3,$4,$5)
         on conflict (privy_user_id, market_id) do update set
           market_slug = excluded.market_slug,
           market_url = excluded.market_url,
           label = excluded.label`,
        [privyUserId, marketId, marketSlug, marketUrl, label],
      )
      const rows = (await requirePool().query(
        'select * from polymarket_watchlist where privy_user_id = $1 order by created_at desc',
        [privyUserId],
      )).rows
      return res.json({ ok: true, watchlist: rows })
    }

    if (action === 'remove-watch') {
      const marketId = cleanString(body.marketId, 96)
      if (!marketId) return res.status(400).json({ ok: false, error: 'marketId is required.' })
      await requirePool().query(
        'delete from polymarket_watchlist where privy_user_id = $1 and market_id = $2',
        [privyUserId, marketId],
      )
      const rows = (await requirePool().query(
        'select * from polymarket_watchlist where privy_user_id = $1 order by created_at desc',
        [privyUserId],
      )).rows
      return res.json({ ok: true, watchlist: rows })
    }

    if (action === 'log-funding') {
      const network = cleanString(body.network, 12)
      if (!SUPPORTED_NETWORKS.has(network)) return res.status(400).json({ ok: false, error: 'Unsupported funding network.' })
      const amount = cleanAmount(body.amount)
      if (!amount) return res.status(400).json({ ok: false, error: 'Provide a valid funding amount.' })
      const status = cleanString(body.status, 24) || 'pending'
      const requestId = cleanString(body.requestId, 64) || null
      const checkoutId = cleanString(body.checkoutId, 80) || null
      const paymentAttemptId = cleanString(body.paymentAttemptId, 80) || null
      const txHash = cleanString(body.txHash, 96) || null
      const depositAddress = cleanString(body.depositAddress, 96) || null
      const polymarketWallet = cleanString(body.polymarketWallet, 64)
      if (!isAddress(polymarketWallet)) return res.status(400).json({ ok: false, error: 'Provide the funded Polymarket wallet.' })
      const profileRow = (await requirePool().query(
        'select trading_address, deposit_wallet_address from polymarket_profiles where privy_user_id = $1',
        [privyUserId],
      )).rows[0]
      const fundedWallet = profileRow?.deposit_wallet_address ? String(profileRow.deposit_wallet_address) : ''
      if (!profileRow?.trading_address || !fundedWallet || fundedWallet.toLowerCase() !== polymarketWallet.toLowerCase()) {
        return res.status(409).json({ ok: false, error: 'Activate this Polymarket wallet before funding.' })
      }
      if (checkoutId && !/^chk_[a-zA-Z0-9]{8,40}$/.test(checkoutId)) return res.status(400).json({ ok: false, error: 'Invalid hosted checkout id.' })
      if (paymentAttemptId && !/^pat_[a-f0-9]{24}$/.test(paymentAttemptId)) return res.status(400).json({ ok: false, error: 'Invalid payment attempt id.' })
      const inserted = await requirePool().query(
        `insert into polymarket_funding_attempts
          (privy_user_id, polymarket_address, request_id, network, amount, status, tx_hash, deposit_address, checkout_id, payment_attempt_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning id, request_id, network, amount, status, tx_hash, deposit_address, created_at`,
        [privyUserId, polymarketWallet, requestId, network, amount, status, txHash, depositAddress, checkoutId, paymentAttemptId],
      )
      if (checkoutId) {
        const latestEvent = await latestHashPayLinkCheckoutEvent(checkoutId).catch(() => undefined)
        if (latestEvent) await applyHashPayLinkFundingEvent(latestEvent)
      }
      return res.json({ ok: true, fundingAttempt: inserted.rows[0] })
    }

    if (action === 'reconcile-funding') {
      const requestId = cleanString(body.requestId, 64)
      if (!/^pmf_[a-f0-9]{20}$/.test(requestId)) return res.status(400).json({ ok: false, error: 'Provide a valid Hash PayLink funding request.' })
      const attempt = (await requirePool().query(
        `select id, request_id, network, amount, status, tx_hash, deposit_address, polymarket_address, created_at
           from polymarket_funding_attempts
          where privy_user_id = $1 and request_id = $2
          order by created_at desc
          limit 1`,
        [privyUserId, requestId],
      )).rows[0]
      if (!attempt) return res.status(404).json({ ok: false, error: 'Funding attempt not found for this account.' })

      const upstream = await fetchHashPayLinkPolymarketFundingStatus(requestId)
      const funding = upstream.data
      if (upstream.statusCode < 200 || upstream.statusCode >= 300 || !funding.ok) {
        return res.status(502).json({ ok: false, error: funding.error || 'Hash PayLink funding status is unavailable.' })
      }
      if (funding.fundingRequestId !== requestId || !funding.status) {
        return res.status(502).json({ ok: false, error: 'Hash PayLink returned an invalid funding status.' })
      }
      const status = funding.status === 'funded'
        ? 'bridge_complete'
        : funding.status === 'bridging'
          ? 'bridging'
          : funding.status === 'expired'
            ? 'expired'
            : 'pending'
      const txHash = cleanString(funding.bridgeTransaction || funding.paymentTransaction || attempt.tx_hash, 96) || null
      const updated = await requirePool().query(
        `update polymarket_funding_attempts
            set status = $1, tx_hash = $2, updated_at = now()
          where id = $3 and privy_user_id = $4
          returning id, request_id, network, amount, status, tx_hash, deposit_address, created_at`,
        [status, txHash, attempt.id, privyUserId],
      )
      return res.json({
        ok: true,
        status: funding.status,
        receiptUrl: funding.status === 'funded' ? funding.receiptUrl : undefined,
        fundingAttempt: updated.rows[0],
      })
    }

    if (action === 'complete-funding') {
      const network = cleanString(body.network, 12)
      if (!SUPPORTED_NETWORKS.has(network)) return res.status(400).json({ ok: false, error: 'Unsupported funding network.' })
      const amount = cleanAmount(body.amount)
      if (!amount) return res.status(400).json({ ok: false, error: 'Provide a valid funding amount.' })
      const requestId = cleanString(body.requestId, 64) || null
      const txHash = cleanString(body.txHash, 96)
      if (!txHash) return res.status(400).json({ ok: false, error: 'txHash is required.' })
      const depositAddress = cleanString(body.depositAddress, 96) || null
      const polymarketWallet = cleanString(body.polymarketWallet, 64)
      if (!isAddress(polymarketWallet)) return res.status(400).json({ ok: false, error: 'Provide the funded Polymarket wallet.' })
      const bridgeStatus = cleanString(body.bridgeStatus, 32)
      const status = bridgeStatus === 'complete' ? 'bridge_complete' : 'confirmed'
      const profileRow = (await requirePool().query(
        'select trading_address, deposit_wallet_address from polymarket_profiles where privy_user_id = $1',
        [privyUserId],
      )).rows[0]
      const fundedWallet = profileRow?.deposit_wallet_address ? String(profileRow.deposit_wallet_address) : ''
      if (!profileRow?.trading_address || !fundedWallet || fundedWallet.toLowerCase() !== polymarketWallet.toLowerCase()) {
        return res.status(409).json({ ok: false, error: 'Activate this Polymarket wallet before funding.' })
      }

      let updated
      if (requestId) {
        updated = await requirePool().query(
          `update polymarket_funding_attempts
             set status = $1, tx_hash = $2, deposit_address = coalesce($3, deposit_address), updated_at = now()
           where privy_user_id = $4 and request_id = $5 and lower(polymarket_address) = lower($6)
           returning id, request_id, network, amount, status, tx_hash, deposit_address, created_at`,
          [status, txHash, depositAddress, privyUserId, requestId, polymarketWallet],
        )
      }
      if (!updated?.rowCount && depositAddress) {
        updated = await requirePool().query(
          `update polymarket_funding_attempts
             set status = $1, tx_hash = $2, updated_at = now()
           where id = (
             select id from polymarket_funding_attempts
              where privy_user_id = $3 and deposit_address = $4 and lower(polymarket_address) = lower($5)
              order by created_at desc
              limit 1
           )
           returning id, request_id, network, amount, status, tx_hash, deposit_address, created_at`,
          [status, txHash, privyUserId, depositAddress, polymarketWallet],
        )
      }
      if (updated?.rowCount) return res.json({ ok: true, fundingAttempt: updated.rows[0] })

      const inserted = await requirePool().query(
        `insert into polymarket_funding_attempts
          (privy_user_id, polymarket_address, request_id, network, amount, status, tx_hash, deposit_address)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id, request_id, network, amount, status, tx_hash, deposit_address, created_at`,
        [privyUserId, polymarketWallet, requestId, network, amount, status, txHash, depositAddress],
      )
      return res.json({ ok: true, fundingAttempt: inserted.rows[0] })
    }

    if (action === 'mark-alert-read') {
      const alertId = Number(body.alertId)
      if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ ok: false, error: 'alertId is required.' })
      await requirePool().query(
        'update polymarket_alert_history set read_at = now() where id = $1 and privy_user_id = $2',
        [alertId, privyUserId],
      )
      return res.json({ ok: true })
    }

    if (action === 'evaluate-alerts') {
      const profileRow = (await requirePool().query(
        'select coalesce(watched_address, polymarket_address) as polymarket_address from polymarket_profiles where privy_user_id = $1',
        [privyUserId],
      )).rows[0]
      if (!profileRow?.polymarket_address) return res.status(409).json({ ok: false, error: 'Save a watched Polymarket account first.' })
      const inserted = await evaluateAlerts(privyUserId, String(profileRow.polymarket_address))
      const rows = (await requirePool().query(
        'select * from polymarket_alert_history where privy_user_id = $1 order by created_at desc limit 50',
        [privyUserId],
      )).rows
      return res.json({ ok: true, insertedCount: inserted, alerts: rows.map(serializeAlertRecord) })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    const e = err as Error & { status?: number }
    return res.status(e.status ?? 500).json({ ok: false, error: e.message || 'Polymarket portfolio request failed' })
  }
}
