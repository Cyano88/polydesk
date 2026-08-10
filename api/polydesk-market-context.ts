import { timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { validateLolahNewsEvent, type LolahEventType, type LolahNewsEvent } from './lolah-news-event.js'

type JsonRecord = Record<string, unknown>

export const POLYDESK_MARKET_CONTEXT_SCHEMA = 'polydesk-market-context-v1' as const

type BookLevel = { price?: string | number; size?: string | number }
type BookPayload = {
  bids?: BookLevel[]
  asks?: BookLevel[]
  timestamp?: string | number
  last_trade_price?: string | number
}
type HistoryPoint = { t?: string | number; p?: string | number }

export type PolydeskMarketCandidate = {
  eventId?: string
  conditionId?: string
  question: string
  description?: string
  resolutionSource?: string
  eventSlug?: string
  marketSlug?: string
  active: boolean
  closed: boolean
  enableOrderBook: boolean
  acceptingOrders: boolean
  endDate?: string
  outcomes: string[]
  outcomePrices: number[]
  clobTokenIds: string[]
  volumeUsd?: number
  liquidityUsd?: number
  openInterestUsd?: number
}

export type RankedPolydeskMarket = PolydeskMarketCandidate & {
  matchConfidence: number
  matchReasons: string[]
  marketUrl?: string
}

export type PolydeskMarketContextDependencies = {
  searchMarkets: (event: LolahNewsEvent) => Promise<PolydeskMarketCandidate[]>
  fetchBook: (tokenId: string) => Promise<BookPayload | null>
  fetchPriceHistory: (tokenId: string, publishedAt: string, observedAt: string) => Promise<HistoryPoint[]>
  now: () => Date
}

export type PolydeskMarketContextHandlerOptions = {
  authorization?: 'required' | 'disabled_loopback_staging'
  serviceToken?: () => string
}

const EVENT_TERMS: Record<LolahEventType, string[]> = {
  shutdown: ['shutdown', 'shut down', 'cease operations', 'ceases operations', 'wind down', 'closure', 'bankrupt', 'insolvent'],
  exploit: ['exploit', 'exploited', 'hack', 'hacked', 'breach', 'drain', 'stolen'],
  delisting: ['delist', 'delisted', 'delisting', 'remove trading', 'trading removal'],
  listing: ['list', 'listed', 'listing', 'launch trading', 'trading launch'],
  token_unlock: ['token unlock', 'unlock', 'vesting', 'release tokens'],
  acquisition: ['acquire', 'acquired', 'acquisition', 'merger', 'buyout'],
  lawsuit: ['lawsuit', 'sued', 'litigation', 'court case', 'legal action'],
  regulatory_action: ['regulator', 'regulatory', 'enforcement', 'sanction', 'ban', 'investigation'],
  leadership_change: ['resign', 'resigned', 'appointed', 'chief executive', 'leadership', 'founder leaves'],
  partnership: ['partnership', 'partners with', 'collaboration', 'integrates with', 'integration'],
  governance_decision: ['governance', 'proposal', 'vote', 'approved', 'rejected'],
  network_outage: ['outage', 'network down', 'halted', 'downtime', 'stopped producing blocks'],
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'announces', 'before', 'being', 'could', 'from',
  'have', 'into', 'market', 'more', 'news', 'project', 'says', 'that', 'their', 'there', 'these',
  'this', 'through', 'today', 'will', 'with', 'would', 'year',
])

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requireOnlyFields(value: JsonRecord, allowedFields: readonly string[], label: string) {
  const allowed = new Set(allowedFields)
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown) throw new Error(`Unsupported ${label} field: ${unknown}.`)
}

function numeric(value: unknown) {
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : undefined
}

function boolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return fallback
}

function string(value: unknown) {
  const result = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return result || undefined
}

function stringArray(value: unknown): string[] {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      parsed = value.split(',')
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map(item => String(item ?? '').trim()).filter(Boolean)
}

