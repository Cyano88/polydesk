import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
import { sendTransactionalEmail } from './email-provider.js'
import { nextPolymarketDigestAt, validDigestTimezone, type PolymarketDigestFrequency } from './polymarket-digest-schedule.js'
import { polymarketIntegrationSource, polymarketPortfolioDestination } from './polymarket-alert-destination.js'
import { ensurePolymarketPortfolioSchema, getPolymarketPortfolioPool } from './polymarket-portfolio.js'

type JsonRecord = Record<string, unknown>

export const MANAGED_AGENT_SCHEMA = 'polydesk-managed-agent-subscription-v1' as const
export const POLYDESK_AGENT_ID = '5427' as const
export const MANAGED_AGENT_LISTING_ID = '38496' as const
export const MANAGED_AGENT_SERVICE_ID = '09b9ee03-1273-4b8e-91df-c713b44c641d' as const

export type ManagedSubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired'
export type ManagedLifecycleEmailType = 'trial_ending' | 'trial_expired' | 'renewal_success' | 'payment_failed'

export type ManagedSubscriptionIdentity = {
  jobId: string
  providerAgentId: typeof POLYDESK_AGENT_ID
  serviceListingId: typeof MANAGED_AGENT_LISTING_ID
  serviceId: typeof MANAGED_AGENT_SERVICE_ID
  buyerAgentId: string
  status: ManagedSubscriptionStatus
  periodStartAt: string
  periodEndAt: string
}

export type ManagedPreferences = {
  address: string
  email: string
  integrationSource: 'okx-ai' | 'circle-marketplace' | 'polydesk'
  lossThresholdPercent: number
  profitThresholdPercent: number
  newPositionAlertsEnabled: boolean
  resolvedAlertsEnabled: boolean
  claimableAlertsEnabled: boolean
  digestFrequency: PolymarketDigestFrequency
  digestTimezone: string
  digestHourLocal: number
  digestWeekday: number
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function onlyFields(value: JsonRecord, allowed: readonly string[], label: string) {
  const accepted = new Set(allowed)
  const unknown = Object.keys(value).find(key => !accepted.has(key))
  if (unknown) throw new Error(`Unsupported ${label} field: ${unknown}.`)
}

function hasSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecretField)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, item]) => (
    /(private.?key|seed|mnemonic|api.?secret|password|authorization|wallet.?key)/i.test(key)
    || hasSecretField(item)
  ))
}

function timestamp(value: unknown, label: string) {
  const parsed = Date.parse(String(value ?? ''))
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`)
  return { milliseconds: parsed, iso: new Date(parsed).toISOString() }
}

function integer(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`)
  }
  return parsed
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function hash(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')
}

function cleanEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email is invalid.')
  return email
}

export function validateManagedSubscriptionIdentity(value: unknown): ManagedSubscriptionIdentity {
  if (!isRecord(value)) throw new Error('subscription must be an object.')
  onlyFields(value, ['jobId', 'providerAgentId', 'serviceListingId', 'serviceId', 'buyerAgentId', 'status', 'periodStartAt', 'periodEndAt'], 'subscription')
  const jobId = String(value.jobId ?? '').trim()
  if (!/^(?:0x[a-fA-F0-9]{64}|[A-Za-z0-9_-]{6,128})$/.test(jobId)) throw new Error('jobId is invalid.')
  if (String(value.providerAgentId) !== POLYDESK_AGENT_ID) throw new Error('providerAgentId is not PolyDesk Agent #5427.')
  if (String(value.serviceListingId) !== MANAGED_AGENT_LISTING_ID) throw new Error('serviceListingId is not the managed-agent listing.')
  if (String(value.serviceId) !== MANAGED_AGENT_SERVICE_ID) throw new Error('serviceId is not the registered managed-agent service.')
  const buyerAgentId = String(value.buyerAgentId ?? '').trim()
  if (!/^\d{1,18}$/.test(buyerAgentId)) throw new Error('buyerAgentId is invalid.')
  const status = String(value.status ?? '').toLowerCase() as ManagedSubscriptionStatus
  if (!['active', 'paused', 'cancelled', 'expired'].includes(status)) throw new Error('subscription status is unsupported.')
  const start = timestamp(value.periodStartAt, 'periodStartAt')
  const end = timestamp(value.periodEndAt, 'periodEndAt')
  if (start.milliseconds >= end.milliseconds) throw new Error('periodEndAt must be after periodStartAt.')
  return {
    jobId,
    providerAgentId: POLYDESK_AGENT_ID,
    serviceListingId: MANAGED_AGENT_LISTING_ID,
    serviceId: MANAGED_AGENT_SERVICE_ID,
    buyerAgentId,
    status,
    periodStartAt: start.iso,
    periodEndAt: end.iso,
  }
}

