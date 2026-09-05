import assert from 'node:assert/strict'
import test from 'node:test'
import { preflightSmartTraderBeforeSettlement } from '../api/okx-a2mcp-standard-services.js'

const forbidden = async (): Promise<never> => { throw new Error('Research and paid preparation must not run') }
const researchDown = { validate: forbidden, operational: forbidden, providers: forbidden, prepare: forbidden }

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
