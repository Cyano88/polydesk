import { getPolyStreamFeed } from './poly-stream.js'
import { getPolyWorldcupNewsFeed, type PolyWorldCupArticle } from './poly-worldcup-news.js'

export type LpContextSignal = {
  kind: 'news' | 'football'
  label: 'News context' | 'Football context'
  source: string
  title: string
  url?: string
  publishedAt?: string
}

type ContextOpportunity = {
  title?: string
  marketUrl?: string
  description?: string
  contextSignals?: LpContextSignal[]
}

type FootballMatch = {
  title?: string
  polymarketTitle?: string
  polymarketUrl?: string
  sourceUrl?: string
  kickoffAt?: string
  marketStatus?: string
}

type ContextSnapshot = {
  news: PolyWorldCupArticle[]
  newsSource: string
  football: FootballMatch[]
  footballSource: string
}

const CONTEXT_CACHE_MS = 5 * 60_000
const NEWS_MAX_AGE_MS = 72 * 60 * 60_000
const CONTEXT_WAIT_MS = 3_500
const STOP_WORDS = new Set([
  'about', 'after', 'against', 'before', 'being', 'could', 'from', 'have', 'into',
  'market', 'markets', 'more', 'news', 'polymarket', 'signed', 'that', 'their',
  'there', 'these', 'this', 'through', 'under', 'what', 'when', 'where', 'which',
  'while', 'will', 'with', 'would', 'year',
])

let cache: { expiresAt: number; snapshot: ContextSnapshot } | null = null
let pending: Promise<ContextSnapshot> | null = null

function normalized(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: unknown) {
  return new Set(
    normalized(value)
      .split(/\s+/)
      .filter(token => token.length >= 4 && !STOP_WORDS.has(token)),
  )
}

function canonicalMarketUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? '').trim())
    if (url.hostname !== 'polymarket.com' && url.hostname !== 'www.polymarket.com') return ''
    return `${url.origin.replace('www.', '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return ''
  }
}

function recentArticle(article: PolyWorldCupArticle, now = Date.now()) {
  const publishedAt = Date.parse(article.publishedAt)
  return Boolean(
    article.url
    && Number.isFinite(publishedAt)
    && publishedAt <= now + 5 * 60_000
    && now - publishedAt <= NEWS_MAX_AGE_MS,
  )
}

export function articleMatchesOpportunity(
  opportunity: Pick<ContextOpportunity, 'title' | 'description'>,
  article: Pick<PolyWorldCupArticle, 'title' | 'description' | 'url' | 'publishedAt'>,
  now = Date.now(),
) {
  if (!recentArticle(article as PolyWorldCupArticle, now)) return false
  const marketTokens = tokens(`${opportunity.title ?? ''} ${opportunity.description ?? ''}`)
  const articleTokens = tokens(`${article.title} ${article.description}`)
  if (marketTokens.size < 2 || articleTokens.size < 2) return false
  const shared = [...marketTokens].filter(token => articleTokens.has(token))
  if (shared.length < 2) return false
  const distinctiveMatch = shared.some(token => token.length >= 7 || /\d/.test(token))
  const overlap = shared.length / Math.min(marketTokens.size, articleTokens.size)
  return distinctiveMatch && overlap >= 0.3
}

export function footballMatchMatchesOpportunity(
  opportunity: Pick<ContextOpportunity, 'marketUrl'>,
  match: FootballMatch,
) {
  return (
    match.marketStatus === 'matched'
    && Boolean(canonicalMarketUrl(opportunity.marketUrl))
    && canonicalMarketUrl(opportunity.marketUrl) === canonicalMarketUrl(match.polymarketUrl)
  )
}

async function buildContextSnapshot(): Promise<ContextSnapshot> {
  const today = new Date().toISOString().slice(0, 10)
  const [newsResult, footballResult] = await Promise.allSettled([
    getPolyWorldcupNewsFeed(),
    getPolyStreamFeed(today),
  ])
  const newsFeed = newsResult.status === 'fulfilled' ? newsResult.value : null
  const footballFeed = footballResult.status === 'fulfilled' ? footballResult.value : null
  return {
    news: newsFeed?.mode === 'live'
      ? newsFeed.articles.filter(article => recentArticle(article))
      : [],
    newsSource: newsFeed?.mode === 'live' ? newsFeed.source : '',
    football: footballFeed?.providerStatus === 'connected'
      ? footballFeed.matches as FootballMatch[]
      : [],
    footballSource: footballFeed?.providerStatus === 'connected' ? footballFeed.source : '',
  }
}

async function getContextSnapshot() {
  if (cache && cache.expiresAt > Date.now()) return cache.snapshot
  if (pending) return pending
  pending = buildContextSnapshot()
    .then(snapshot => {
      cache = { expiresAt: Date.now() + CONTEXT_CACHE_MS, snapshot }
      return snapshot
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export async function enrichLpOpportunitiesWithContext<T extends ContextOpportunity>(opportunities: T[]) {
  if (!opportunities.length) return opportunities
  const snapshot = await Promise.race([
    getContextSnapshot().catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), CONTEXT_WAIT_MS)),
  ])
  if (!snapshot) return opportunities

  return opportunities.map(opportunity => {
    const contextSignals: LpContextSignal[] = []
    const football = snapshot.football.find(match => footballMatchMatchesOpportunity(opportunity, match))
    if (football) {
      contextSignals.push({
        kind: 'football',
        label: 'Football context',
        source: snapshot.footballSource || 'Verified football provider',
        title: football.polymarketTitle || football.title || 'Verified fixture context',
        url: football.sourceUrl,
        publishedAt: football.kickoffAt,
      })
    }

    const news = snapshot.news.find(article => articleMatchesOpportunity(opportunity, article))
    if (news) {
      contextSignals.push({
        kind: 'news',
        label: 'News context',
        source: news.source || snapshot.newsSource || 'News provider',
        title: news.title,
        url: news.url,
        publishedAt: news.publishedAt,
      })
    }

    return contextSignals.length ? { ...opportunity, contextSignals } : opportunity
  })
}
