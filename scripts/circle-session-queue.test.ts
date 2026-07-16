import assert from 'node:assert/strict'
import test from 'node:test'
import { withCircleSessionLock } from '../api/circle-session-queue.js'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('serializes Circle commands that share a session key', async () => {
  const order: string[] = []
  let active = 0
  let maxActive = 0

  const run = (label: string, delay: number) => withCircleSessionLock('wallet-session', async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    order.push(`${label}:start`)
    await wait(delay)
    order.push(`${label}:end`)
    active -= 1
  })

  await Promise.all([run('balance', 20), run('payment', 1), run('receipt', 1)])

  assert.equal(maxActive, 1)
  assert.deepEqual(order, [
    'balance:start',
    'balance:end',
    'payment:start',
    'payment:end',
    'receipt:start',
    'receipt:end',
  ])
})

test('does not block independent Circle sessions', async () => {
  let active = 0
  let maxActive = 0
  const run = (key: string) => withCircleSessionLock(key, async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await wait(10)
    active -= 1
  })

  await Promise.all([run('wallet-a'), run('wallet-b')])
  assert.equal(maxActive, 2)
})
