import test from 'node:test'
import assert from 'node:assert/strict'
import { paidDeliveryGuidance } from '../api/smart-trader-delivery-status.js'
test('paid processing and failures never request repayment or authorize a trade', () => {
  for (const state of ['settled', 'running', 'failed']) {
    const g = paidDeliveryGuidance(state, null)
    assert.equal(g.retryPayment, false); assert.equal(g.tradeAuthorized, false)
    assert.equal(g.resultLocation, null); assert.ok(!g.followUpPrompts.includes('Preview this trade'))
    assert.match(g.reviewMeaning, /already settled/)
  }
})
test('preview prompt requires completed unexpired approval and preserves original result', () => {
  const result = { action: 'ANALYZE', decision: { decision: 'APPROVE', expiresAt: new Date(2000).toISOString(), evidence: { researchStatus: 'AVAILABLE' } } }
  const original = JSON.stringify(result)
  assert.ok(paidDeliveryGuidance('completed', result, 1000).followUpPrompts.includes('Preview this trade'))
  for (const [state, response, now] of [
    ['failed', result, 1000], ['completed', result, 2000],
    ['completed', { ...result, decision: { ...result.decision, decision: 'ESCALATE' } }, 1000],
    ['completed', { ...result, decision: { ...result.decision, evidence: { researchStatus: 'UNAVAILABLE' } } }, 1000],
  ] as const) assert.ok(!paidDeliveryGuidance(state, response, now).followUpPrompts.includes('Preview this trade'))
  assert.equal(paidDeliveryGuidance('completed', result, 1000).resultLocation, 'result')
  assert.equal(JSON.stringify(result), original)
})
