import assert from 'node:assert/strict'
import test from 'node:test'
import { listedServiceMatches } from '../api/okx-agentic-marketplace.js'
import { withOkxSessionLock } from '../api/okx-session-queue.js'

test('quote validation accepts only the exact current service id and endpoint', () => {
  const catalog = { services: [{ id: 'svc-7', endpoint: 'https://seller.example/api/live' }] }
  assert.equal(listedServiceMatches(catalog, 'svc-7', 'https://seller.example/api/live'), true)
  assert.equal(listedServiceMatches(catalog, 'svc-8', 'https://seller.example/api/live'), false)
  assert.equal(listedServiceMatches(catalog, 'svc-7', 'https://attacker.example/api/live'), false)
})

test('quote validation supports the CLI service table shape', () => {
  const catalog = { services: [{ cells: ['#3', 'Scores', 'API service', '0.1 USDT', '`https://seller.example/scores`'] }] }
  assert.equal(listedServiceMatches(catalog, '3', 'https://seller.example/scores'), true)
})

test('per-user OKX commands are serialized while different users can proceed', async () => {
  const events: string[] = []
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const first = withOkxSessionLock('user-a', async () => { events.push('a1-start'); await delay(20); events.push('a1-end') })
  const second = withOkxSessionLock('user-a', async () => { events.push('a2-start'); events.push('a2-end') })
  const other = withOkxSessionLock('user-b', async () => { events.push('b-start'); events.push('b-end') })
  await Promise.all([first, second, other])
  assert.ok(events.indexOf('a1-end') < events.indexOf('a2-start'))
  assert.ok(events.indexOf('b-start') < events.indexOf('a1-end'))
})
