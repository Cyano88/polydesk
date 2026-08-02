import type { Request, Response } from 'express'

type ProviderArticle = Record<string, unknown>

export type FootballNewsQuery = {
  team?: string
  league?: string
  type?: 'pre-match' | 'post-match' | 'all'
}

export type PolyWorldCupArticle = {
  title: string
  description: string
  source: string
  image: string
  url: string
  publishedAt: string
  tag: string
  polymarketMarkets: Array<{
    title: string
    url: string
    eventSlug: string
    matchBasis: 'deterministic-headline-overlap'
  }>
}

type CacheEntry = {
  expiresAt: number
  feed: {
    ok: true
    providerConfigured: boolean
    source: string
    mode: 'live' | 'unavailable'
    updatedAt: string
    freshnessSeconds: number
    error?: string
    articles: PolyWorldCupArticle[]
  }
}

const DEFAULT_QUERY = '(football OR soccer) AND (match OR league OR tournament)'
const DEFAULT_CACHE_MS = 15 * 60 * 1000
const FALLBACK_IMAGE = '/brand/world-globe.png'
const DEFAULT_NEWS_API_URL = 'https://gnews.io/api/v4/search'
const DEFAULT_SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football'

const cache = new Map<string, CacheEntry>()

export function polyWorldcupArticleId(article: Pick<PolyWorldCupArticle, 'title' | 'url'>, index = 0) {
  const input = `${article.title}|${article.url}|${index}`.toLowerCase()
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const slug = article.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'headline'
  return `worldcup-news-${slug}-${(hash >>> 0).toString(36)}`
}

