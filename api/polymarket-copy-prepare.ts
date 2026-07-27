import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
import { inspectPolymarketDepositWallet } from './polymarket-deposit-wallet.js'
import { preparePolymarketOpen } from './polymarket-open-prepare.js'
import {
  rankCopyPositionCandidates,
  type CopyMarketState,
  type CopyOrderBook,
  type CopyPositionCandidate,
  type CopySelectionPolicy,
} from './polymarket-copy-ranking.js'

const DATA_API_ORIGIN = 'https://data-api.polymarket.com'
const GAMMA_API_ORIGIN = 'https://gamma-api.polymarket.com'
const CLOB_API_ORIGIN = 'https://clob.polymarket.com'
const REQUEST_TIMEOUT_MS = 10_000

type JsonRecord = Record<string, unknown>
type SelectionMode = 'TRADE' | 'POSITION' | 'AUTO_BEST_FIT'

type CopyActivity = {
  proxyWallet?: string
  timestamp?: number | string
  conditionId?: string
  type?: string
  transactionHash?: string
  asset?: string
  side?: string
  price?: number | string
  size?: number | string
  usdcSize?: number | string
  title?: string
  slug?: string
  eventSlug?: string
  outcome?: string
}

type RawPosition = Partial<CopyPositionCandidate> & {
  market?: string
}

type RawGammaMarket = {
  conditionId?: string
  active?: boolean
  closed?: boolean
  enableOrderBook?: boolean
  acceptingOrders?: boolean
  endDate?: string
}

export type CopyPrepareDependencies = {
  fetchActivity: (watchedWallet: string) => Promise<CopyActivity[]>
  fetchPositions: (watchedWallet: string) => Promise<RawPosition[]>
  fetchEventMarkets: (eventSlug: string) => Promise<CopyMarketState[]>
  fetchBook: (tokenId: string) => Promise<CopyOrderBook>
  inspectWallet: typeof inspectPolymarketDepositWallet
  prepareOpen: typeof preparePolymarketOpen
  now: () => number
}

