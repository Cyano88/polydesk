import assert from 'node:assert/strict'
import type { Request, Response } from 'express'
import test from 'node:test'
import { validateLolahNewsEvent } from '../api/lolah-news-event.js'
import {
  buildPolydeskMarketContext,
  createPolydeskMarketContextHealthHandler,
  createPolydeskMarketContextHandler,
  type PolydeskMarketCandidate,
  type PolydeskMarketContextDependencies,
} from '../api/polydesk-market-context.js'

const now = new Date('2026-08-09T14:32:00.000Z')

function news(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'lolah-news-event-v1',
    eventId: 'evt_kaito_shutdown_2026',
    headline: 'Kaito announces an immediate shutdown of operations',
    summary: 'The project says its services will cease operations immediately.',
    publisher: '@KaitoAI',
    sourceUrl: 'https://x.com/KaitoAI/status/1234567890',
    publishedAt: '2026-08-09T14:30:00.000Z',
    detectedAt: '2026-08-09T14:30:08.000Z',
    entities: ['Kaito'],
    eventType: 'shutdown',
    verification: { status: 'official_source', supportingSources: [] },
    ...overrides,
  }
}

function market(overrides: Partial<PolydeskMarketCandidate> = {}): PolydeskMarketCandidate {
  return {
    eventId: '9001',
    conditionId: '0x' + 'ab'.repeat(32),
    question: 'Will Kaito cease operations before 2027?',
    description: 'This market resolves Yes if Kaito announces a shutdown or permanently ceases operations.',
    resolutionSource: 'Official Kaito communications',
    eventSlug: 'will-kaito-cease-operations-before-2027',
    marketSlug: 'kaito-cease-operations',
    active: true,
    closed: false,
    enableOrderBook: true,
    acceptingOrders: true,
    endDate: '2026-12-31T23:59:59.000Z',
    outcomes: ['Yes', 'No'],
    outcomePrices: [0.84, 0.16],
    clobTokenIds: ['yes-token', 'no-token'],
    volumeUsd: 250_000,
    liquidityUsd: 40_000,
    openInterestUsd: 90_000,
    ...overrides,
  }
}

function dependencies(markets: PolydeskMarketCandidate[], overrides: Partial<PolydeskMarketContextDependencies> = {}): PolydeskMarketContextDependencies {
  return {
    searchMarkets: async () => markets,
    fetchBook: async () => ({
      timestamp: String(now.getTime()),
      bids: [{ price: '0.84', size: '500' }, { price: '0.83', size: '1000' }],
      asks: [{ price: '0.86', size: '700' }, { price: '0.87', size: '900' }],
      last_trade_price: '0.85',
    }),
    fetchPriceHistory: async () => [
      { t: Date.parse('2026-08-09T14:29:00Z') / 1000, p: 0.34 },
      { t: Date.parse('2026-08-09T14:31:00Z') / 1000, p: 0.82 },
    ],
    now: () => now,
    ...overrides,
  }
}

function request(authorization = '') {
  return {
    method: 'POST',
    headers: authorization ? { authorization } : {},
    body: { event: news() },
  } as Request
}

function response() {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} }
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value
      return this
    },
    status(value: number) {
      state.status = value
      return this
    },
    json(value: unknown) {
      state.body = value
      return this
    },
  } as unknown as Response
  return { res, state }
}

test('normalizes verified events without accepting secret material', () => {
  const result = validateLolahNewsEvent(news())
  assert.equal(result.verification.status, 'official_source')
  assert.throws(() => validateLolahNewsEvent({ ...news(), privateKey: 'forbidden' }), /secret material/)
})

test('matches shutdown news and measures capital-backed consensus movement', async () => {
  const result = await buildPolydeskMarketContext(news(), dependencies([market()]))
  assert.equal(result.matchStatus, 'matched')
  if (result.matchStatus !== 'matched') return
  assert.equal(result.consensus.probabilityBeforeNews, 0.34)
  assert.equal(result.consensus.probabilityNow, 0.85)
  assert.equal(result.consensus.probabilityChange, 0.51)
  assert.equal(result.consensus.marketDataStatus, 'complete')
  assert.equal(result.consensus.spread, 0.02)
  assert.equal(result.consensus.nearTouchDepthShares, 3100)
})

test('rejects a price market that only shares the token name', async () => {
  const result = await buildPolydeskMarketContext(news(), dependencies([market({
    question: 'Will KAITO trade above $2 before September?',
    description: 'Resolves using the KAITO price at the stated time.',
    resolutionSource: 'A price index',
    eventSlug: 'will-kaito-trade-above-2',
  })]))
  assert.equal(result.matchStatus, 'no_relevant_market')
})