function numberArray(value: unknown): number[] {
  return stringArray(value).map(Number).filter(item => Number.isFinite(item) && item >= 0 && item <= 1)
}

function tokens(value: string) {
  return new Set(value.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token)))
}

function phrasePresent(text: string, phrase: string) {
  const normalizedText = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  const normalizedPhrase = ` ${phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  return normalizedPhrase.trim().length > 1 && normalizedText.includes(normalizedPhrase)
}

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(value, 1)) * 100) / 100
}

function roundMetric(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function marketUrl(candidate: PolydeskMarketCandidate) {
  const slug = candidate.eventSlug || candidate.marketSlug
  return slug && /^[a-z0-9-]+$/i.test(slug) ? `https://polymarket.com/event/${slug}` : undefined
}

function scoreCandidate(event: LolahNewsEvent, candidate: PolydeskMarketCandidate, now: Date): RankedPolydeskMarket | null {
  if (!candidate.active || candidate.closed || !candidate.enableOrderBook || !candidate.acceptingOrders) return null
  const endAt = candidate.endDate ? Date.parse(candidate.endDate) : Number.NaN
  if (Number.isFinite(endAt) && endAt <= now.getTime()) return null

  const searchable = [candidate.question, candidate.description, candidate.resolutionSource].filter(Boolean).join(' ')
  const candidateTokens = tokens(searchable)
  const entityScores = event.entities.map(entity => {
    const entityTokens = [...tokens(entity)]
    if (!entityTokens.length) return 0
    const tokenCoverage = entityTokens.filter(token => candidateTokens.has(token)).length / entityTokens.length
    return phrasePresent(searchable, entity) ? 1 : tokenCoverage
  })
  const entityCoverage = Math.max(...entityScores, 0)
  if (entityCoverage < 0.5) return null

  const eventTerms = EVENT_TERMS[event.eventType]
  const matchedTerm = eventTerms.find(term => phrasePresent(searchable, term))
  const sourceTokens = tokens(`${event.headline} ${event.summary ?? ''}`)
  const overlap = [...sourceTokens].filter(token => candidateTokens.has(token))
  const headlineCoverage = sourceTokens.size ? overlap.length / sourceTokens.size : 0
  const tradability = candidate.clobTokenIds.length >= 2 ? 1 : 0.5
  const horizon = !Number.isFinite(endAt) || endAt >= Date.parse(event.publishedAt) ? 1 : 0
  const score = clampScore(
    entityCoverage * 0.4
    + (matchedTerm ? 1 : 0) * 0.3
    + Math.min(headlineCoverage, 1) * 0.2
    + tradability * 0.05
    + horizon * 0.05,
  )
  const matchReasons = [
    `Entity coverage ${Math.round(entityCoverage * 100)}%.`,
    matchedTerm ? `Event language matched “${matchedTerm}”.` : 'No explicit event-type phrase matched.',
    `Headline token overlap ${Math.round(headlineCoverage * 100)}%.`,
  ]
  return { ...candidate, matchConfidence: score, matchReasons, ...(marketUrl(candidate) ? { marketUrl: marketUrl(candidate) } : {}) }
}

function parseBook(payload: BookPayload | null) {
  if (!payload) return {}
  const bids = (payload.bids ?? []).map(level => ({ price: numeric(level.price), size: numeric(level.size) }))
    .filter((level): level is { price: number; size: number } => level.price !== undefined && level.size !== undefined)
  const asks = (payload.asks ?? []).map(level => ({ price: numeric(level.price), size: numeric(level.size) }))
    .filter((level): level is { price: number; size: number } => level.price !== undefined && level.size !== undefined)
  const bestBid = bids.length ? Math.max(...bids.map(level => level.price)) : undefined
  const bestAsk = asks.length ? Math.min(...asks.map(level => level.price)) : undefined
  const midpoint = bestBid !== undefined && bestAsk !== undefined ? roundMetric((bestBid + bestAsk) / 2) : bestBid ?? bestAsk
  const spread = bestBid !== undefined && bestAsk !== undefined ? roundMetric(Math.max(0, bestAsk - bestBid)) : undefined
  const nearTouchDepthShares = [
    ...bids.filter(level => bestBid !== undefined && bestBid - level.price <= 0.02),
    ...asks.filter(level => bestAsk !== undefined && level.price - bestAsk <= 0.02),
  ].reduce((sum, level) => sum + level.size, 0)
  return {
    bestBid,
    bestAsk,
    midpoint,
    spread,
    nearTouchDepthShares,
    lastTradePrice: numeric(payload.last_trade_price),
    bookTimestamp: payload.timestamp === undefined ? undefined : String(payload.timestamp),
  }
}

