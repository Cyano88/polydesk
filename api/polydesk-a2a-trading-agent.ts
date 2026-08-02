import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
import { preparePolymarketCopy } from './polymarket-copy-prepare.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'

type JsonRecord = Record<string, unknown>

type A2aMission = {
  schema: 'polydesk-a2a-trading-mission-v1'
  missionId: string
  jobId: string
  inputHash: string
  state: 'requires_action' | 'signal_ready'
  createdAt: string
  updatedAt: string
  buyer: {
    ownerAddress: string
    depositWalletAddress?: string
  }
  source: {
    watchedWallet: string
    selectionMode: string
    fingerprint?: string
    title?: string
    marketUrl?: string
    conditionId?: string
    tokenId?: string
    outcome?: string
  }
  mandate: {
    maxSpendUsdc: string
    maximumPrice: number
    expiresAt: string
    grantCheck: {
      ok: true
      venue: 'polymarket'
      action: 'buy'
      amountUsdc: string
    }
  }
  nextAction: unknown
  autoTrade?: AutoTradeSignal
  receipt?: PnlReceipt
}

export type AutoTradeSignal = {
  schemaVersion: 1
  deliveryId: string
  signalType: 'polymarket'
  ttlSec: number
  params: {
    conditionId: string
    outcome: string
    side: 'buy'
    amount: string
    amountUnit: 'quote'
    maxPriceCents: number
  }
}

type PnlReceipt = {
  schema: 'polydesk-a2a-pnl-receipt-v1'
  missionId: string
  jobId: string
  state: 'open' | 'closed' | 'not_found'
  observedAt: string
  wallet: string
  market: {
    conditionId: string
    tokenId: string
    outcome: string
    title: string | null
  }
  pnl: {
    initialValueUsdc: number | null
    currentValueUsdc: number | null
    cashPnlUsdc: number | null
    percentPnl: number | null
    realizedPnlUsdc: number | null
    currentPrice: number | null
  }
  sources: string[]
  proofHash: string
}

export type A2aTradingDependencies = {
  prepareCopy: typeof preparePolymarketCopy
  fetchJson: (url: string) => Promise<unknown>
  now: () => number
  hasStore: () => boolean
  readMission: (key: string) => Promise<A2aMission | undefined>
  mutateMission: (key: string, mutate: (current: A2aMission | undefined) => A2aMission | Promise<A2aMission>) => Promise<A2aMission>
}

const DATA_API_ORIGIN = 'https://data-api.polymarket.com'
const REQUEST_TIMEOUT_MS = 10_000
const MAX_TTL_SECONDS = 86_400
const MIN_TTL_SECONDS = 30

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function clean(value: unknown, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')
}

function publicOrigin(req: Request) {
  const configured = clean(
    process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '',
    200,
  )
  if (configured) return configured.replace(/\/+$/, '')
  const protocol = clean(req.headers['x-forwarded-proto'] || req.protocol || 'https', 16).split(',')[0]
  const host = clean(req.headers['x-forwarded-host'] || req.headers.host || 'polydesk.trade', 160).split(',')[0]
  return `${protocol}://${host}`.replace(/\/+$/, '')
}