function clean(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function numberOrZero(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

async function fetchJson(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

const defaultDependencies: CopyPrepareDependencies = {
  fetchActivity: async watchedWallet => {
    const data = await fetchJson(
      `${DATA_API_ORIGIN}/activity?user=${encodeURIComponent(watchedWallet)}&type=TRADE&side=BUY&sortBy=TIMESTAMP&sortDirection=DESC&limit=100`,
    )
    return Array.isArray(data) ? data as CopyActivity[] : []
  },
  fetchPositions: async watchedWallet => {
    const data = await fetchJson(
      `${DATA_API_ORIGIN}/positions?user=${encodeURIComponent(watchedWallet)}&sizeThreshold=0&limit=100&sortBy=CURRENT&sortDirection=DESC`,
    )
    return Array.isArray(data) ? data as RawPosition[] : []
  },
  fetchEventMarkets: async eventSlug => {
    const event = await fetchJson(`${GAMMA_API_ORIGIN}/events/slug/${encodeURIComponent(eventSlug)}`)
    if (!isRecord(event) || !Array.isArray(event.markets)) return []
    return event.markets.filter(isRecord).map((market: RawGammaMarket) => ({
      conditionId: clean(market.conditionId, 96),
      active: market.active === true,
      closed: market.closed === true,
      enableOrderBook: market.enableOrderBook === true,
      acceptingOrders: market.acceptingOrders === true,
      endDate: clean(market.endDate, 64),
    }))
  },
  fetchBook: async tokenId => {
    const book = await fetchJson(`${CLOB_API_ORIGIN}/book?token_id=${encodeURIComponent(tokenId)}`)
    if (!isRecord(book)) throw new Error('invalid order book')
    return book as CopyOrderBook
  },
  inspectWallet: inspectPolymarketDepositWallet,
  prepareOpen: preparePolymarketOpen,
  now: () => Date.now(),
}

function normalizePosition(value: RawPosition): CopyPositionCandidate | null {
  const proxyWallet = clean(value.proxyWallet, 80)
  const asset = clean(value.asset, 96)
  const conditionId = clean(value.conditionId ?? value.market, 96)
  const eventSlug = clean(value.eventSlug, 180)
  const outcome = clean(value.outcome, 80)
  if (
    !isAddress(proxyWallet)
    || !/^\d+$/.test(asset)
    || !/^0x[a-fA-F0-9]{64}$/.test(conditionId)
    || !eventSlug
    || !outcome
  ) return null
  return {
    proxyWallet: getAddress(proxyWallet),
    asset,
    conditionId,
    size: numberOrZero(value.size),
    avgPrice: numberOrZero(value.avgPrice),
    currentValue: numberOrZero(value.currentValue),
    cashPnl: numberOrZero(value.cashPnl),
    percentPnl: numberOrZero(value.percentPnl),
    curPrice: numberOrZero(value.curPrice),
    redeemable: value.redeemable === true,
    title: clean(value.title || value.eventSlug, 180),
    eventSlug,
    outcome,
    endDate: clean(value.endDate, 64),
    negativeRisk: value.negativeRisk === true,
  }
}

function parseSelectionPolicy(value: unknown, maxSpendUsdc: number) {
  if (!isRecord(value)) {
    return { ok: false as const, error: 'AUTO_BEST_FIT requires a strict selectionPolicy.' }
  }
  const policy = {
    maximumPrice: Number(value.maximumPrice),
    maximumSpread: Number(value.maximumSpread),
    minimumDepthUsdc: Number(value.minimumDepthUsdc),
    minimumHoursToResolution: Number(value.minimumHoursToResolution),
    maximumBookAgeSeconds: Number(value.maximumBookAgeSeconds),
  }
  if (!Number.isFinite(policy.maximumPrice) || policy.maximumPrice <= 0 || policy.maximumPrice >= 1) {
    return { ok: false as const, error: 'selectionPolicy.maximumPrice must be greater than 0 and less than 1.' }
  }
  if (!Number.isFinite(policy.maximumSpread) || policy.maximumSpread <= 0 || policy.maximumSpread > 0.5) {
    return { ok: false as const, error: 'selectionPolicy.maximumSpread must be greater than 0 and no more than 0.5.' }
  }
  if (!Number.isFinite(policy.minimumDepthUsdc) || policy.minimumDepthUsdc < maxSpendUsdc) {
    return { ok: false as const, error: 'selectionPolicy.minimumDepthUsdc must cover maxSpendUsdc.' }
  }
  if (!Number.isFinite(policy.minimumHoursToResolution) || policy.minimumHoursToResolution < 0 || policy.minimumHoursToResolution > 8_760) {
    return { ok: false as const, error: 'selectionPolicy.minimumHoursToResolution must be between 0 and 8760.' }
  }
  if (!Number.isInteger(policy.maximumBookAgeSeconds) || policy.maximumBookAgeSeconds < 5 || policy.maximumBookAgeSeconds > 120) {
    return { ok: false as const, error: 'selectionPolicy.maximumBookAgeSeconds must be an integer between 5 and 120.' }
  }
  return { ok: true as const, value: policy satisfies CopySelectionPolicy }
}

function generatedExternalOrderId(
  mode: SelectionMode,
  watchedWallet: string,
  sourceReference: string,
  tokenId: string,
  ownerAddress: string,
) {
  const digest = createHash('sha256')
    .update(`${mode}:${watchedWallet.toLowerCase()}:${sourceReference.toLowerCase()}:${tokenId}:${ownerAddress.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
  return `copy:${digest}`
}

async function exactPositionCandidates(watchedWallet: string, dependencies: CopyPrepareDependencies) {
  const values = await dependencies.fetchPositions(watchedWallet)
  return values
    .map(normalizePosition)
    .filter((position): position is CopyPositionCandidate => Boolean(
      position
      && position.proxyWallet.toLowerCase() === watchedWallet.toLowerCase()
      && position.size > 0
      && position.currentValue > 0
      && !position.redeemable,
    ))
}

async function rankedPositions(
  positions: CopyPositionCandidate[],
  policy: CopySelectionPolicy,
  maxSpendUsdc: number,
  dependencies: CopyPrepareDependencies,
) {
  const inspected = await Promise.all(positions.map(async position => {
    const [markets, book] = await Promise.all([
      dependencies.fetchEventMarkets(position.eventSlug).catch(() => []),
      dependencies.fetchBook(position.asset).catch(() => null),
    ])
    const market = markets.find(item => item.conditionId.toLowerCase() === position.conditionId.toLowerCase()) ?? null
    return { position, market, book }
  }))
  return rankCopyPositionCandidates(inspected, policy, maxSpendUsdc, dependencies.now())
}

export async function preparePolymarketCopy(
  value: unknown,
  dependencies: CopyPrepareDependencies = defaultDependencies,
) {
  if (!isRecord(value)) {
    return { ok: false as const, status: 400, error: 'Copy preparation request must be a JSON object.' }
  }
  const watchedWallet = clean(value.watchedWallet, 80)
  const ownerAddress = clean(value.ownerAddress, 80)
  const analysisOnly = value.analysisOnly === true
  const expectedWallet = clean(value.polymarketWallet ?? value.depositWallet, 80)
  const transactionHash = clean(value.transactionHash ?? value.sourceTransactionHash, 80)
  const tokenId = clean(value.tokenId ?? value.sourceTokenId, 96)
  const conditionId = clean(value.conditionId, 96)
  const maxSpendUsdc = clean(value.maxSpendUsdc ?? value.amount, 32)
  const maxSpend = Number(maxSpendUsdc)
  const orderType = clean(value.orderType || 'FAK', 12).toUpperCase()
  const suppliedExternalOrderId = clean(value.externalOrderId, 80)
  const inferredMode = transactionHash ? 'TRADE' : 'POSITION'
  const selectionMode = clean(value.selectionMode || inferredMode, 24).toUpperCase() as SelectionMode
  const requestedMaxAge = Number(value.maxSignalAgeSeconds ?? 900)
  const maxSignalAgeSeconds = Number.isFinite(requestedMaxAge)
    ? Math.max(30, Math.min(86_400, Math.trunc(requestedMaxAge)))
    : 900
  const requestedCandidateLimit = Number(value.maxCandidates ?? 10)
  const maxCandidates = Number.isFinite(requestedCandidateLimit)
    ? Math.max(1, Math.min(20, Math.trunc(requestedCandidateLimit)))
    : 10

  if (!isAddress(watchedWallet)) {
    return { ok: false as const, status: 400, error: 'watchedWallet must be a valid public Polymarket address.' }
  }
  if (!analysisOnly && !isAddress(ownerAddress)) {
    return { ok: false as const, status: 400, error: 'ownerAddress must be the buyer owner EOA.' }
  }
  if (expectedWallet && !isAddress(expectedWallet)) {
    return { ok: false as const, status: 400, error: 'polymarketWallet must be a valid Deposit Wallet address.' }
  }
  if (!['TRADE', 'POSITION', 'AUTO_BEST_FIT'].includes(selectionMode)) {
    return { ok: false as const, status: 400, error: 'selectionMode must be TRADE, POSITION, or AUTO_BEST_FIT.' }
  }
  if (tokenId && !/^\d+$/.test(tokenId)) {
    return { ok: false as const, status: 400, error: 'tokenId must be a numeric CLOB outcome token ID.' }
  }
  if (conditionId && !/^0x[a-fA-F0-9]{64}$/.test(conditionId)) {
    return { ok: false as const, status: 400, error: 'conditionId must be a 32-byte Polymarket condition ID.' }
  }
  if (!/^\d+(?:\.\d{1,6})?$/.test(maxSpendUsdc) || !Number.isFinite(maxSpend) || maxSpend <= 0) {
    return { ok: false as const, status: 400, error: 'maxSpendUsdc must be a positive amount with at most 6 decimals.' }
  }
  if (orderType !== 'FAK' && orderType !== 'FOK') {
    return { ok: false as const, status: 400, error: 'Copy execution supports immediate FAK or FOK BUY orders only.' }
  }
  if (suppliedExternalOrderId && !/^[a-zA-Z0-9:_-]{8,80}$/.test(suppliedExternalOrderId)) {
    return { ok: false as const, status: 400, error: 'externalOrderId has an unsupported format.' }
  }

  let selected: {
    tokenId: string
    conditionId: string
    eventSlug: string
    outcome: string
    title: string
    sourceReference: string
    source: JsonRecord
  }
  let rankedCandidates: ReturnType<typeof rankCopyPositionCandidates> = []
  let selectionPolicy: CopySelectionPolicy | null = null

  if (selectionMode === 'TRADE') {
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return { ok: false as const, status: 400, error: 'TRADE mode requires an exact source BUY transactionHash.' }
    }
    let activities: CopyActivity[]
    try {
      activities = await dependencies.fetchActivity(getAddress(watchedWallet))
    } catch (error) {
      return {
        ok: false as const,
        status: 502,
        error: `Polymarket source activity lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      }
    }
    const hashMatches = activities.filter(activity => (
      clean(activity.type, 16).toUpperCase() === 'TRADE'
      && clean(activity.side, 12).toUpperCase() === 'BUY'
      && clean(activity.transactionHash, 80).toLowerCase() === transactionHash.toLowerCase()
      && clean(activity.proxyWallet, 80).toLowerCase() === watchedWallet.toLowerCase()
    ))
    const sourceTokenIds = [...new Set(hashMatches.map(activity => clean(activity.asset, 96)).filter(Boolean))]
    if (!tokenId && sourceTokenIds.length > 1) {
      return {
        ok: false as const,
        status: 409,
        error: 'The transaction contains multiple BUY activities. Supply tokenId to select one outcome exactly.',
        tokenIds: sourceTokenIds,
      }
    }
    const selectedTokenId = tokenId || sourceTokenIds[0] || ''
    const source = hashMatches.find(activity => clean(activity.asset, 96) === selectedTokenId)
    if (!source) {
      return { ok: false as const, status: 404, error: 'No matching public BUY activity was found for that watched wallet and transaction.' }
    }
    const timestampSeconds = Number(source.timestamp)
    const eventSlug = clean(source.eventSlug, 180)
    const outcome = clean(source.outcome, 80)
    const sourceConditionId = clean(source.conditionId, 96)
    if (!eventSlug || !outcome || !/^0x[a-fA-F0-9]{64}$/.test(sourceConditionId) || !Number.isFinite(timestampSeconds)) {
      return { ok: false as const, status: 502, error: 'The matching Polymarket activity is missing executable market metadata.' }
    }
    const ageSeconds = Math.max(0, Math.floor((dependencies.now() - timestampSeconds * 1000) / 1000))
    if (ageSeconds > maxSignalAgeSeconds) {
      return {
        ok: false as const,
        status: 409,
        error: `The source BUY is ${ageSeconds} seconds old and exceeds the ${maxSignalAgeSeconds}-second trade-copy window.`,
        nextAction: 'Use POSITION mode to intentionally evaluate an existing open position.',
      }
    }
    selected = {
      tokenId: selectedTokenId,
      conditionId: sourceConditionId,
      eventSlug,
      outcome,
      title: clean(source.title || source.slug, 180),
      sourceReference: transactionHash,
      source: {
        type: 'exact-public-buy',
        transactionHash,
        detectedAt: new Date(timestampSeconds * 1000).toISOString(),
        ageSeconds,
        sourcePrice: numberOrZero(source.price) || null,
        sourceSize: numberOrZero(source.size) || null,
        sourceUsdcSize: numberOrZero(source.usdcSize) || null,
        trustedForSizing: false,
      },
    }
  } else {
    let positions: CopyPositionCandidate[]
    try {
      positions = await exactPositionCandidates(getAddress(watchedWallet), dependencies)
    } catch (error) {
      return {
        ok: false as const,
        status: 502,
        error: `Polymarket position lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      }
    }
    if (!positions.length) {
      return { ok: false as const, status: 404, error: 'The watched wallet has no open executable positions.' }
    }

    if (selectionMode === 'POSITION') {
      if (!tokenId) return { ok: false as const, status: 400, error: 'POSITION mode requires tokenId.' }
      const matches = positions.filter(position => (
        position.asset === tokenId
        && (!conditionId || position.conditionId.toLowerCase() === conditionId.toLowerCase())
      ))
      if (matches.length !== 1) {
        return { ok: false as const, status: 404, error: 'No unique open position matches that watched wallet, tokenId, and conditionId.' }
      }
      const position = matches[0]
      selected = {
        tokenId: position.asset,
        conditionId: position.conditionId,
        eventSlug: position.eventSlug,
        outcome: position.outcome,
        title: position.title,
        sourceReference: `${position.conditionId}:${position.asset}`,
        source: {
          type: 'existing-open-position',
          size: position.size,
          currentValue: position.currentValue,
          averageEntryPrice: position.avgPrice,
          currentPrice: position.curPrice,
          cashPnl: position.cashPnl,
          percentPnl: position.percentPnl,
          trustedForSizing: false,
        },
      }
    } else {
      const parsedPolicy = parseSelectionPolicy(value.selectionPolicy, maxSpend)
      if (!parsedPolicy.ok) return { ok: false as const, status: 400, error: parsedPolicy.error }
      selectionPolicy = parsedPolicy.value
      const candidates = positions
        .sort((a, b) => b.currentValue - a.currentValue)
        .slice(0, maxCandidates)
      rankedCandidates = await rankedPositions(candidates, selectionPolicy, maxSpend, dependencies)
      const recommended = rankedCandidates.find(candidate => candidate.eligible)
      if (!recommended) {
        return {
          ok: false as const,
          status: 409,
          error: 'No watched position passes the supplied execution-quality policy.',
          rankedCandidates,
          recommendation: null,
          decision: 'BLOCK',
        }
      }
      const position = positions.find(item => item.asset === recommended.market.tokenId)
      if (!position) return { ok: false as const, status: 502, error: 'Ranked position could not be resolved.' }
      selected = {
        tokenId: position.asset,
        conditionId: position.conditionId,
        eventSlug: position.eventSlug,
        outcome: position.outcome,
        title: position.title,
        sourceReference: `${position.conditionId}:${position.asset}`,
        source: {
          type: 'deterministic-best-fit-position',
          rankingScore: recommended.score,
          rankingLabel: recommended.scoreLabel,
          rank: recommended.rank,
          trustedForProfitPrediction: false,
          trustedForSizing: false,
        },
      }
    }
  }

  let account: Awaited<ReturnType<typeof inspectPolymarketDepositWallet>>
  const sourceFingerprint = createHash('sha256')
    .update(`${selectionMode}:${watchedWallet.toLowerCase()}:${selected.sourceReference.toLowerCase()}:${selected.tokenId}`)
    .digest('hex')
  const selectionPolicyHash = selectionPolicy
    ? createHash('sha256').update(JSON.stringify(selectionPolicy)).digest('hex')
    : null

  if (analysisOnly) {
    if (suppliedExternalOrderId) {
      return {
        ok: false as const,
        status: 400,
        error: 'analysisOnly does not accept externalOrderId because no buyer-bound order is created.',
      }
    }
    return {
      ok: true as const,
      status: 200,
      data: {
        ok: true,
        flow: 'watch-select-analysis',
        selection: {
          mode: selectionMode,
          scoreMeaning: selectionMode === 'AUTO_BEST_FIT' ? 'execution-quality-not-profit-forecast' : null,
          selectedBecause: selectionMode === 'AUTO_BEST_FIT'
            ? 'Highest-ranked eligible position under the supplied deterministic selection policy.'
            : 'Explicitly selected public source.',
          policy: selectionPolicy,
          policyHash: selectionPolicyHash,
        },
        sourceSignal: {
          fingerprint: sourceFingerprint,
          watchedWallet: getAddress(watchedWallet),
          title: selected.title,
          marketUrl: `https://polymarket.com/event/${encodeURIComponent(selected.eventSlug)}`,
          conditionId: selected.conditionId,
          outcome: selected.outcome,
          tokenId: selected.tokenId,
          ...selected.source,
        },
        rankedCandidates,
        decision: 'ESCALATE',
        nextAction: 'Provide buyer ownerAddress to derive and verify the Deposit Wallet, then prepare the governed order.',
      },
    }
  }

  try {
    account = await dependencies.inspectWallet(getAddress(ownerAddress))
  } catch (error) {
    return {
      ok: false as const,
      status: Number((error as Error & { status?: number })?.status) || 502,
      error: error instanceof Error ? error.message : 'Buyer Deposit Wallet derivation failed.',
    }
  }
  if (expectedWallet && account.depositWalletAddress.toLowerCase() !== expectedWallet.toLowerCase()) {
    return {
      ok: false as const,
      status: 409,
      error: 'The supplied Polymarket wallet does not match the Deposit Wallet derived from ownerAddress.',
      derivedDepositWallet: account.depositWalletAddress,
    }
  }
  if (!account.deployed) {
    return {
      ok: false as const,
      status: 409,
      error: 'The buyer Deposit Wallet is not deployed on Polygon.',
      state: 'activation_required',
      ownerAddress: account.ownerAddress,
      depositWalletAddress: account.depositWalletAddress,
      nextAction: 'SETUP_DEPOSIT_WALLET',
    }
  }

  const canonicalExternalOrderId = generatedExternalOrderId(
    selectionMode,
    watchedWallet,
    selected.sourceReference,
    selected.tokenId,
    ownerAddress,
  )
  if (suppliedExternalOrderId && suppliedExternalOrderId !== canonicalExternalOrderId) {
    return {
      ok: false as const,
      status: 409,
      error: 'externalOrderId does not match the canonical source-bound copy ID.',
      canonicalExternalOrderId,
      nextAction: 'Retry with canonicalExternalOrderId or omit externalOrderId and let PolyDesk generate it.',
    }
  }
  const externalOrderId = canonicalExternalOrderId
  const marketUrl = `https://polymarket.com/event/${encodeURIComponent(selected.eventSlug)}`
  const prepared = await dependencies.prepareOpen({
    externalOrderId,
    marketUrl,
    outcome: selected.outcome,
    maxSpendUsdc,
    wallet: account.depositWalletAddress,
    orderType,
    tokenId: selected.tokenId,
  })
  if (!prepared.ok) return prepared
  if (
    selectionPolicy
    && Number(prepared.data.market.executionPrice) > selectionPolicy.maximumPrice
  ) {
    return {
      ok: false as const,
      status: 409,
      error: 'The refreshed execution price no longer passes selectionPolicy.maximumPrice.',
      decision: 'BLOCK',
    }
  }

  return {
    ok: true as const,
    status: 200,
    data: {
      ...prepared.data,
      flow: 'watch-select-verify-fund-govern-sign-buy',
      selection: {
        mode: selectionMode,
        scoreMeaning: selectionMode === 'AUTO_BEST_FIT' ? 'execution-quality-not-profit-forecast' : null,
        selectedBecause: selectionMode === 'AUTO_BEST_FIT'
          ? 'Highest-ranked eligible position under the supplied deterministic selection policy.'
          : 'Explicitly selected public source.',
        policy: selectionPolicy,
        policyHash: selectionPolicyHash,
        canonicalExternalOrderId,
      },
      sourceSignal: {
        fingerprint: sourceFingerprint,
        watchedWallet: getAddress(watchedWallet),
        title: selected.title,
        marketUrl,
        conditionId: selected.conditionId,
        outcome: selected.outcome,
        tokenId: selected.tokenId,
        ...selected.source,
      },
      rankedCandidates,
      buyerAccount: {
        ownerAddress: account.ownerAddress,
        depositWalletAddress: account.depositWalletAddress,
        derivedMatchVerified: true,
        watchedWalletControlsBuyerFunds: false,
      },
      authority: {
        defaultDecision: 'ESCALATE',
        autonomousBuyAllowedOnlyWithValidMandate: true,
        nextEndpoint: '/api/polymarket-governed-open/authorize',
      },
    },
  }
}

export default async function polymarketCopyPrepareHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const result = await preparePolymarketCopy(req.body)
  if (!result.ok) {
    const { status, ...body } = result
    return res.status(status).json(body)
  }
  return res.status(result.status).json(result.data)
}