export function validateManagedPreferences(value: unknown): ManagedPreferences {
  if (!isRecord(value)) throw new Error('preferences must be an object.')
  onlyFields(value, [
    'address', 'email', 'integrationSource', 'lossThresholdPercent', 'profitThresholdPercent',
    'newPositionAlertsEnabled', 'resolvedAlertsEnabled', 'claimableAlertsEnabled',
    'digestFrequency', 'digestTimezone', 'digestHourLocal', 'digestWeekday',
  ], 'preferences')
  const rawAddress = String(value.address ?? '').trim()
  if (!isAddress(rawAddress)) throw new Error('address must be a public EVM address.')
  const integrationSource = polymarketIntegrationSource(value.integrationSource)
  if (!integrationSource) throw new Error('integrationSource is unsupported.')
  const digestFrequency = String(value.digestFrequency ?? 'off') as PolymarketDigestFrequency
  if (!['off', 'daily', 'weekly'].includes(digestFrequency)) throw new Error('digestFrequency is unsupported.')
  const digestTimezone = String(value.digestTimezone ?? 'UTC').trim()
  if (!validDigestTimezone(digestTimezone)) throw new Error('digestTimezone is invalid.')
  return {
    address: getAddress(rawAddress),
    email: cleanEmail(value.email),
    integrationSource,
    lossThresholdPercent: integer(value.lossThresholdPercent, 0, 95, 'lossThresholdPercent'),
    profitThresholdPercent: integer(value.profitThresholdPercent, 0, 500, 'profitThresholdPercent'),
    newPositionAlertsEnabled: value.newPositionAlertsEnabled === true,
    resolvedAlertsEnabled: value.resolvedAlertsEnabled !== false,
    claimableAlertsEnabled: value.claimableAlertsEnabled !== false,
    digestFrequency,
    digestTimezone,
    digestHourLocal: integer(value.digestHourLocal, 0, 23, 'digestHourLocal'),
    digestWeekday: integer(value.digestWeekday, 0, 6, 'digestWeekday'),
  }
}

export function managedMonitoringEnabled(input: {
  status: ManagedSubscriptionStatus
  emailVerified: boolean
  periodEndAt: string
  now?: number
}) {
  return input.status === 'active'
    && input.emailVerified
    && Date.parse(input.periodEndAt) > (input.now ?? Date.now())
}

const DAY_MS = 24 * 60 * 60_000

function isTrialPeriod(subscription: Pick<ManagedSubscriptionIdentity, 'periodStartAt' | 'periodEndAt'>) {
  const duration = Date.parse(subscription.periodEndAt) - Date.parse(subscription.periodStartAt)
  return duration > 0 && duration <= 4 * DAY_MS
}

export function plannedManagedLifecycleEmails(input: {
  previous?: ManagedSubscriptionIdentity | null
  current?: ManagedSubscriptionIdentity | null
  now?: number
}) {
  const now = input.now ?? Date.now()
  const events: ManagedLifecycleEmailType[] = []
  if (input.current?.status === 'active') {
    const remaining = Date.parse(input.current.periodEndAt) - now
    if (isTrialPeriod(input.current) && remaining > 0 && remaining <= DAY_MS) events.push('trial_ending')
    if (input.previous && Date.parse(input.current.periodEndAt) > Date.parse(input.previous.periodEndAt)) {
      events.push('renewal_success')
    }
  } else if (input.previous && isTrialPeriod(input.previous) && Date.parse(input.previous.periodEndAt) <= now) {
    events.push('trial_expired')
  }
  return events
}

function authenticated(req: Request) {
  const expected = process.env.POLYDESK_A2A_OPERATOR_KEY?.trim() ?? ''
  const supplied = String(req.headers['x-polydesk-operator-key'] ?? '').trim()
    || String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!expected || !supplied) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}

function publicOrigin(req: Request) {
  const configured = String(process.env.POLYDESK_PUBLIC_ORIGIN ?? process.env.PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')
  if (/^https:\/\/[^/]+$/i.test(configured)) return configured
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'polydesk.trade').split(',')[0].trim()
  return `https://${host}`
}