async function fetchPublicJson(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!response.ok) throw new Error(`Polymarket Data API returned HTTP ${response.status}.`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

const defaultDependencies: A2aTradingDependencies = {
  prepareCopy: preparePolymarketCopy,
  fetchJson: fetchPublicJson,
  now: () => Date.now(),
  hasStore: hasRenderDurableStore,
  readMission: readDurableJson,
  mutateMission: mutateDurableJson,
}

function missionKey(missionId: string) {
  return `polydesk-a2a-trading:${missionId}`
}

function acceptedTask(value: unknown) {
  const normalized = clean(value, 24).toLowerCase()
  return normalized === 'accepted' || normalized === 'job_accepted' || normalized === '1'
}

function secretPath(value: unknown, path = 'body'): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = secretPath(value[index], `${path}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (!isRecord(value)) return null
  for (const [key, item] of Object.entries(value)) {
    if (/(private.?key|seed|mnemonic|clob.?secret|api.?secret|password)/i.test(key)) return `${path}.${key}`
    const found = secretPath(item, `${path}.${key}`)
    if (found) return found
  }
  return null
}

function decimalAmount(value: unknown) {
  const amount = clean(value, 32)
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) return null
  return amount
}

function unknownField(value: JsonRecord, allowed: ReadonlySet<string>, prefix = 'body') {
  const key = Object.keys(value).find(item => !allowed.has(item))
  return key ? `${prefix}.${key}` : null
}

function exactMaximumPrice(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || number > 1) return null
  return number
}

function requireOperator(req: Request) {
  const expected = clean(process.env.POLYDESK_A2A_OPERATOR_KEY, 256)
  if (!expected) return { ok: false as const, status: 503, error: 'A2A operator access is not configured.' }
  const authorization = clean(req.headers.authorization, 320)
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
  const supplied = bearer || clean(req.headers['x-operator-key'], 256)
  const suppliedBytes = Buffer.from(supplied)
  const expectedBytes = Buffer.from(expected)
  if (!supplied || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return { ok: false as const, status: 401, error: 'A valid A2A operator key is required.' }
  }
  return { ok: true as const }
}

export function a2aTradingDescriptor(req: Request) {
  const origin = publicOrigin(req)
  return {
    ok: true,
    service: 'PolyDesk A2A Trading Agent',
    version: '2026-08-02',
    type: 'A2A',
    promise: 'Watch or select a public Polymarket position, verify the buyer account, prepare one bounded BUY signal, and return a recomputable public PnL receipt.',
    execution: 'The OKX buyer executes the signal through its own Agentic Wallet under the task autotrade grant. PolyDesk never receives wallet keys or reusable CLOB credentials.',
    lifecycle: [
      'Publish an A2A task with a written Polymarket BUY cap.',
      'PolyDesk applies and waits for job_accepted before doing paid work.',
      'Validate the written cap with autotrade-grant-check.',
      'Watch or select a public signal and verify the owner-derived Deposit Wallet.',
      'Return FUND or APPROVE_COLLATERAL when the buyer is not ready; otherwise return one OKX-native autotrade signal.',
      'Deliver the signal with task deliver --autotrade; OKX stamps signalTime and executes within the buyer grant.',
      'Return a public, recomputable open or realized PnL receipt.',
    ],
    operatorEndpoint: `${origin}/api/a2a/polydesk-trading-agent`,
    receiptPattern: `${origin}/api/a2a/polydesk-trading-agent/receipt/{missionId}`,
    requiredTaskTerms: ['venue=polymarket', 'action=buy', 'maximum USDC amount', 'expiry', 'accepted task state'],
    selectionModes: ['TRADE', 'POSITION', 'AUTO_BEST_FIT'],
    limitations: [
      'AUTO_BEST_FIT ranks execution quality under an explicit policy; it does not predict profit.',
      'The first release emits one immediate BUY signal per task.',
      'A sell or automatic exit requires a separate explicit buyer authorization.',
    ],
  }
}

function autoTradeFromPrepared(input: {
  jobId: string
  missionId: string
  maxSpendUsdc: string
  maximumPrice: number
  expiresAtMs: number
  nowMs: number
  sourceSignal: JsonRecord
}): AutoTradeSignal | { error: string } {
  const conditionId = clean(input.sourceSignal.conditionId, 96)
  const outcome = clean(input.sourceSignal.outcome, 80)
  if (!/^0x[a-fA-F0-9]{64}$/.test(conditionId)) return { error: 'Prepared signal is missing a valid conditionId.' }
  if (!outcome || !/^[A-Za-z0-9_-]+$/.test(outcome)) return { error: 'Prepared outcome is not safe for the OKX autotrade command.' }
  const ttlSec = Math.min(MAX_TTL_SECONDS, Math.floor((input.expiresAtMs - input.nowMs) / 1000))
  if (ttlSec < MIN_TTL_SECONDS) return { error: 'Mandate expires too soon to deliver a safe autotrade signal.' }
  const maxPriceCents = Math.floor(input.maximumPrice * 100)
  if (maxPriceCents < 1 || maxPriceCents > 100) return { error: 'maximumPrice must resolve to 1 through 100 cents.' }
  return {
    schemaVersion: 1,
    deliveryId: `pd_${sha256(`${input.jobId}:${input.missionId}`).slice(0, 40)}`,
    signalType: 'polymarket',
    ttlSec,
    params: {
      conditionId,
      outcome,
      side: 'buy',
      amount: input.maxSpendUsdc,
      amountUnit: 'quote',
      maxPriceCents,
    },
  }
}

export async function prepareA2aTradingSignal(
  value: unknown,
  dependencies: A2aTradingDependencies = defaultDependencies,
) {
  if (!isRecord(value)) return { ok: false as const, status: 400, error: 'Request body must be a JSON object.' }
  const exposed = secretPath(value)
  if (exposed) return { ok: false as const, status: 400, error: `Secret material is forbidden (${exposed}).` }
  const unknown = unknownField(value, new Set([
    'action', 'jobId', 'taskStatus', 'watchedWallet', 'ownerAddress', 'selectionMode',
    'transactionHash', 'tokenId', 'conditionId', 'maxSpendUsdc', 'maximumPrice',
    'expiresAt', 'maxSignalAgeSeconds', 'selectionPolicy', 'grantCheck',
  ]))
  if (unknown) return { ok: false as const, status: 400, error: `Unsupported field (${unknown}).` }
  if (!acceptedTask(value.taskStatus)) {
    return { ok: false as const, status: 409, error: 'A2A work can start only after the task reaches job_accepted.' }
  }
  if (!dependencies.hasStore()) {
    return { ok: false as const, status: 503, error: 'Durable A2A mission storage is not configured.' }
  }

  const jobId = clean(value.jobId, 80)
  const watchedWallet = clean(value.watchedWallet, 80)
  const ownerAddress = clean(value.ownerAddress, 80)
  const selectionMode = clean(value.selectionMode || (value.transactionHash ? 'TRADE' : 'POSITION'), 24).toUpperCase()
  const maxSpendUsdc = decimalAmount(value.maxSpendUsdc)
  const maximumPrice = exactMaximumPrice(value.maximumPrice)
  const grantCheck = isRecord(value.grantCheck) ? value.grantCheck : null
  const expiresAt = clean(value.expiresAt, 48)
  const expiresAtMs = Date.parse(expiresAt)
  const nowMs = dependencies.now()

  if (!/^0x[a-fA-F0-9]{64}$/.test(jobId) && !/^[A-Za-z0-9_-]{6,64}$/.test(jobId)) {
    return { ok: false as const, status: 400, error: 'jobId has an unsupported format.' }
  }
  if (!isAddress(watchedWallet)) return { ok: false as const, status: 400, error: 'watchedWallet must be a public EVM address.' }
  if (!isAddress(ownerAddress)) return { ok: false as const, status: 400, error: 'ownerAddress must be the buyer owner EOA.' }
  if (!['TRADE', 'POSITION', 'AUTO_BEST_FIT'].includes(selectionMode)) return { ok: false as const, status: 400, error: 'selectionMode is unsupported.' }
  if (!maxSpendUsdc) return { ok: false as const, status: 400, error: 'maxSpendUsdc must be positive with at most 6 decimals.' }
  if (!maximumPrice) return { ok: false as const, status: 400, error: 'maximumPrice must be greater than 0 and at most 1.' }
  if (isRecord(value.selectionPolicy)) {
    const unknownPolicy = unknownField(value.selectionPolicy, new Set([
      'maximumPrice', 'maximumSpread', 'minimumDepthUsdc', 'minimumHoursToResolution', 'maximumBookAgeSeconds',
    ]), 'body.selectionPolicy')
    if (unknownPolicy) return { ok: false as const, status: 400, error: `Unsupported field (${unknownPolicy}).` }
  }
  if (grantCheck) {
    const unknownGrant = unknownField(grantCheck, new Set(['ok', 'venue', 'action', 'amountUsdc']), 'body.grantCheck')
    if (unknownGrant) return { ok: false as const, status: 400, error: `Unsupported field (${unknownGrant}).` }
  }
  if (
    !grantCheck
    || grantCheck.ok !== true
    || clean(grantCheck.venue, 24).toLowerCase() !== 'polymarket'
    || clean(grantCheck.action, 16).toLowerCase() !== 'buy'
    || decimalAmount(grantCheck.amountUsdc) !== maxSpendUsdc
  ) {
    return { ok: false as const, status: 409, error: 'A matching successful OKX Polymarket BUY autotrade grant check is required.' }
  }
  if (!Number.isFinite(expiresAtMs)) return { ok: false as const, status: 400, error: 'expiresAt must be a valid timestamp.' }

  const prepareInput: JsonRecord = {
    watchedWallet: getAddress(watchedWallet),
    ownerAddress: getAddress(ownerAddress),
    selectionMode,
    maxSpendUsdc,
    orderType: 'FAK',
    maxSignalAgeSeconds: value.maxSignalAgeSeconds,
    transactionHash: value.transactionHash,
    tokenId: value.tokenId,
    conditionId: value.conditionId,
    selectionPolicy: isRecord(value.selectionPolicy)
      ? { ...value.selectionPolicy, maximumPrice }
      : { maximumPrice },
  }
  const canonicalInput = {
    jobId,
    watchedWallet: getAddress(watchedWallet),
    ownerAddress: getAddress(ownerAddress),
    selectionMode,
    maxSpendUsdc,
    maximumPrice,
    expiresAt: new Date(expiresAtMs).toISOString(),
    transactionHash: clean(value.transactionHash, 80) || null,
    tokenId: clean(value.tokenId, 96) || null,
    conditionId: clean(value.conditionId, 96) || null,
    selectionPolicy: prepareInput.selectionPolicy,
    grantCheck: { ok: true, venue: 'polymarket', action: 'buy', amountUsdc: maxSpendUsdc },
  }
  const inputHash = sha256(canonicalInput)
  const missionId = `pda2a_${sha256(jobId).slice(0, 24)}`
  const existing = await dependencies.readMission(missionKey(missionId))
  if (existing) {
    if (existing.inputHash !== inputHash) {
      return { ok: false as const, status: 409, error: 'This jobId is already bound to different mission inputs.', missionId }
    }
    const remainingTtl = Math.min(MAX_TTL_SECONDS, Math.floor((Date.parse(existing.mandate.expiresAt) - nowMs) / 1000))
    if (remainingTtl < MIN_TTL_SECONDS) {
      return { ok: false as const, status: 409, error: 'The existing mission mandate has expired.', missionId }
    }
    if (existing.autoTrade) {
      const replayMission = {
        ...existing,
        autoTrade: { ...existing.autoTrade, ttlSec: Math.min(existing.autoTrade.ttlSec, remainingTtl) },
      }
      return { ok: true as const, status: 200, data: replayMission, idempotentReplay: true }
    }
  }
  if (expiresAtMs - nowMs < MIN_TTL_SECONDS * 1000) {
    return { ok: false as const, status: 400, error: 'expiresAt must leave at least 30 seconds for safe delivery.' }
  }

  const prepared = await dependencies.prepareCopy(prepareInput)
  if (!prepared.ok) return prepared
  const data = prepared.data as unknown as JsonRecord
  const sourceSignal = isRecord(data.sourceSignal) ? data.sourceSignal : {}
  const buyerAccount = isRecord(data.buyerAccount) ? data.buyerAccount : {}
  const nextAction = data.nextAction
  const nextActionType = isRecord(nextAction) ? clean(nextAction.type, 32).toUpperCase() : ''
  let autoTrade: AutoTradeSignal | undefined
  if (!['FUND', 'APPROVE_COLLATERAL'].includes(nextActionType)) {
    const built = autoTradeFromPrepared({
      jobId,
      missionId,
      maxSpendUsdc,
      maximumPrice,
      expiresAtMs,
      nowMs,
      sourceSignal,
    })
    if ('error' in built) return { ok: false as const, status: 502, error: built.error }
    autoTrade = built
  }

  const timestamp = new Date(nowMs).toISOString()
  const mission: A2aMission = {
    schema: 'polydesk-a2a-trading-mission-v1',
    missionId,
    jobId,
    inputHash,
    state: autoTrade ? 'signal_ready' : 'requires_action',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    buyer: {
      ownerAddress: getAddress(ownerAddress),
      depositWalletAddress: clean(buyerAccount.depositWalletAddress, 80) || undefined,
    },
    source: {
      watchedWallet: getAddress(watchedWallet),
      selectionMode,
      fingerprint: clean(sourceSignal.fingerprint, 80) || undefined,
      title: clean(sourceSignal.title, 180) || undefined,
      marketUrl: clean(sourceSignal.marketUrl, 240) || undefined,
      conditionId: clean(sourceSignal.conditionId, 96) || undefined,
      tokenId: clean(sourceSignal.tokenId, 96) || undefined,
      outcome: clean(sourceSignal.outcome, 80) || undefined,
    },
    mandate: {
      maxSpendUsdc,
      maximumPrice,
      expiresAt: new Date(expiresAtMs).toISOString(),
      grantCheck: { ok: true, venue: 'polymarket', action: 'buy', amountUsdc: maxSpendUsdc },
    },
    nextAction: autoTrade ? 'DELIVER_AUTOTRADE_SIGNAL' : nextAction,
    autoTrade,
  }
  const stored = await dependencies.mutateMission(missionKey(missionId), current => {
    if (current && current.inputHash !== inputHash) throw new Error('MISSION_INPUT_DRIFT')
    if (current?.autoTrade) return current
    return mission
  }).catch(error => {
    if (error instanceof Error && error.message === 'MISSION_INPUT_DRIFT') return null
    throw error
  })
  if (!stored) return { ok: false as const, status: 409, error: 'Concurrent mission input drift was rejected.', missionId }
  return { ok: true as const, status: 200, data: stored, idempotentReplay: stored !== mission }
}

function nullableNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 1_000_000) / 1_000_000 : null
}

function findMatchingPosition(items: unknown, mission: A2aMission) {
  if (!Array.isArray(items)) return null
  return items.find(item => {
    if (!isRecord(item)) return false
    const conditionMatch = clean(item.conditionId ?? item.market, 96).toLowerCase() === clean(mission.source.conditionId, 96).toLowerCase()
    const tokenMatch = clean(item.asset, 96) === clean(mission.source.tokenId, 96)
    const outcomeMatch = clean(item.outcome, 80).toLowerCase() === clean(mission.source.outcome, 80).toLowerCase()
    return conditionMatch && (tokenMatch || outcomeMatch)
  }) as JsonRecord | undefined ?? null
}

export async function snapshotA2aTradingPnl(
  value: unknown,
  dependencies: A2aTradingDependencies = defaultDependencies,
) {
  if (!isRecord(value)) return { ok: false as const, status: 400, error: 'Request body must be a JSON object.' }
  const exposed = secretPath(value)
  if (exposed) return { ok: false as const, status: 400, error: `Secret material is forbidden (${exposed}).` }
  const unknown = unknownField(value, new Set(['action', 'missionId']))
  if (unknown) return { ok: false as const, status: 400, error: `Unsupported field (${unknown}).` }
  if (!dependencies.hasStore()) return { ok: false as const, status: 503, error: 'Durable A2A mission storage is not configured.' }
  const missionId = clean(value.missionId, 64)
  if (!/^pda2a_[a-f0-9]{24}$/.test(missionId)) return { ok: false as const, status: 400, error: 'missionId is invalid.' }
  const mission = await dependencies.readMission(missionKey(missionId))
  if (!mission) return { ok: false as const, status: 404, error: 'A2A trading mission was not found.' }
  if (!mission.autoTrade || !mission.buyer.depositWalletAddress || !mission.source.conditionId || !mission.source.tokenId) {
    return { ok: false as const, status: 409, error: 'Mission has no delivered trade signal to measure.' }
  }

  const wallet = getAddress(mission.buyer.depositWalletAddress)
  const currentUrl = `${DATA_API_ORIGIN}/positions?user=${encodeURIComponent(wallet)}&sizeThreshold=0&limit=500`
  const closedUrl = `${DATA_API_ORIGIN}/closed-positions?user=${encodeURIComponent(wallet)}&limit=500`
  let current: unknown
  let closed: unknown
  try {
    ;[current, closed] = await Promise.all([dependencies.fetchJson(currentUrl), dependencies.fetchJson(closedUrl)])
  } catch (error) {
    return { ok: false as const, status: 502, error: error instanceof Error ? error.message : 'Polymarket PnL lookup failed.' }
  }
  const openPosition = findMatchingPosition(current, mission)
  const closedPosition = findMatchingPosition(closed, mission)
  const position = openPosition ?? closedPosition
  const state: PnlReceipt['state'] = openPosition ? 'open' : closedPosition ? 'closed' : 'not_found'
  const observedAt = new Date(dependencies.now()).toISOString()
  const receiptCore = {
    schema: 'polydesk-a2a-pnl-receipt-v1' as const,
    missionId,
    jobId: mission.jobId,
    state,
    observedAt,
    wallet,
    market: {
      conditionId: mission.source.conditionId,
      tokenId: mission.source.tokenId,
      outcome: mission.source.outcome || '',
      title: position ? clean(position.title, 180) || null : mission.source.title || null,
    },
    pnl: {
      initialValueUsdc: position ? nullableNumber(position.initialValue) : null,
      currentValueUsdc: position ? nullableNumber(position.currentValue) : null,
      cashPnlUsdc: openPosition ? nullableNumber(openPosition.cashPnl) : null,
      percentPnl: position ? nullableNumber(position.percentPnl ?? position.percentRealizedPnl) : null,
      realizedPnlUsdc: closedPosition && !openPosition ? nullableNumber(closedPosition.realizedPnl) : null,
      currentPrice: position ? nullableNumber(position.curPrice) : null,
    },
    sources: [currentUrl, closedUrl],
  }
  const receipt: PnlReceipt = { ...receiptCore, proofHash: `sha256:${sha256(receiptCore)}` }
  const updated = await dependencies.mutateMission(missionKey(missionId), currentMission => {
    if (!currentMission) throw new Error('MISSION_NOT_FOUND')
    return { ...currentMission, updatedAt: observedAt, receipt }
  })
  return { ok: true as const, status: 200, data: updated.receipt }
}

export function createA2aTradingHandler(dependencies: A2aTradingDependencies = defaultDependencies) {
  return async function polydeskA2aTradingAgentHandler(req: Request, res: Response) {
    if (req.method === 'GET') return res.status(200).json(a2aTradingDescriptor(req))
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    const auth = requireOperator(req)
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error })
    const action = clean(isRecord(req.body) ? req.body.action : '', 32).toUpperCase()
    const result = action === 'PREPARE_SIGNAL'
      ? await prepareA2aTradingSignal(req.body, dependencies)
      : action === 'PNL_SNAPSHOT'
        ? await snapshotA2aTradingPnl(req.body, dependencies)
        : { ok: false as const, status: 400, error: 'action must be PREPARE_SIGNAL or PNL_SNAPSHOT.' }
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error, ...('missionId' in result ? { missionId: result.missionId } : {}) })
    return res.status(result.status).json({ ok: true, ...result.data, ...('idempotentReplay' in result ? { idempotentReplay: result.idempotentReplay } : {}) })
  }
}

export function createA2aTradingReceiptHandler(dependencies: A2aTradingDependencies = defaultDependencies) {
  return async function polydeskA2aTradingReceiptHandler(req: Request, res: Response) {
    const missionId = clean(req.params.missionId, 64)
    if (!/^pda2a_[a-f0-9]{24}$/.test(missionId)) return res.status(400).json({ ok: false, error: 'missionId is invalid.' })
    const mission = await dependencies.readMission(missionKey(missionId))
    if (!mission) return res.status(404).json({ ok: false, error: 'A2A trading mission was not found.' })
    if (!mission.receipt) return res.status(409).json({ ok: false, error: 'PnL receipt is not available yet.', missionId, state: mission.state })
    return res.status(200).json({ ok: true, receipt: mission.receipt })
  }
}

export default createA2aTradingHandler()
export const polydeskA2aTradingReceiptHandler = createA2aTradingReceiptHandler()