function historicalConsensus(points: HistoryPoint[], publishedAt: string) {
  const eventSeconds = Math.floor(Date.parse(publishedAt) / 1_000)
  const normalized = points.map(point => ({ t: numeric(point.t), p: numeric(point.p) }))
    .filter((point): point is { t: number; p: number } => point.t !== undefined && point.p !== undefined && point.p >= 0 && point.p <= 1)
    .sort((left, right) => left.t - right.t)
  const before = [...normalized].reverse().find(point => point.t <= eventSeconds)?.p
  return { before, latest: normalized.at(-1)?.p }
}

function yesIndex(candidate: PolydeskMarketCandidate) {
  const index = candidate.outcomes.findIndex(outcome => outcome.toLowerCase() === 'yes')
  return index >= 0 ? index : 0
}

export async function buildPolydeskMarketContext(
  rawEvent: unknown,
  dependencies: PolydeskMarketContextDependencies,
  minimumMatchConfidence = 0.55,
) {
  const event = validateLolahNewsEvent(rawEvent)
  const observedAt = dependencies.now().toISOString()
  const threshold = Math.max(0.5, Math.min(minimumMatchConfidence, 0.9))
  const candidates = (await dependencies.searchMarkets(event))
    .map(candidate => scoreCandidate(event, candidate, dependencies.now()))
    .filter((candidate): candidate is RankedPolydeskMarket => Boolean(candidate))
    .sort((left, right) => right.matchConfidence - left.matchConfidence)
  const alternatives = candidates.slice(0, 3)
  const top = alternatives[0]
  if (!top || top.matchConfidence < threshold) {
    return {
      schema: POLYDESK_MARKET_CONTEXT_SCHEMA,
      provider: 'polydesk',
      eventId: event.eventId,
      matchStatus: 'no_relevant_market' as const,
      searchedAt: observedAt,
      reason: 'No active market passed the entity, event, tradability, and confidence checks.',
      confidenceAdjustment: 'reduce' as const,
      candidates: alternatives,
    }
  }
  const runnerUp = alternatives[1]
  if (runnerUp && top.matchConfidence - runnerUp.matchConfidence < 0.08) {
    return {
      schema: POLYDESK_MARKET_CONTEXT_SCHEMA,
      provider: 'polydesk',
      eventId: event.eventId,
      matchStatus: 'ambiguous' as const,
      searchedAt: observedAt,
      reason: 'Multiple active markets are similarly relevant; an automated trade must not rely on an arbitrary selection.',
      confidenceAdjustment: 'block_trade' as const,
      candidates: alternatives,
    }
  }

  const outcomeIndex = yesIndex(top)
  const tokenId = top.clobTokenIds[outcomeIndex]
  const [bookResult, historyResult] = tokenId
    ? await Promise.allSettled([
        dependencies.fetchBook(tokenId),
        dependencies.fetchPriceHistory(tokenId, event.publishedAt, observedAt),
      ])
    : [
        { status: 'rejected', reason: new Error('Token unavailable.') } as PromiseRejectedResult,
        { status: 'rejected', reason: new Error('Token unavailable.') } as PromiseRejectedResult,
      ]
  const bookPayload = bookResult.status === 'fulfilled' ? bookResult.value : null
  const historyPoints = historyResult.status === 'fulfilled' ? historyResult.value : []
  const marketDataStatus = bookResult.status === 'fulfilled' && historyResult.status === 'fulfilled'
    ? 'complete'
    : 'partial'
  const book = parseBook(bookPayload)
  const history = historicalConsensus(historyPoints, event.publishedAt)
  const probabilityNow = book.midpoint ?? top.outcomePrices[outcomeIndex] ?? history.latest
  const probabilityBeforeNews = history.before
  const probabilityChange = probabilityNow !== undefined && probabilityBeforeNews !== undefined
    ? Math.round((probabilityNow - probabilityBeforeNews) * 10_000) / 10_000
    : undefined

  return {
    schema: POLYDESK_MARKET_CONTEXT_SCHEMA,
    provider: 'polydesk',
    eventId: event.eventId,
    matchStatus: 'matched' as const,
    searchedAt: observedAt,
    match: top,
    consensus: {
      outcome: top.outcomes[outcomeIndex] ?? 'Yes',
      tokenId,
      marketDataStatus,
      probabilityNow,
      probabilityBeforeNews,
      probabilityChange,
      bestBid: book.bestBid,
      bestAsk: book.bestAsk,
      spread: book.spread,
      nearTouchDepthShares: book.nearTouchDepthShares,
      lastTradePrice: book.lastTradePrice,
      volumeUsd: top.volumeUsd,
      liquidityUsd: top.liquidityUsd,
      openInterestUsd: top.openInterestUsd,
      observedAt,
    },
    candidates: alternatives,
  }
}

