import test from 'node:test'
import assert from 'node:assert/strict'
import { publicDeliveryStatus } from '../api/smart-trader-delivery-status.js'

test('stored provider-failure proof is degraded, not successful research', () => {
  assert.deepEqual(publicDeliveryStatus('completed', { decision: { evidence: { researchStatus: 'UNAVAILABLE' } } }), {
    status: 'completed', deliveryStatus: 'degraded', researchStatus: 'UNAVAILABLE', additionalPaymentRequired: false,
  })
})
test('available research and in-progress delivery retain their state', () => {
  assert.equal(publicDeliveryStatus('completed', { decision: { evidence: { researchStatus: 'AVAILABLE' } } }).status, 'completed')
  assert.equal(publicDeliveryStatus('running', null).status, 'running')
  assert.equal(publicDeliveryStatus('failed', null).status, 'failed')
  assert.equal(publicDeliveryStatus('completed', {}).status, 'completed')
})
