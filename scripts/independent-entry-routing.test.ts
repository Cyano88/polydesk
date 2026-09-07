import assert from 'node:assert/strict'
import test from 'node:test'
import { preflightSmartTraderBeforeSettlement } from '../api/okx-a2mcp-standard-services.js'

const forbidden = async (): Promise<never> => { throw new Error('Research and paid preparation must not run') }
const researchDown = { validate: forbidden, operational: forbidden, providers: forbidden, prepare: forbidden }

test('REVIEW is included before research or payment availability checks', async () => {
  const body = { action: 'REVIEW', marketId: 'exact-market', outcome: 'Yes', side: 'BUY' }
  const result = await preflightSmartTraderBeforeSettlement(body, {
    ...researchDown,
    review: async input => {
      assert.deepEqual(input, body)
      return { ok: true, status: 200, data: { action: 'REVIEW', paymentRequired: false, orderSubmitted: false } } as never
    },
  })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.prepared?.data.paymentRequired, false)
})

test('AI preflight outage exposes an exact no-payment review request without copying credentials', async () => {
  const result = await preflightSmartTraderBeforeSettlement({ action: 'ANALYZE', marketId: 'exact-market', outcome: 'Yes', side: 'BUY', privateKey: 'must-not-copy' }, {
    ...researchDown,
    validate: async () => ({ ok: true }),
    operational: async () => false,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.body.nextAction, 'REQUEST_REVIEW_EVIDENCE')
  assert.equal(result.body.retryPayment, false)
  assert.doesNotMatch(JSON.stringify(result.body), /must-not-copy/)
})

test('explicit independent choice succeeds even with every research dependency down', async () => {
  const order = { acknowledgeIndependentDecision: true, maxSpendUsdc: '5', maximumPrice: '0.5' }
  const result = await preflightSmartTraderBeforeSettlement({ action: 'INDEPENDENT_PREPARE', independentOrder: order }, {
    ...researchDown,
    independentPrepare: async input => {
      assert.deepEqual(input, order)
      return { ok: true, status: 200, data: { orderSubmitted: false, mode: 'agent-independent-v1' } }
    },
  })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.prepared?.data.orderSubmitted, false)
})

test('independent choice retains real acknowledgement and supported-side checks', async () => {
  for (const [independentOrder, status] of [[{}, 428], [{ acknowledgeIndependentDecision: true, side: 'SELL' }, 400]] as const) {
    const result = await preflightSmartTraderBeforeSettlement({ action: 'INDEPENDENT_PREPARE', independentOrder }, researchDown)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, status)
  }
})

test('mixed research inputs cannot silently become independent orders', async () => {
  const result = await preflightSmartTraderBeforeSettlement({ action: 'INDEPENDENT_PREPARE', query: 'choose for me' }, researchDown)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.status, 400)
})