function normalizeMarket(raw: JsonRecord, event: JsonRecord): PolydeskMarketCandidate | null {
  const question = string(raw.question) || string(raw.title)
  if (!question) return null
  const eventSlug = string(event.slug)
  const endDate = string(raw.endDate) || string(raw.endDateIso) || string(event.endDate)
  return {
    eventId: string(event.id),
    conditionId: string(raw.conditionId) || string(raw.condition_id),
    question,
    description: string(raw.description) || string(event.description),
    resolutionSource: string(raw.resolutionSource) || string(event.resolutionSource),
    eventSlug,
    marketSlug: string(raw.slug),
    active: boolean(raw.active, boolean(event.active, true)),
    closed: boolean(raw.closed, boolean(event.closed, false)),
    enableOrderBook: boolean(raw.enableOrderBook, boolean(event.enableOrderBook, false)),
    acceptingOrders: boolean(raw.acceptingOrders, boolean(raw.enableOrderBook, false)),
    endDate,
    outcomes: stringArray(raw.outcomes),
    outcomePrices: numberArray(raw.outcomePrices),
    clobTokenIds: stringArray(raw.clobTokenIds),
    volumeUsd: numeric(raw.volumeNum) ?? numeric(raw.volume) ?? numeric(event.volume),
    liquidityUsd: numeric(raw.liquidityNum) ?? numeric(raw.liquidity) ?? numeric(event.liquidity),
    openInterestUsd: numeric(raw.openInterest) ?? numeric(event.openInterest),
  }
}

async function fetchJson(url: string, timeoutMs = 8_000) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`Upstream request failed with HTTP ${response.status}.`)
  return response.json() as Promise<unknown>
}