function envValue(primary: string, fallback: string) {
  return process.env[primary]?.trim() || process.env[fallback]?.trim() || ''
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asId(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  const text = asString(value)
  return /^\d+$/.test(text) ? text : ''
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeNewsQuery(query: FootballNewsQuery = {}): FootballNewsQuery {
  const type = query.type === 'pre-match' || query.type === 'post-match' ? query.type : 'all'
  return {
    team: asString(query.team).slice(0, 100) || undefined,
    league: asString(query.league).slice(0, 100) || undefined,
    type,
  }
}

function newsCacheKey(query: FootballNewsQuery) {
  return JSON.stringify(normalizeNewsQuery(query))
}

export function requestFootballNewsQuery(req: Request): FootballNewsQuery {
  const body = asRecord(req.body)
  const filters = asRecord(body.filters)
  const queryValue = (name: string) => {
    const value = req.query[name]
    return Array.isArray(value) ? value[0] : value
  }
  return normalizeNewsQuery({
    team: asString(queryValue('team') ?? body.team ?? filters.team),
    league: asString(queryValue('league') ?? body.league ?? filters.league),
    type: asString(queryValue('type') ?? body.type ?? filters.type) as FootballNewsQuery['type'],
  })
}

function articleSource(article: ProviderArticle) {
  const source = article.source
  if (source && typeof source === 'object' && 'name' in source) {
    return asString((source as { name?: unknown }).name)
  }
  return asString(article.source) || asString(article.provider) || asString(article.author) || 'News provider'
}

function articleImage(article: ProviderArticle) {
  return (
    asString(article.image)
    || asString(article.urlToImage)
    || asString(article.image_url)
    || asString(article.thumbnail)
    || FALLBACK_IMAGE
  )
}

function articleUrl(article: ProviderArticle) {
  return asString(article.url) || asString(article.link)
}

function tagFor(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase()
  if (/(polymarket|odds|market|liquidity|reward|spread|trading|prediction)/.test(text)) return 'Markets'
  if (/(injury|injured|squad|roster|lineup|selection)/.test(text)) return 'Squads'
  if (/(qualif|draw|fixture|schedule|group|match)/.test(text)) return 'Fixtures'
  if (/(ticket|stadium|venue|host|city)/.test(text)) return 'Venues'
  return 'Football'
}

function dedupeArticles(articles: PolyWorldCupArticle[]) {
  const seen = new Set<string>()
  return articles.filter(article => {
    const key = (article.url || article.title).trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function strictFootballArticle(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase()
  const football = /\bfootball\b|\bsoccer\b|\bpremier league\b|\bchampions league\b|\bfifa\b|\bufa\b|\buefa\b|\bworld cup\b|\bgoalkeeper\b|\bstriker\b|\bmidfielder\b|\bfixture\b|\btransfer\b/.test(text)
  const otherSport = /\bcricket\b|\bnhl\b|\bhockey\b|\bnba\b|\bbasketball\b|\bbaseball\b|\bmlb\b|\bnfl\b|\bamerican football\b/.test(text)
  return football && !otherSport
}

function normalizeArticle(article: ProviderArticle): PolyWorldCupArticle | null {
  const title = asString(article.title) || asString(article.headline)
  if (!title) return null
  const description =
    asString(article.description)
    || asString(article.summary)
    || asString(article.content)
    || 'Football update for market context.'
  const url = articleUrl(article)
  if (!url || !/^https?:\/\//i.test(url) || !strictFootballArticle(title, description)) return null
  return {
    title,
    description,
    source: articleSource(article),
    image: articleImage(article),
    url,
    publishedAt: asString(article.publishedAt)
      || asString(article.published_at)
      || asString(article.pubDate)
      || asString(article.published)
      || asString(article.created_at)
      || asString(article.date)
      || new Date().toISOString(),
    tag: tagFor(title, description),
    polymarketMarkets: [],
  }
}

function articleTimeValue(article: PolyWorldCupArticle) {
  const timestamp = Date.parse(article.publishedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function extractArticles(payload: unknown): ProviderArticle[] {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object') as ProviderArticle[]
  if (!payload || typeof payload !== 'object') return []
  const data = payload as Record<string, unknown>
  const candidates = [data.articles, data.items, data.results, data.data]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(item => item && typeof item === 'object') as ProviderArticle[]
  }
  return []
}

const MARKET_STOP_WORDS = new Set([
  'about', 'after', 'before', 'could', 'football', 'from', 'have', 'into', 'match',
  'more', 'news', 'over', 'says', 'soccer', 'that', 'their', 'this', 'will', 'with',
])

function marketTokens(value: string) {
  return new Set(value.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 4 && !MARKET_STOP_WORDS.has(token)))
}

async function relatedPolymarketMarkets(article: PolyWorldCupArticle) {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: '20',
    search: article.title,
  })
  const response = await fetch(`https://gamma-api.polymarket.com/events?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return []
  const payload = await response.json()
  const values = Array.isArray(payload) ? payload : []
  const sourceTokens = marketTokens(`${article.title} ${article.description}`)
  return values
    .map(value => {
      const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
      const title = asString(record.title) || asString(record.question)
      const eventSlug = asString(record.slug)
      const candidateTokens = marketTokens(title)
      const overlap = [...candidateTokens].filter(token => sourceTokens.has(token))
      if (!title || !/^[a-z0-9-]+$/i.test(eventSlug) || overlap.length < 3) return null
      return {
        title,
        url: `https://polymarket.com/event/${eventSlug}`,
        eventSlug,
        matchBasis: 'deterministic-headline-overlap' as const,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .slice(0, 3)
}

function sportmonksArticleText(article: ProviderArticle) {
  const fixture = asRecord(article.fixture)
  const league = asRecord(article.league)
  return [
    asString(article.title),
    asString(fixture.name),
    asString(league.name),
  ].filter(Boolean).join(' ')
}

function sportmonksLines(article: ProviderArticle) {
  const lines = Array.isArray(article.lines) ? article.lines : []
  return lines
    .map(value => {
      if (typeof value === 'string') return value.trim()
      const line = asRecord(value)
      return asString(line.text)
        || asString(line.line)
        || asString(line.content)
        || asString(line.description)
        || asString(line.body)
    })
    .filter(Boolean)
    .join(' ')
}

function sportmonksArticleMatches(article: ProviderArticle, query: FootballNewsQuery) {
  const text = normalizeSearchText(sportmonksArticleText(article))
  const team = normalizeSearchText(query.team || '')
  const league = normalizeSearchText(query.league || '')
  if (team && !text.includes(team)) return false
  if (league && !text.includes(league)) return false
  return true
}

function normalizeSportmonksArticle(article: ProviderArticle): PolyWorldCupArticle | null {
  const title = asString(article.title)
  if (!title) return null
  const fixture = asRecord(article.fixture)
  const league = asRecord(article.league)
  const fixtureId = asId(article.fixture_id) || asId(fixture.id)
  const type = asString(article.type).toLowerCase()
  const url = fixtureId
    ? `https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`
    : 'https://api.sportmonks.com/v3/football/news'
  return {
    title,
    description: sportmonksLines(article) || asString(fixture.name) || 'Sportmonks provider-truth football update.',
    source: 'Sportmonks Football News',
    image: asString(league.image_path) || FALLBACK_IMAGE,
    url,
    publishedAt: asString(article.updated_at) || asString(article.created_at),
    tag: type.includes('post') ? 'Results' : 'Fixtures',
    polymarketMarkets: [],
  }
}

export function sportmonksNewsUrls(query: FootballNewsQuery = {}) {
  const normalized = normalizeNewsQuery(query)
  const base = process.env.POLY_STREAM_BASE_URL?.trim() || DEFAULT_SPORTMONKS_BASE
  const types = normalized.type === 'all' ? ['pre-match', 'post-match'] : [normalized.type || 'pre-match']
  return types.map(type => {
    const url = new URL(`${base}/news/${type}`)
    url.searchParams.set('include', 'league;fixture;lines')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', '25')
    return url.toString()
  })
}

async function fetchSportmonksArticles(query: FootballNewsQuery): Promise<PolyWorldCupArticle[]> {
  const apiKey = envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY')
  if (!apiKey) return []
  const responses = await Promise.allSettled(sportmonksNewsUrls(query).map(async value => {
    const url = new URL(value)
    url.searchParams.set('api_token', apiKey)
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) throw new Error(`Sportmonks News returned ${response.status}`)
    return extractArticles(await response.json())
  }))
  const normalized = responses
    .filter((result): result is PromiseFulfilledResult<ProviderArticle[]> => result.status === 'fulfilled')
    .flatMap(result => result.value)
    .filter(article => sportmonksArticleMatches(article, query))
    .map(normalizeSportmonksArticle)
    .filter(Boolean) as PolyWorldCupArticle[]
  return Promise.all(dedupeArticles(normalized).slice(0, 10).map(async article => ({
    ...article,
    polymarketMarkets: await relatedPolymarketMarkets(article).catch(() => []),
  })))
}

async function fetchProviderArticles(query: FootballNewsQuery = {}): Promise<PolyWorldCupArticle[]> {
  const apiKey = envValue('POLY_NEWS_API_KEY', 'NEWS_API_KEY')
  const configuredUrl = envValue('POLY_NEWS_API_URL', 'NEWS_API_URL')
  const apiUrl = configuredUrl || (apiKey ? DEFAULT_NEWS_API_URL : '')
  if (!apiUrl) return []

  const url = new URL(apiUrl)
  const queryParam = process.env.POLY_NEWS_QUERY_PARAM?.trim() || 'q'
  const limitParam = process.env.POLY_NEWS_LIMIT_PARAM?.trim() || 'max'
  const requestedTerms = [query.team, query.league].filter(Boolean).join(' ')
  if (!url.searchParams.has(queryParam)) url.searchParams.set(queryParam, requestedTerms || envValue('POLY_NEWS_QUERY', 'NEWS_QUERY') || DEFAULT_QUERY)
  if (!url.searchParams.has(limitParam)) url.searchParams.set(limitParam, process.env.POLY_NEWS_LIMIT?.trim() || '10')
  if (!url.searchParams.has('lang')) url.searchParams.set('lang', process.env.POLY_NEWS_LANG?.trim() || 'en')

  const headers: Record<string, string> = { Accept: 'application/json' }
  const authHeader = process.env.POLY_NEWS_API_AUTH_HEADER?.trim()
  if (apiKey && authHeader) {
    headers[authHeader] = apiKey
  } else if (apiKey) {
    const keyParam = process.env.POLY_NEWS_API_KEY_PARAM?.trim() || 'apikey'
    if (!url.searchParams.has(keyParam)) url.searchParams.set(keyParam, apiKey)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) throw new Error(`News provider returned ${response.status}`)
    const payload = await response.json()
    const normalized = (extractArticles(payload).map(normalizeArticle).filter(Boolean) as PolyWorldCupArticle[])
      .filter(article => {
        const text = normalizeSearchText(`${article.title} ${article.description}`)
        const team = normalizeSearchText(query.team || '')
        const league = normalizeSearchText(query.league || '')
        return (!team || text.includes(team)) && (!league || text.includes(league))
      })
      .sort((a, b) => articleTimeValue(b) - articleTimeValue(a))
      .slice(0, 10)
    return Promise.all(normalized.map(async article => ({
      ...article,
      polymarketMarkets: await relatedPolymarketMarkets(article).catch(() => []),
    })))
  } finally {
    clearTimeout(timeout)
  }
}

export async function getPolyWorldcupNewsFeed(requestedQuery: FootballNewsQuery = {}) {
  const query = normalizeNewsQuery(requestedQuery)
  const key = newsCacheKey(query)
  const cacheMs = Number(envValue('POLY_NEWS_CACHE_MS', 'NEWS_CACHE_MS') || DEFAULT_CACHE_MS)
  const ttl = Number.isFinite(cacheMs) && cacheMs > 0 ? cacheMs : DEFAULT_CACHE_MS
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.feed,
      query,
      freshnessSeconds: Math.floor((Date.now() - Date.parse(cached.feed.updatedAt)) / 1000),
    }
  }

  const sportmonksConfigured = Boolean(envValue('POLY_STREAM_API_KEY', 'SPORTS_API_KEY'))
  const fallbackConfigured = Boolean(envValue('POLY_NEWS_API_KEY', 'NEWS_API_KEY') || envValue('POLY_NEWS_API_URL', 'NEWS_API_URL'))
  const providerConfigured = sportmonksConfigured || fallbackConfigured
  try {
    const sportmonksArticles = sportmonksConfigured
      ? await fetchSportmonksArticles(query).catch(() => [])
      : []
    const providerArticles = sportmonksArticles.length
      ? sportmonksArticles
      : await fetchProviderArticles(query)
    const articles = dedupeArticles(providerArticles)
    const feed = {
      ok: true as const,
      providerConfigured,
      source: sportmonksArticles.length
        ? 'sportmonks'
        : providerArticles.length ? envValue('POLY_NEWS_PROVIDER', 'NEWS_PROVIDER') || 'gnews' : 'unavailable',
      mode: providerArticles.length ? 'live' as const : 'unavailable' as const,
      updatedAt: new Date().toISOString(),
      freshnessSeconds: 0,
      articles,
    }
    cache.set(key, { expiresAt: Date.now() + ttl, feed })
    return { ...feed, query }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const feed = {
      ok: true as const,
      providerConfigured,
      source: 'unavailable',
      mode: 'unavailable' as const,
      updatedAt: new Date().toISOString(),
      freshnessSeconds: 0,
      error: detail.slice(0, 240),
      articles: [],
    }
    cache.set(key, { expiresAt: Date.now() + Math.min(ttl, 60_000), feed })
    return { ...feed, query }
  }
}

export default async function polyWorldcupNewsHandler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const body = asRecord(req.body)
  const query = requestFootballNewsQuery(req)
  if (req.query.force === '1' || body.force === '1') cache.delete(newsCacheKey(query))
  const preflightFeed = (req as Request & { footballNewsPreflightFeed?: Awaited<ReturnType<typeof getPolyWorldcupNewsFeed>> }).footballNewsPreflightFeed
  return res.json(preflightFeed ?? await getPolyWorldcupNewsFeed(query))
}
