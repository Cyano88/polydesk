import type { Request, Response } from 'express'
import { getPolyWorldcupNewsFeed, type PolyWorldCupArticle } from './poly-worldcup-news.js'
import { buildLiveScout } from './x402-polymarket-scout.js'

type PulseOpportunity = {
  title?: string
  marketUrl?: string
  image?: string
  description?: string
  dailyReward?: number
  liveSpread?: number
  depthAtTwoCents?: number
  suggestedYesBid?: number
  suggestedNoBid?: number
  maxSpread?: number
  minSize?: number
  liquidity?: number
  daysToResolve?: number
  lpExecutionRisk?: string
  score?: number
  scoutReason?: string
  executionPlan?: string[]
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

function opportunities(result: Awaited<ReturnType<typeof buildLiveScout>>) {
  return Array.isArray(result.opportunities) ? result.opportunities as PulseOpportunity[] : []
}

function opportunityKey(opportunity: PulseOpportunity) {
  return `${opportunity.marketUrl || ''}|${opportunity.title || ''}`.toLowerCase()
}

function validOpportunity(opportunity: PulseOpportunity | undefined): opportunity is PulseOpportunity {
  return Boolean(opportunity?.title && opportunity?.marketUrl?.startsWith('https://polymarket.com/event/'))
}

function highlight(kind: PulseHighlight['kind'], opportunity: PulseOpportunity, context: string, image = '', source = ''): PulseHighlight {
  return {
    id: `${kind}:${opportunityKey(opportunity)}`,
    kind,
    eyebrow: kind === 'news' ? 'News match' : kind === 'football' ? 'Football match' : 'Best LP market',
    context,
    source,
    image: image || opportunity.image,
    opportunity,
  }
}

async function strongestNewsMatch(articles: PolyWorldCupArticle[]) {
  const candidates = articles.slice(0, 3)
  const results = await Promise.all(candidates.map(async article => {
    const scout = await buildLiveScout({
      mode: 'news',
      context: article.title,
      candidateLimit: 4,
      opportunityLimit: 1,
    })
    return { article, opportunity: opportunities(scout)[0] }
  }))
  return results
    .filter((item): item is { article: PolyWorldCupArticle; opportunity: PulseOpportunity } => validOpportunity(item.opportunity))
    .sort((a, b) => Number(b.opportunity.score ?? 0) - Number(a.opportunity.score ?? 0))[0]
}

async function buildPulseFeed(): Promise<PulseFeed> {
  const [newsResult, footballResult, bestResult] = await Promise.allSettled([
    getPolyWorldcupNewsFeed(),
    buildLiveScout({ mode: 'football', candidateLimit: 8, opportunityLimit: 3 }),
    buildLiveScout({ mode: 'best', candidateLimit: 16, opportunityLimit: 8 }),
  ])

  const newsFeed = newsResult.status === 'fulfilled' ? newsResult.value : null
  const footballScout = footballResult.status === 'fulfilled' ? footballResult.value : null
  const bestScout = bestResult.status === 'fulfilled' ? bestResult.value : null
  const newsMatch = newsFeed?.mode === 'live'
    ? await strongestNewsMatch(newsFeed.articles).catch(() => undefined)
    : undefined
  const bestFootball = footballScout ? opportunities(footballScout).find(validOpportunity) : undefined
  const bestLp = bestScout ? opportunities(bestScout).find(validOpportunity) : undefined

  const highlights: PulseHighlight[] = []
  if (newsMatch) {
    highlights.push(highlight(
      'news',
      newsMatch.opportunity,
      newsMatch.article.title,
      newsMatch.article.image,
      newsMatch.article.source,
    ))
  } else {
    highlights.push({
      id: 'news:unavailable',
      kind: 'news',
      eyebrow: 'News match',
      context: 'Live market matching',
      opportunity: {
        title: 'No precise market match yet',
        description: 'Pulse will replace this when a live headline and an eligible Polymarket book align.',
      },
    })
  }
  if (bestFootball) {
    highlights.push(highlight(
      'football',
      bestFootball,
      bestFootball.footballContext?.fixture || bestFootball.title || 'Verified football fixture',
      bestFootball.image,
      bestFootball.footballContext?.provider || '',
    ))
  } else {
    highlights.push({
      id: 'football:unavailable',
      kind: 'football',
      eyebrow: 'Football',
      context: 'Verified fixture matching',
      opportunity: {
        title: 'Football markets are coming',
        description: 'Pulse is waiting for a verified fixture and an eligible matched Polymarket book.',
      },
    })
  }
  if (bestLp) {
    highlights.push(highlight(
      'lp',
      bestLp,
      bestLp.scoutReason || 'Best current conservative maker opportunity',
      bestLp.image,
      'Polymarket CLOB',
    ))
  }

  const seen = new Set<string>()
  const markets = [
    ...highlights.map(item => item.opportunity),
    ...(bestScout ? opportunities(bestScout) : []),
    ...(footballScout ? opportunities(footballScout) : []),
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
      news: newsMatch ? 'live' : 'unavailable',
      football: bestFootball ? 'live' : 'unavailable',
      polymarket: bestLp ? 'live' : 'unavailable',
    },
  }
}

export async function getPulseFeed(force = false) {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.feed
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

export default async function pulseHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  return res.json(await getPulseFeed())
}
