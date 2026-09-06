import test from 'node:test'
import assert from 'node:assert/strict'
import { recoverySummary } from '../api/recovery-summary.js'

test('unwraps bounded delivery and reports degradation explicitly', () => {
  const delivery = { attemptCount: 2, maximumAttempts: 6, result: { ok: true, data: { action: 'ANALYZE', decision: { decision: 'ESCALATE', decisionId: 'test', evidence: { researchStatus: 'UNAVAILABLE' } } } } } as Parameters<typeof recoverySummary>[0]
  const summary = recoverySummary(delivery)
  assert.equal(summary.ok, true)
  assert.equal(summary.deliveryStatus, 'degraded')
  assert.equal(summary.attemptCount, 2)
  assert.equal(summary.additionalPaymentRequired, false)
  assert.equal(summary.decisionId, 'test')
})
test('no attempt and failed attempt never produce an empty object', () => {
  assert.equal(recoverySummary({ attemptCount: 6, maximumAttempts: 6, result: undefined }).deliveryStatus, 'failed')
  const summary = recoverySummary({ attemptCount: 2, maximumAttempts: 6, result: { ok: false, error: 'test failure' } } as Parameters<typeof recoverySummary>[0])
  assert.equal(summary.ok, false)
  assert.equal(summary.error, 'test failure')
})