function lifecycleDestination(source: unknown) {
  const configuredOrigin = String(process.env.POLYDESK_PUBLIC_ORIGIN ?? process.env.PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')
  const polydeskOrigin = /^https:\/\/[^/]+$/i.test(configuredOrigin) ? configuredOrigin : 'https://polydesk.trade'
  return polymarketPortfolioDestination(source, {
    polydeskUrl: `${polydeskOrigin}/polydesk?service=portfolio`,
    okxAiUrl: process.env.POLYDESK_OKX_AI_RETURN_URL,
    circleMarketplaceUrl: process.env.POLYDESK_CIRCLE_MARKETPLACE_RETURN_URL,
  })
}

function lifecycleEmailCopy(type: ManagedLifecycleEmailType, periodEndAt: string) {
  const end = new Date(periodEndAt).toUTCString()
  if (type === 'trial_ending') return {
    subject: 'Your PolyDesk free trial ends tomorrow',
    heading: 'Your free trial ends tomorrow',
    body: `Managed monitoring is scheduled to end on ${end} unless the subscription renews.`,
  }
  if (type === 'trial_expired') return {
    subject: 'Your PolyDesk free trial has ended',
    heading: 'Your free trial has ended',
    body: `Managed monitoring stopped when the trial ended on ${end}.`,
  }
  if (type === 'renewal_success') return {
    subject: 'Your PolyDesk subscription renewed',
    heading: 'Subscription renewed',
    body: `Managed monitoring remains active through ${end}.`,
  }
  return {
    subject: 'Your PolyDesk subscription payment failed',
    heading: 'Subscription payment failed',
    body: `Managed monitoring stopped because the subscription was not renewed through ${end}.`,
  }
}

function lifecycleEmailHtml(heading: string, body: string, label: string, url: string) {
  return `<div style="margin:0 auto;max-width:520px;padding:28px;font-family:Arial,sans-serif;color:#111827"><p>PolyDesk</p><h1>${heading}</h1><p>${body}</p><a href="${url}">${label}</a><p>PolyDesk never trades, closes, or claims without separate signed approval.</p></div>`
}

async function queueLifecycleEmail(jobId: string, type: ManagedLifecycleEmailType, periodEndAt: string) {
  const eventKey = `${type}:${new Date(periodEndAt).toISOString()}`
  await getPolymarketPortfolioPool().query(
    `insert into polymarket_managed_subscription_email_events
       (job_id, event_key, event_type, period_end_at)
     values ($1,$2,$3,$4)
     on conflict (job_id, event_key) do nothing`,
    [jobId, eventKey, type, periodEndAt],
  )
}

async function pendingLifecycleEmails() {
  await getPolymarketPortfolioPool().query(
    `update polymarket_managed_subscription_email_events
        set status='skipped', next_attempt_at=null, updated_at=now()
      where event_type='trial_ending' and period_end_at <= now()
        and status in ('pending','failed','sending')`,
  )
  return (await getPolymarketPortfolioPool().query(
    `select e.job_id, e.event_key, e.event_type, e.period_end_at,
            s.alert_email, s.integration_source
       from polymarket_managed_subscription_email_events e
       join polymarket_managed_subscriptions m on m.job_id=e.job_id
       join polymarket_alert_settings s on s.privy_user_id=m.privy_user_id
      where e.status in ('pending','failed','sending') and e.attempts < 5
        and (e.next_attempt_at is null or e.next_attempt_at <= now())
        and s.alert_email_verified=true and s.alert_email is not null
      order by e.created_at asc
      limit 20`,
  )).rows
}

async function claimLifecycleEmail(jobId: string, eventKey: string) {
  return Boolean((await getPolymarketPortfolioPool().query(
    `update polymarket_managed_subscription_email_events
        set status='sending', attempts=attempts+1, next_attempt_at=now() + interval '10 minutes', updated_at=now()
      where job_id=$1 and event_key=$2 and status in ('pending','failed','sending')
        and attempts < 5 and (next_attempt_at is null or next_attempt_at <= now())
    returning attempts`,
    [jobId, eventKey],
  )).rows[0])
}

async function markLifecycleEmailSent(jobId: string, eventKey: string) {
  await getPolymarketPortfolioPool().query(
    `update polymarket_managed_subscription_email_events
        set status='sent', sent_at=now(), last_error=null, next_attempt_at=null, updated_at=now()
      where job_id=$1 and event_key=$2`,
    [jobId, eventKey],
  )
}

async function markLifecycleEmailFailed(jobId: string, eventKey: string, error: unknown) {
  await getPolymarketPortfolioPool().query(
    `update polymarket_managed_subscription_email_events
        set status='failed', last_error=$3,
            next_attempt_at=case when attempts < 5 then now() + make_interval(mins => least(60, 5 * attempts)) else null end,
            updated_at=now()
      where job_id=$1 and event_key=$2`,
    [jobId, eventKey, error instanceof Error ? error.message : 'Email provider unavailable.'],
  )
}

async function sendLifecycleEmail(row: JsonRecord) {
  const jobId = String(row.job_id)
  const eventKey = String(row.event_key)
  if (!await claimLifecycleEmail(jobId, eventKey)) return false
  const type = String(row.event_type) as ManagedLifecycleEmailType
  const copy = lifecycleEmailCopy(type, new Date(String(row.period_end_at)).toISOString())
  const destination = lifecycleDestination(row.integration_source)
  try {
    await sendTransactionalEmail({
      to: String(row.alert_email),
      fromEmail: process.env.POLYMARKET_ALERT_FROM_EMAIL,
      fromName: process.env.POLYMARKET_ALERT_FROM_NAME ?? 'PolyDesk',
      subject: copy.subject,
      text: `${copy.heading}. ${copy.body} ${destination.label}: ${destination.url}`,
      html: lifecycleEmailHtml(copy.heading, copy.body, destination.label, destination.url),
      context: 'Managed subscription lifecycle',
      idempotencyKey: `managed-lifecycle/${hash(`${jobId}:${eventKey}`)}`,
    })
    await markLifecycleEmailSent(jobId, eventKey)
    return true
  } catch (error) {
    await markLifecycleEmailFailed(jobId, eventKey, error)
    return false
  }
}

async function deliverPendingLifecycleEmails() {
  let sent = 0
  for (const row of await pendingLifecycleEmails()) {
    if (await sendLifecycleEmail(row)) sent += 1
  }
  return sent
}

function managedIdentityFromRow(row: JsonRecord): ManagedSubscriptionIdentity {
  return {
    jobId: String(row.job_id),
    providerAgentId: POLYDESK_AGENT_ID,
    serviceListingId: MANAGED_AGENT_LISTING_ID,
    serviceId: MANAGED_AGENT_SERVICE_ID,
    buyerAgentId: String(row.buyer_agent_id),
    status: String(row.status) as ManagedSubscriptionStatus,
    periodStartAt: new Date(String(row.period_start_at)).toISOString(),
    periodEndAt: new Date(String(row.period_end_at)).toISOString(),
  }
}

async function sendConfirmation(req: Request, email: string, address: string, token: string) {
  const confirmUrl = `${publicOrigin(req)}/api/polymarket-portfolio?action=verify-public-watch&token=${encodeURIComponent(token)}`
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`
  await sendTransactionalEmail({
    to: email,
    fromEmail: process.env.POLYMARKET_ALERT_FROM_EMAIL,
    fromName: process.env.POLYMARKET_ALERT_FROM_NAME ?? 'PolyDesk',
    subject: 'Confirm your managed PolyDesk agent',
    text: `Confirm managed portfolio monitoring for ${shortAddress}: ${confirmUrl}`,
    html: `<div style="margin:0 auto;max-width:520px;padding:28px;font-family:Inter,Arial,sans-serif;color:#111827"><p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280">PolyDesk</p><h1 style="font-size:22px">Confirm managed portfolio monitoring</h1><p style="color:#4b5563">Confirm alerts and portfolio summaries for ${shortAddress}.</p><a href="${confirmUrl}" style="display:inline-block;border-radius:10px;background:#111827;color:#fff;padding:11px 16px;text-decoration:none;font-weight:700">Confirm monitoring</a><p style="color:#6b7280;font-size:12px">PolyDesk never trades, closes, or claims without separate signed approval.</p></div>`,
    context: 'Managed agent confirmation',
  })
}

