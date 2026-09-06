import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSettledSmartTraderAnalysisRecord, isRemediableDegradedResearch, shouldRecoverSmartTraderDelivery } from '../api/polymarket-smart-trader.js'

const record = {
  ...buildSettledSmartTraderAnalysisRecord({ action: 'ANALYZE', marketId: `0x${'12'.repeat(32)}`, outcome: 'Yes', side: 'BUY' }, {
    provider: 'CDP x402', transaction: `0x${'ab'.repeat(32)}`, payer: `0x${'11'.repeat(20)}`,
    amountAtomic: '300000', network: 'Base', serviceUrl: '/api/x402/base/polymarket-smart-trader',
  }, Date.now()),
  status: 'completed' as const, decisionId: 'old-decision', analysisHash: 'old-hash', deliveryAttemptCount: 1,
  response: { decision: { decision: 'ESCALATE', evidence: { researchStatus: 'UNAVAILABLE' } } },
}
test('degraded research is explicitly recoverable but never auto-retried by polling', () => {
  assert.equal(isRemediableDegradedResearch(record), true)
  assert.equal(shouldRecoverSmartTraderDelivery(record), false)
  assert.equal(shouldRecoverSmartTraderDelivery(record, Date.now(), { allowEngineUpgradeRemediation: true }), false)
})
test('recovery excludes exhausted attempts, concurrent work, available research, and approval', () => {
  assert.equal(isRemediableDegradedResearch({ ...record, deliveryAttemptCount: 6 }), false)
  assert.equal(isRemediableDegradedResearch({ ...record, status: 'running' }), false)
  assert.equal(isRemediableDegradedResearch({ ...record, decisionId: undefined }), false)
  assert.equal(isRemediableDegradedResearch({ ...record, response: { decision: { decision: 'ESCALATE', evidence: { researchStatus: 'AVAILABLE' } } } }), false)
  assert.equal(isRemediableDegradedResearch({ ...record, response: { decision: { decision: 'APPROVE', evidence: { researchStatus: 'UNAVAILABLE' } } } }), false)
})
