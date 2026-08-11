import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendTradeSignalEventToOutbox,
  buildGovernedTradeSignal,
  buildVerifiedExecutionSignal,
} from '../api/trade-signal-outbox.js'

const base = {
  executionId: 'pex_' + '12'.repeat(12),
  externalOrderId: 'okx-service-request-001',
  occurredAt: '2026-08-11T12:00:00.000Z',
  market: {
    venue: 'Polymarket' as const,
    assetClass: 'prediction-market' as const,
    marketTitle: 'Will the example happen?',
    marketUrl: 'https://polymarket.com/event/example',
    outcome: 'Yes',
    tokenId: '123456789',
  },
  action: {
    side: 'BUY' as const,
    orderType: 'FAK' as const,
    maximumAmountUsdc: '1',
    maximumPrice: '0.55',
  },
  policy: {
    decisionHash: '1'.repeat(64),
    orderHash: '2'.repeat(64),
    mandateHash: '3'.repeat(64),
    reasons: ['All mandate checks passed.'],
  },
}

test('builds a normalized service-originated pre-trade signal', () => {
  const signal = buildGovernedTradeSignal(base)
  assert.equal(signal.eventType, 'signal.created')
  assert.equal(signal.signalId, `polydesk:${base.executionId}`)
  assert.equal(signal.producer.agent, 'PolyDesk')
  assert.equal(signal.producer.serviceRequestId, base.externalOrderId)
  assert.equal(signal.instrument.venue, 'Polymarket')
  assert.equal(signal.action.maximumAmountUsdc, '1')
  assert.equal(signal.policy.decision, 'APPROVE')
  assert.equal(signal.delivery.okxLiveSignals, 'pending-schema')
})

test('links the verified fill to the same signal and service request', () => {
  const result = buildVerifiedExecutionSignal({
    ...base,
    occurredAt: '2026-08-11T12:01:00.000Z',
    execution: {
      status: 'VERIFIED_FILLED',
      orderId: '0x' + 'ab'.repeat(32),
      transactionHash: '0x' + 'cd'.repeat(32),
      fillSize: 2,
      fillPrice: 0.5,
      fillAmountUsdc: 1,
    },
  })
  assert.equal(result.eventType, 'execution.verified')
  assert.equal(result.signalId, `polydesk:${base.executionId}`)
  assert.equal(result.execution?.status, 'VERIFIED_FILLED')
  assert.equal(result.correlation.externalOrderId, base.externalOrderId)
})

test('outbox append is idempotent for service and execution retries', () => {
  const signal = buildGovernedTradeSignal(base)
  const first = appendTradeSignalEventToOutbox(undefined, signal)
  const replay = appendTradeSignalEventToOutbox(first, signal)
  assert.equal(replay.events.length, 1)
  assert.equal(replay, first)

  const fill = buildVerifiedExecutionSignal({
    ...base,
    execution: {
      status: 'VERIFIED_FILLED',
      orderId: '0x' + 'ab'.repeat(32),
      transactionHash: '0x' + 'cd'.repeat(32),
      fillSize: 2,
      fillPrice: 0.5,
      fillAmountUsdc: 1,
    },
  })
  const completed = appendTradeSignalEventToOutbox(replay, fill)
  assert.equal(completed.events.length, 2)
  assert.deepEqual(completed.events.map(event => event.eventType), ['signal.created', 'execution.verified'])
})
