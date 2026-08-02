import type { Request, Response } from 'express'
import { buildLiveScout } from './x402-polymarket-scout.js'

type PulseOpportunity = {
  title?: string
  marketSlug?: string
  marketUrl?: string
  image?: string
  description?: string
  dailyReward?: number
  liveSpread?: number
  depthAtTwoCents?: number
  suggestedYesBid?: number
  suggestedNoBid?: number
  tickSize?: string
  maxSpread?: number
  minSize?: number
  estimatedRewardCapitalUsdc?: number
  liquidity?: number
  daysToResolve?: number
  lpExecutionRisk?: string
  score?: number
  scoutReason?: string
  executionPlan?: string[]
  contextSignals?: Array<{
    kind: 'news' | 'football'
    label: string
    source: string
    title: string
    url?: string
    publishedAt?: string
  }>
  footballContext?: {
    fixture?: string
    status?: string
    kickoffAt?: string
    goalScorers?: string[]
    stats?: string[]
    sourceUrl?: string
    provider?: string
  }
}

type PulseHighlight = {
  id: string
  kind: 'news' | 'football' | 'lp'
  rank: 1 | 2 | 3
  eyebrow: string
  context: string
  source?: string
  image?: string
  opportunity: PulseOpportunity
}

type PulseFeed = {
  ok: true
  updatedAt: string
  refreshAfterSeconds: number
  highlights: PulseHighlight[]
  markets: PulseOpportunity[]
  providers: {
    news: 'live' | 'unavailable'
    football: 'live' | 'unavailable'
    polymarket: 'live' | 'unavailable'
  }
}

let cache: { expiresAt: number; feed: PulseFeed } | null = null
let pending: Promise<PulseFeed> | null = null
const CACHE_MS = 60_000
const STALE_CACHE_MS = 10 * 60_000

function opportunities(result: Awaited<ReturnType<typeof buildLiveScout>>) {
  return Array.isArray(result.opportunities) ? result.opportunities as PulseOpportunity[] : []
}

function opportunityKey(opportunity: PulseOpportunity) {
  return `${opportunity.marketUrl || ''}|${opportunity.title || ''}`.toLowerCase()
}

function validOpportunity(opportunity: PulseOpportunity | undefined): opportunity is PulseOpportunity {
  return Boolean(opportunity?.title && opportunity?.marketUrl?.startsWith('https://polymarket.com/event/'))
}

function highlight(kind: PulseHighlight['kind'], rank: PulseHighlight['rank'], opportunity: PulseOpportunity, context: string, image = '', source = ''): PulseHighlight {
  return {
    id: `${kind}:${opportunityKey(opportunity)}`,
    kind,
    rank,
    eyebrow: kind === 'news' ? 'News match' : kind === 'football' ? 'Football match' : 'Best LP market',
    context,
    source,
    image: image || opportunity.image,
    opportunity,
  }
}

async function buildPulseFeed(): Promise<PulseFeed> {
  const [bestResult] = await Promise.allSettled([
    buildLiveScout({ mode: 'best', candidateLimit: 80, opportunityLimit: 10 }),
  ])

  const bestScout = bestResult.status === 'fulfilled' ? bestResult.value : null
  const bestMarkets = bestScout
    ? opportunities(bestScout)
        .filter(validOpportunity)
        .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
        .slice(0, 3)
    : []
  const bestLp = bestMarkets[0]
  const matchedContext = bestMarkets.flatMap(market => market.contextSignals ?? [])

  const highlights: PulseHighlight[] = []
  for (const [index, opportunity] of bestMarkets.entries()) {
    highlights.push(highlight(
      'lp',
      (index + 1) as PulseHighlight['rank'],
      opportunity,
      opportunity.scoutReason || 'Strong live liquidity opportunity',
      opportunity.image,
      'Polymarket CLOB',
    ))
    highlights[highlights.length - 1].eyebrow = index === 0 ? 'Strongest opportunity' : 'Ranked opportunity'
  }
  const seen = new Set<string>()
  const markets = [
    ...highlights.map(item => item.opportunity),
    ...(bestScout ? opportunities(bestScout) : []),
  ]
    .filter(validOpportunity)
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .filter(opportunity => {
      const key = opportunityKey(opportunity)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    refreshAfterSeconds: CACHE_MS / 1000,
    highlights,
    markets,
    providers: {
      news: matchedContext.some(signal => signal.kind === 'news') ? 'live' : 'unavailable',
      football: matchedContext.some(signal => signal.kind === 'football') ? 'live' : 'unavailable',
      polymarket: bestLp ? 'live' : 'unavailable',
    },
  }
}

function refreshPulseFeed() {
  if (pending) return pending
  pending = buildPulseFeed()
    .then(feed => {
      cache = { expiresAt: Date.now() + CACHE_MS, feed }
      return feed
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export function getPulseCacheStatus() {
  if (!cache) return pending ? 'warming' : 'cold'
  return cache.expiresAt > Date.now() ? 'fresh' : 'stale'
}

export async function getPulseFeed(force = false) {
  const now = Date.now()
  if (!force && cache) {
    if (cache.expiresAt > now) return cache.feed
    if (cache.expiresAt + STALE_CACHE_MS > now) {
      void refreshPulseFeed().catch(() => undefined)
      return cache.feed
    }
  }
  return refreshPulseFeed()
}

export default async function pulseHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  const startedAt = Date.now()
  const cacheStatus = getPulseCacheStatus()
  const feed = await getPulseFeed()
  const durationMs = Date.now() - startedAt
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  res.setHeader('Server-Timing', `pulse;dur=${durationMs}`)
  res.setHeader('X-PolyDesk-Pulse-Cache', cacheStatus)
  if (durationMs >= 1_000) {
    console.info('[pulse-request]', { cacheStatus, durationMs, markets: feed.markets.length })
  }
  return res.json(feed)
}
