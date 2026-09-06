import type { Request, Response } from 'express'
import { normalizeMarket } from './polymarket-smart-trader.js'

type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
type Search = (query: string, page: number) => Promise<unknown>

export async function searchPolymarketPage(query: string, page: number) {
  const params = new URLSearchParams({ q: query, page: String(page), events_status: 'active', limit_per_type: '20', keep_closed_markets: '0', search_profiles: 'false', search_tags: 'false' })
  const response = await fetch(`https://gamma-api.polymarket.com/public-search?${params}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error('Polymarket search unavailable')
  return response.json() as Promise<unknown>
}

// No research, payment, wallet, or order calls.
export async function discoverPolymarket(input: Row, search: Search = searchPolymarketPage, now = Date.now()) {
  const query = typeof input.q === 'string' ? input.q.trim() : ''
  const intent = typeof input.intent === 'string' ? input.intent.trim() : query
  if (!query || query.length > 200 || intent.length > 500) return { status: 400, body: { ok: false, error: 'Supply q (1-200 characters) and optional original intent (up to 500 characters).' } }
  const needsSchedule = /\b(next|upcoming|nearest|soonest)\b/i.test(`${query} ${intent}`)
  const candidates = new Map<string, Row>()
  let hasMore = false
  let pages = 0
  try {
    for (let page = 1; page <= 3; page++) {
      const payload = record(await search(query, page))
      if (payload.events !== null && !Array.isArray(payload.events)) throw new Error('Invalid search response')
      pages = page
      for (const value of Array.isArray(payload.events) ? payload.events : []) {
        const event = record(value)
        for (const item of Array.isArray(event.markets) ? event.markets : []) {
          const raw = record(item)
          if (raw.active !== true || raw.closed !== false || raw.acceptingOrders !== true || raw.enableOrderBook !== true || event.closed === true) continue
          const market = normalizeMarket(raw, event)
          if (!market || !/^[a-z0-9-]+$/i.test(market.eventSlug)) continue
          const end = Date.parse(market.endDate || '')
          if (!Number.isFinite(end) || end <= now) continue
          const startValue = raw.gameStartTime || raw.eventStartTime || event.startTime
          const start = typeof startValue === 'string' ? Date.parse(startValue) : NaN
          if (needsSchedule && Number.isFinite(start) && start <= now) continue
          candidates.set(market.conditionId.toLowerCase(), {
            ...market, url: `https://polymarket.com/event/${market.eventSlug}`,
            eventStartTime: Number.isFinite(start) ? new Date(start).toISOString() : null,
            outcomes: market.outcomes.map((label, index) => ({ label, tokenId: market.tokenIds[index], price: market.prices[index] ?? null })),
          })
        }
      }
      hasMore = record(payload.pagination).hasMore === true
      if (!hasMore) break
    }
  } catch {
    return { status: 502, body: { ok: false, error: 'Polymarket discovery is unavailable. No market selected; retry later.', retryPayment: false } }
  }
  return { status: 200, body: {
    ok: true, schema: 'polydesk-market-discovery-v1', query, intent,
    source: 'polymarket', generatedAt: new Date(now).toISOString(), pages, truncated: hasMore,
    candidates: [...candidates.values()], selectedMarket: null,
    scheduleVerification: needsSchedule ? 'required' : 'not_requested',
    next: needsSchedule
      ? 'Verify the actual next fixture and competition against an authoritative schedule before selecting a candidate. The next listed market is not proof of the next fixture.'
      : 'Confirm exact event, resolution rules, and outcome before requesting analysis or independent preparation.',
    boundary: 'Candidates are not recommendations, research evidence, trading approval, or exhaustive coverage. No payment or trade performed.',
  } }
}

export default async function polymarketDiscoverHandler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET for read-only discovery.' })
  const result = await discoverPolymarket(req.query)
  return res.status(result.status).json(result.body)
}
