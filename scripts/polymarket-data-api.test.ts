import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchPolymarketData, polymarketRetryDelayMs } from '../api/polymarket-data-api.js'

test('calculates bounded retry delays from Retry-After', () => {
  const now = Date.parse('2026-09-04T12:00:00.000Z')
  assert.equal(polymarketRetryDelayMs('2', 0, now), 2_000)
  assert.equal(polymarketRetryDelayMs('Thu, 04 Sep 2026 12:00:20 GMT', 0, now), 10_000)
  assert.equal(polymarketRetryDelayMs('Thu, 04 Sep 2026 11:59:59 GMT', 0, now), 250)
  assert.equal(polymarketRetryDelayMs(null, 1, now), 2_000)
})

test('retries a 429 response and returns the next successful result', async () => {
  let calls = 0
  const sleeps: number[] = []
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
      })
    }
    return new Response(JSON.stringify([{ currentValue: 12.34 }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const originalWarn = console.warn
  console.warn = () => undefined
  try {
    const result = await fetchPolymarketData<Array<{ currentValue: number }>>('/positions?user=0x1', {
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async delay => { sleeps.push(delay) },
    })
    assert.deepEqual(result, [{ currentValue: 12.34 }])
    assert.equal(calls, 2)
    assert.deepEqual(sleeps, [250])
  } finally {
    console.warn = originalWarn
  }
})

test('exhausts the bounded retry budget on persistent 429 responses', async () => {
  let calls = 0
  const sleeps: number[] = []
  const fetchImpl = async () => {
    calls += 1
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
    })
  }

  const originalWarn = console.warn
  console.warn = () => undefined
  try {
    await assert.rejects(
      fetchPolymarketData('/value?user=0x1', {
        fetchImpl: fetchImpl as typeof fetch,
        sleep: async delay => { sleeps.push(delay) },
        maxAttempts: 3,
      }),
      /Too Many Requests/,
    )
    assert.equal(calls, 3)
    assert.deepEqual(sleeps, [250, 250])
  } finally {
    console.warn = originalWarn
  }
})

test('does not retry a non-transient response or accept an absolute URL', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 })
  }

  await assert.rejects(
    fetchPolymarketData('/positions', { fetchImpl: fetchImpl as typeof fetch }),
    /Bad request/,
  )
  assert.equal(calls, 1)
  await assert.rejects(fetchPolymarketData('https://example.com/value'), /must be relative/)
})