function profileId(jobId: string) {
  return `managed-agent:${hash(jobId).slice(0, 40)}`
}

async function enroll(req: Request, subscription: ManagedSubscriptionIdentity, preferences: ManagedPreferences) {
  if (subscription.status !== 'active') throw new Error('Enrollment requires an active authoritative subscription.')
  const database = getPolymarketPortfolioPool()
  const privyUserId = profileId(subscription.jobId)
  const token = randomBytes(32).toString('hex')
  const tokenHash = hash(token)
  const watchId = randomUUID()
  const nextDigestAt = nextPolymarketDigestAt({
    after: new Date(),
    frequency: preferences.digestFrequency,
    timezone: preferences.digestTimezone,
    hourLocal: preferences.digestHourLocal,
    weekday: preferences.digestWeekday,
  })
  const client = await database.connect()
  try {
    await client.query('begin')
    const current = (await client.query(
      `select p.watched_address, t.email, t.verified_at
         from polymarket_profiles p
         left join polymarket_public_watch_tokens t on t.privy_user_id=p.privy_user_id
        where p.privy_user_id = $1
        for update of p`,
      [privyUserId],
    )).rows[0]
    const emailVerified = Boolean(current?.verified_at && String(current.email).toLowerCase() === preferences.email)
    const addressChanged = Boolean(current?.watched_address
      && String(current.watched_address).toLowerCase() !== preferences.address.toLowerCase())
    await client.query(
      `insert into polymarket_profiles (privy_user_id, polymarket_address, watched_address, preferred_funding_network)
       values ($1,$2,$2,'base')
       on conflict (privy_user_id) do update set polymarket_address = excluded.polymarket_address,
         watched_address = excluded.watched_address, updated_at = now()`,
      [privyUserId, preferences.address],
    )
    await client.query(
      `insert into polymarket_alert_settings
        (privy_user_id, loss_threshold_percent, profit_threshold_percent, resolved_alerts_enabled,
         claimable_alerts_enabled, new_position_alerts_enabled, digest_frequency, digest_timezone,
         digest_hour_local, digest_weekday, next_digest_at, integration_source, alert_email,
         alert_email_verified, monitoring_enabled, positions_initialized)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false)
       on conflict (privy_user_id) do update set
         loss_threshold_percent=excluded.loss_threshold_percent, profit_threshold_percent=excluded.profit_threshold_percent,
         resolved_alerts_enabled=excluded.resolved_alerts_enabled, claimable_alerts_enabled=excluded.claimable_alerts_enabled,
         new_position_alerts_enabled=excluded.new_position_alerts_enabled, digest_frequency=excluded.digest_frequency,
         digest_timezone=excluded.digest_timezone, digest_hour_local=excluded.digest_hour_local,
         digest_weekday=excluded.digest_weekday, next_digest_at=excluded.next_digest_at,
         integration_source=excluded.integration_source, alert_email=excluded.alert_email,
         alert_email_verified=excluded.alert_email_verified, monitoring_enabled=excluded.monitoring_enabled,
         positions_initialized=case when $16 then false else polymarket_alert_settings.positions_initialized end,
         updated_at=now()`,
      [privyUserId, preferences.lossThresholdPercent, preferences.profitThresholdPercent,
        preferences.resolvedAlertsEnabled, preferences.claimableAlertsEnabled, preferences.newPositionAlertsEnabled,
        preferences.digestFrequency, preferences.digestTimezone, preferences.digestHourLocal,
        preferences.digestWeekday, nextDigestAt, preferences.integrationSource, preferences.email,
        emailVerified, managedMonitoringEnabled({ status: subscription.status, emailVerified, periodEndAt: subscription.periodEndAt }),
        addressChanged],
    )
    if (addressChanged) {
      await client.query('delete from polymarket_position_alert_state where privy_user_id=$1', [privyUserId])
    }
    await client.query(
      `insert into polymarket_public_watch_tokens (watch_id, privy_user_id, token_hash, email, verified_at)
       values ($1,$2,$3,$4,$5)
       on conflict (privy_user_id) do update set token_hash=excluded.token_hash, email=excluded.email,
         verified_at=excluded.verified_at, updated_at=now()`,
      [watchId, privyUserId, tokenHash, preferences.email, emailVerified ? current.verified_at : null],
    )
    await client.query(
      `insert into polymarket_managed_subscriptions
        (job_id, privy_user_id, provider_agent_id, service_listing_id, service_id, buyer_agent_id,
         status, period_start_at, period_end_at, preferences_hash, last_reconciled_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       on conflict (job_id) do update set buyer_agent_id=excluded.buyer_agent_id, status=excluded.status,
         period_start_at=excluded.period_start_at, period_end_at=excluded.period_end_at,
         preferences_hash=excluded.preferences_hash, last_reconciled_at=now(), updated_at=now()`,
      [subscription.jobId, privyUserId, subscription.providerAgentId, subscription.serviceListingId,
        subscription.serviceId, subscription.buyerAgentId, subscription.status,
        subscription.periodStartAt, subscription.periodEndAt, hash(preferences)],
    )
    await client.query('commit')
    if (!emailVerified) await sendConfirmation(req, preferences.email, preferences.address, token)
    return { jobId: subscription.jobId, state: emailVerified ? 'active' : 'email_confirmation_required', monitoringEnabled: emailVerified }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function setLifecycle(subscription: ManagedSubscriptionIdentity) {
  const database = getPolymarketPortfolioPool()
  const client = await database.connect()
  try {
    await client.query('begin')
    const current = (await client.query(
      `select m.privy_user_id, s.alert_email_verified
         from polymarket_managed_subscriptions m
         join polymarket_alert_settings s on s.privy_user_id=m.privy_user_id
        where m.job_id=$1 and m.provider_agent_id=$2 and m.service_listing_id=$3 and m.service_id=$4
        for update of m, s`,
      [subscription.jobId, POLYDESK_AGENT_ID, MANAGED_AGENT_LISTING_ID, MANAGED_AGENT_SERVICE_ID],
    )).rows[0]
    if (!current) throw new Error('Managed subscription is not enrolled.')
    const enabled = managedMonitoringEnabled({
      status: subscription.status,
      emailVerified: Boolean(current.alert_email_verified),
      periodEndAt: subscription.periodEndAt,
    })
    await client.query(
      `update polymarket_managed_subscriptions set status=$2, buyer_agent_id=$3,
         period_start_at=$4, period_end_at=$5, last_reconciled_at=now(), updated_at=now()
       where job_id=$1`,
      [subscription.jobId, subscription.status, subscription.buyerAgentId, subscription.periodStartAt, subscription.periodEndAt],
    )
    await client.query(
      'update polymarket_alert_settings set monitoring_enabled=$2, updated_at=now() where privy_user_id=$1',
      [current.privy_user_id, enabled],
    )
    await client.query('commit')
    return { jobId: subscription.jobId, state: subscription.status, monitoringEnabled: enabled }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function reconcile(subscriptions: ManagedSubscriptionIdentity[]) {
  const active = subscriptions.filter(item => item.status === 'active')
  const jobIds = active.map(item => item.jobId)
  const database = getPolymarketPortfolioPool()
  for (const item of active) {
    const previousRow = (await database.query(
      `select job_id, buyer_agent_id, status, period_start_at, period_end_at
         from polymarket_managed_subscriptions
        where job_id=$1 and provider_agent_id=$2 and service_listing_id=$3 and service_id=$4`,
      [item.jobId, POLYDESK_AGENT_ID, MANAGED_AGENT_LISTING_ID, MANAGED_AGENT_SERVICE_ID],
    )).rows[0] as JsonRecord | undefined
    const previous = previousRow ? managedIdentityFromRow(previousRow) : null
    await database.query(
      `with refreshed as (
         update polymarket_managed_subscriptions
            set status='active', buyer_agent_id=$2, period_end_at=$3,
                last_reconciled_at=now(), updated_at=now()
          where job_id=$1 and provider_agent_id=$4 and service_listing_id=$5 and service_id=$6
          returning privy_user_id, period_end_at
       )
       update polymarket_alert_settings s
          set monitoring_enabled=(s.alert_email_verified=true and refreshed.period_end_at > now()), updated_at=now()
         from refreshed where s.privy_user_id=refreshed.privy_user_id`,
      [item.jobId, item.buyerAgentId, item.periodEndAt,
        POLYDESK_AGENT_ID, MANAGED_AGENT_LISTING_ID, MANAGED_AGENT_SERVICE_ID],
    )
    if (previous) {
      for (const type of plannedManagedLifecycleEmails({ previous, current: item })) {
        await queueLifecycleEmail(item.jobId, type, item.periodEndAt)
      }
    }
  }
  const expiredRows = (await database.query(
    `with stopped as (
       update polymarket_managed_subscriptions
          set status='expired', last_reconciled_at=now(), updated_at=now()
        where provider_agent_id=$1 and service_listing_id=$2 and service_id=$3
          and status in ('active','paused') and not (job_id = any($4::text[]))
       returning job_id, privy_user_id, buyer_agent_id, status, period_start_at, period_end_at
     )
     update polymarket_alert_settings s set monitoring_enabled=false, updated_at=now()
       from stopped where s.privy_user_id=stopped.privy_user_id
     returning stopped.job_id, stopped.buyer_agent_id, stopped.status,
               stopped.period_start_at, stopped.period_end_at`,
    [POLYDESK_AGENT_ID, MANAGED_AGENT_LISTING_ID, MANAGED_AGENT_SERVICE_ID, jobIds],
  )).rows as JsonRecord[]
  for (const row of expiredRows) {
    const previous = managedIdentityFromRow(row)
    for (const type of plannedManagedLifecycleEmails({ previous })) {
      await queueLifecycleEmail(previous.jobId, type, previous.periodEndAt)
    }
  }
  const notified = await deliverPendingLifecycleEmails()
  return { active: active.length, stopped: expiredRows.length, notified }
}

export default async function polydeskManagedAgentSubscriptionHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  if (!authenticated(req)) return res.status(401).json({ ok: false, error: 'Operator authentication failed.' })
  try {
    await ensurePolymarketPortfolioSchema()
    const body = req.body as unknown
    if (!isRecord(body) || hasSecretField(body)) throw new Error('Request is invalid or contains forbidden secret material.')
    onlyFields(body, ['schema', 'action', 'subscription', 'subscriptions', 'preferences', 'complete'], 'request')
    if (body.schema !== MANAGED_AGENT_SCHEMA) throw new Error('Managed-agent schema is unsupported.')
    const action = String(body.action ?? '').toLowerCase()
    if (action === 'enroll' || action === 'update_preferences') {
      const subscription = validateManagedSubscriptionIdentity(body.subscription)
      const preferences = validateManagedPreferences(body.preferences)
      const result = await enroll(req, subscription, preferences)
      return res.status(202).json({ ok: true, ...result })
    }
    if (action === 'pause' || action === 'resume' || action === 'cancel') {
      const subscription = validateManagedSubscriptionIdentity(body.subscription)
      const expected = action === 'pause' ? 'paused' : action === 'cancel' ? 'cancelled' : 'active'
      if (subscription.status !== expected) throw new Error(`${action} requires subscription status ${expected}.`)
      return res.json({ ok: true, ...(await setLifecycle(subscription)) })
    }
    if (action === 'payment_failed') {
      const subscription = validateManagedSubscriptionIdentity(body.subscription)
      if (subscription.status !== 'expired') throw new Error('payment_failed requires subscription status expired.')
      const lifecycle = await setLifecycle(subscription)
      await queueLifecycleEmail(subscription.jobId, 'payment_failed', subscription.periodEndAt)
      return res.json({ ok: true, ...lifecycle, notified: await deliverPendingLifecycleEmails() })
    }
    if (action === 'reconcile_active') {
      if (body.complete !== true || !Array.isArray(body.subscriptions)) throw new Error('A complete authoritative subscription snapshot is required.')
      const subscriptions = body.subscriptions.map(validateManagedSubscriptionIdentity)
      if (subscriptions.some(item => item.status !== 'active')) throw new Error('The authoritative active snapshot may contain only active subscriptions.')
      return res.json({ ok: true, ...(await reconcile(subscriptions)) })
    }
    if (action === 'status') {
      const subscription = validateManagedSubscriptionIdentity(body.subscription)
      const row = (await getPolymarketPortfolioPool().query(
        `select m.job_id, m.buyer_agent_id, m.status, m.period_start_at, m.period_end_at,
                m.last_reconciled_at, s.monitoring_enabled, s.alert_email_verified,
                p.watched_address
           from polymarket_managed_subscriptions m
           join polymarket_alert_settings s on s.privy_user_id=m.privy_user_id
           join polymarket_profiles p on p.privy_user_id=m.privy_user_id
          where m.job_id=$1 and m.service_id=$2`,
        [subscription.jobId, MANAGED_AGENT_SERVICE_ID],
      )).rows[0]
      if (!row) return res.status(404).json({ ok: false, error: 'Managed subscription is not enrolled.' })
      return res.json({ ok: true, subscription: row })
    }
    return res.status(400).json({ ok: false, error: 'Unsupported action.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Managed subscription request failed.'
    return res.status(400).json({ ok: false, error: message })
  }
}