async function searchLiveMarkets(event: LolahNewsEvent) {
  const queries = [event.headline, `${event.entities[0]} ${EVENT_TERMS[event.eventType][0]}`]
  const results = await Promise.allSettled(queries.map(async query => {
    const params = new URLSearchParams({
      q: query,
      events_status: 'active',
      limit_per_type: '10',
      keep_closed_markets: '0',
      search_profiles: 'false',
      search_tags: 'false',
    })
    return fetchJson(`https://gamma-api.polymarket.com/public-search?${params.toString()}`)
  }))
  const payloads = results
    .filter((result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled')
    .map(result => result.value)
  if (!payloads.length) throw new Error('Polymarket search is unavailable.')
  const unique = new Map<string, PolydeskMarketCandidate>()
  for (const payload of payloads) {
    if (!isRecord(payload) || !Array.isArray(payload.events)) continue
    for (const rawEvent of payload.events) {
      if (!isRecord(rawEvent) || !Array.isArray(rawEvent.markets)) continue
      for (const rawMarket of rawEvent.markets) {
        if (!isRecord(rawMarket)) continue
        const candidate = normalizeMarket(rawMarket, rawEvent)
        if (!candidate) continue
        const key = candidate.conditionId || `${candidate.eventSlug}:${candidate.marketSlug}:${candidate.question}`
        unique.set(key, candidate)
      }
    }
  }
  return [...unique.values()]
}

export const livePolydeskMarketContextDependencies: PolydeskMarketContextDependencies = {
  searchMarkets: searchLiveMarkets,
  fetchBook: async tokenId => fetchJson(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`) as Promise<BookPayload>,
  fetchPriceHistory: async (tokenId, publishedAt, observedAt) => {
    const params = new URLSearchParams({
      market: tokenId,
      startTs: String(Math.max(0, Math.floor(Date.parse(publishedAt) / 1_000) - 6 * 60 * 60)),
      endTs: String(Math.floor(Date.parse(observedAt) / 1_000)),
      fidelity: '5',
    })
    const payload = await fetchJson(`https://clob.polymarket.com/prices-history?${params.toString()}`)
    return isRecord(payload) && Array.isArray(payload.history) ? payload.history.filter(isRecord) as HistoryPoint[] : []
  },
  now: () => new Date(),
}

function publicError(error: unknown) {
  return (error instanceof Error ? error.message : 'Unable to build PolyDesk market context.')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .slice(0, 280)
}

function bearerToken(req: Request) {
  const authorization = String(req.headers.authorization ?? '').trim()
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

function sameToken(supplied: string, expected: string) {
  const suppliedBytes = Buffer.from(supplied, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  return suppliedBytes.length === expectedBytes.length
    && suppliedBytes.length > 0
    && timingSafeEqual(suppliedBytes, expectedBytes)
}

export function createPolydeskMarketContextHandler(
  dependencies = livePolydeskMarketContextDependencies,
  options: PolydeskMarketContextHandlerOptions = {},
) {
  return async function polydeskMarketContextHandler(req: Request, res: Response) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Use POST for Prediction Market Context.' })
    }
    if (options.authorization !== 'disabled_loopback_staging') {
      const expected = String(
        options.serviceToken?.() ?? process.env.POLYDESK_MARKET_CONTEXT_TOKEN ?? '',
      ).trim()
      if (expected.length < 32) {
        return res.status(503).json({ ok: false, error: 'Prediction Market Context is not configured.' })
      }
      if (!sameToken(bearerToken(req), expected)) {
        res.setHeader('WWW-Authenticate', 'Bearer realm=polydesk-market-context')
        return res.status(401).json({ ok: false, error: 'Prediction Market Context authorization failed.' })
      }
    }
    try {
      if (!isRecord(req.body)) throw new Error('Request body must be a JSON object.')
      requireOnlyFields(req.body, ['event', 'minimumMatchConfidence'], 'request')
      const minimum = req.body.minimumMatchConfidence === undefined ? 0.55 : numeric(req.body.minimumMatchConfidence)
      if (minimum === undefined || minimum < 0.5 || minimum > 0.9) {
        throw new Error('minimumMatchConfidence must be from 0.5 through 0.9.')
      }
      const data = await buildPolydeskMarketContext(req.body.event, dependencies, minimum)
      return res.status(200).json({ ok: true, data })
    } catch (error) {
      const message = publicError(error)
      const upstream = /Upstream request failed|Polymarket search is unavailable|fetch failed|timeout/i.test(message)
      return res.status(upstream ? 502 : 400).json({ ok: false, error: message })
    }
  }
}

export default createPolydeskMarketContextHandler()
