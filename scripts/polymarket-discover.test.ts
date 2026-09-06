import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverPolymarket } from '../api/polymarket-discover.js'

const now = Date.parse('2026-09-06T20:00:00Z')
const market = {
  question: 'Will Manchester United win?', conditionId: `0x${'12'.repeat(32)}`,
  active: true, closed: false, acceptingOrders: true, enableOrderBook: true,
  endDate: '2026-09-13T18:00:00Z', gameStartTime: '2026-09-13T15:00:00Z',
  outcomes: ['Yes', 'No'], clobTokenIds: ['123', '456'], outcomePrices: ['0.4', '0.6'],
}
const payload = (rows: unknown[] = [market], hasMore = false) => ({ events: [{ slug: 'united-city', markets: rows }], pagination: { hasMore } })

test('keyword discovery needs no Sportmonks, research, payment or wallet dependency', async () => {
  let calls = 0
  const result = await discoverPolymarket({ q: 'Manchester United' }, async (q, page) => {
    assert.equal(q, 'Manchester United'); assert.equal(page, 1); calls++; return payload()
  }, now)
  assert.equal(calls, 1)
  assert.equal(result.status, 200)
  assert.equal(result.body.candidates?.length, 1)
  assert.deepEqual(result.body.candidates?.[0].outcomes, [{ label: 'Yes', tokenId: '123', price: 0.4 }, { label: 'No', tokenId: '456', price: 0.6 }])
  assert.equal(result.body.selectedMarket, null)
})

test('next EPL fixture is never inferred from a later listed game', async () => {
  const result = await discoverPolymarket({ q: 'Manchester United', intent: 'next EPL game for United to win' }, async () => payload(), now)
  assert.equal(result.body.candidates?.length, 1)
  assert.equal(result.body.scheduleVerification, 'required')
  assert.equal(result.body.selectedMarket, null)
})

test('closed, expired, unknown flags and invalid outcome identity are excluded', async () => {
  for (const change of [{ closed: true }, { active: undefined }, { acceptingOrders: undefined }, { enableOrderBook: false }, { endDate: '2026-09-05' }, { endDate: undefined }, { clobTokenIds: ['123'] }]) {
    const result = await discoverPolymarket({ q: 'United' }, async () => payload([{ ...market, ...change }]), now)
    assert.deepEqual(result.body.candidates, [])
  }
})

test('already started matches cannot be upcoming candidates', async () => {
  const result = await discoverPolymarket({ q: 'United next game' }, async () => payload([{ ...market, gameStartTime: '2026-09-06T13:00:00Z' }]), now)
  assert.deepEqual(result.body.candidates, [])
})

test('missing kickoff remains explicit and requires schedule verification', async () => {
  const result = await discoverPolymarket({ q: 'United', intent: 'next EPL match' }, async () => payload([{ ...market, gameStartTime: undefined }]), now)
  assert.equal(result.body.candidates?.[0].eventStartTime, null)
  assert.equal(result.body.scheduleVerification, 'required')
})

test('pagination is bounded, deduplicated and explicitly partial', async () => {
  let calls = 0
  const result = await discoverPolymarket({ q: 'United' }, async () => { calls++; return payload([market], true) }, now)
  assert.equal(calls, 3)
  assert.equal(result.body.truncated, true)
  assert.equal(result.body.candidates?.length, 1)
})

test('upstream failure and malformed payload are not empty successes', async () => {
  for (const search of [async () => { throw new Error('private upstream detail') }, async () => ({})]) {
    const result = await discoverPolymarket({ q: 'United' }, search, now)
    assert.equal(result.status, 502)
    assert.equal(result.body.candidates, undefined)
    assert.doesNotMatch(JSON.stringify(result), /private upstream detail/)
  }
  assert.deepEqual((await discoverPolymarket({ q: 'United' }, async () => ({ events: null }), now)).body.candidates, [])
})

test('invalid input never calls upstream', async () => {
  for (const q of ['', ['United'], 'x'.repeat(201)]) {
    const result = await discoverPolymarket({ q }, async () => { throw new Error('must not call') }, now)
    assert.equal(result.status, 400)
  }
})