test('blocks arbitrary selection between similarly relevant markets', async () => {
  const result = await buildPolydeskMarketContext(news(), dependencies([
    market(),
    market({
      conditionId: '0x' + 'cd'.repeat(32),
      question: 'Will Kaito shut down its operations during 2026?',
      eventSlug: 'will-kaito-shut-down-during-2026',
      clobTokenIds: ['yes-token-2', 'no-token-2'],
    }),
  ]))
  assert.equal(result.matchStatus, 'ambiguous')
  if (result.matchStatus === 'ambiguous') assert.equal(result.confidenceAdjustment, 'block_trade')
})

test('ignores closed, expired, inactive, and non-tradable candidates', async () => {
  const result = await buildPolydeskMarketContext(news(), dependencies([
    market({ closed: true }),
    market({ active: false }),
    market({ acceptingOrders: false }),
    market({ endDate: '2026-08-08T00:00:00.000Z' }),
  ]))
  assert.equal(result.matchStatus, 'no_relevant_market')
  assert.deepEqual(result.candidates, [])
})

test('does not invent movement when market-data providers fail', async () => {
  const result = await buildPolydeskMarketContext(news(), dependencies([market()], {
    fetchBook: async () => { throw new Error('provider unavailable') },
    fetchPriceHistory: async () => { throw new Error('provider unavailable') },
  }))
  assert.equal(result.matchStatus, 'matched')
  if (result.matchStatus !== 'matched') return
  assert.equal(result.consensus.probabilityNow, 0.84)
  assert.equal(result.consensus.probabilityBeforeNews, undefined)
  assert.equal(result.consensus.probabilityChange, undefined)
  assert.equal(result.consensus.marketDataStatus, 'partial')
})

test('surfaces search-provider failure instead of reporting a false no-market result', async () => {
  await assert.rejects(() => buildPolydeskMarketContext(news(), dependencies([], {
    searchMarkets: async () => { throw new Error('Polymarket search is unavailable.') },
  })), /search is unavailable/)
})

test('requires a configured private service token before any provider call', async () => {
  let providerCalls = 0
  const deps = dependencies([], {
    searchMarkets: async () => {
      providerCalls += 1
      return []
    },
  })
  const handler = createPolydeskMarketContextHandler(deps, { serviceToken: () => '' })
  const output = response()
  await handler(request(), output.res)
  assert.equal(output.state.status, 503)
  assert.equal(providerCalls, 0)
  assert.deepEqual(output.state.body, {
    ok: false,
    error: 'Prediction Market Context is not configured.',
  })
})

test('rejects a wrong bearer token before provider access and accepts the dedicated token', async () => {
  const token = 'polydesk-context-test-token-32-characters'
  let providerCalls = 0
  const deps = dependencies([], {
    searchMarkets: async () => {
      providerCalls += 1
      return []
    },
  })
  const handler = createPolydeskMarketContextHandler(deps, { serviceToken: () => token })

  const rejected = response()
  await handler(request('Bearer wrong-token'), rejected.res)
  assert.equal(rejected.state.status, 401)
  assert.equal(rejected.state.headers['www-authenticate'], 'Bearer realm=polydesk-market-context')
  assert.equal(providerCalls, 0)

  const accepted = response()
  await handler(request(`Bearer ${token}`), accepted.res)
  assert.equal(accepted.state.status, 200)
  assert.equal(providerCalls, 1)
  assert.equal((accepted.state.body as { ok?: boolean }).ok, true)
})

test('health uses the same bearer gate without touching a market provider', () => {
  const token = 'polydesk-context-test-token-32-characters'
  const handler = createPolydeskMarketContextHealthHandler({ serviceToken: () => token })

  const rejected = response()
  handler({ ...request('Bearer wrong-token'), method: 'GET' } as Request, rejected.res)
  assert.equal(rejected.state.status, 401)

  const accepted = response()
  handler({ ...request(`Bearer ${token}`), method: 'GET' } as Request, accepted.res)
  assert.equal(accepted.state.status, 200)
  assert.equal(accepted.state.headers['cache-control'], 'no-store')
  assert.deepEqual(accepted.state.body, {
    ok: true,
    data: {
      schema: 'polydesk-market-context-health-v1',
      service: 'polydesk',
      readOnly: true,
      executionAllowed: false,
    },
  })
})
