import assert from 'node:assert/strict'
import test from 'node:test'
import { bindPolymarketOrder, EXCHANGES_V2, FILL_INTERFACE, verifyOrderFillLogs } from '../api/polymarket-order-proof.js'

const order = {
  salt: '123', maker: '0x1111111111111111111111111111111111111111', signer: '0x1111111111111111111111111111111111111111',
  tokenId: '123456789', makerAmount: '5000000', takerAmount: '10000000', side: 'BUY', signatureType: 3,
  timestamp: '1800000000000', metadata: '0x' + '00'.repeat(32), builder: '0x' + 'ab'.repeat(32),
}
const binding = bindPolymarketOrder(order)
const tx = '0x' + 'cd'.repeat(32)
const other = '0x' + 'ef'.repeat(32)
function log(exchange: string = EXCHANGES_V2[0], overrides: Record<string, unknown> = {}) {
  const values = { hash: binding.hashes[exchange], maker: order.maker, side: 0, token: order.tokenId,
    spent: 2500000, shares: 5000000, builder: order.builder, metadata: order.metadata, ...overrides }
  return { address: exchange, logIndex: '0x0', transactionHash: tx, ...FILL_INTERFACE.encodeEventLog(FILL_INTERFACE.getEvent('OrderFilled')!, [
    values.hash, values.maker, exchange, values.side, values.token, values.spent, values.shares, 0, values.builder, values.metadata,
  ]) }
}
function receipt(logs: unknown[] = [log()]) { return { status: '0x1', transactionHash: tx, logs } }
function verify(value = receipt(), id = binding.hashes[EXCHANGES_V2[0]]) { return verifyOrderFillLogs(binding, id, tx, value, '0.5', '5') }

test('decodes exact-order fills on either V2 exchange, independent of router transaction target', () => {
  for (const exchange of EXCHANGES_V2) {
    const result = verify(receipt([log(exchange)]), binding.hashes[exchange])
    assert.equal(result.spent, 2500000n)
    assert.equal(result.shares, 5000000n)
    assert.equal(result.exchange, exchange)
  }
})
test('order IDs bind every signed field and exchange domain', () => {
  for (const [key, value] of Object.entries({ salt: '124', makerAmount: '4999999', takerAmount: '9999999', tokenId: '123456788',
    timestamp: '1800000000001', signer: '0x2222222222222222222222222222222222222222', metadata: other, builder: other, signatureType: 2 })) {
    assert.notEqual(bindPolymarketOrder({ ...order, [key]: value }).hashes[EXCHANGES_V2[0]], binding.hashes[EXCHANGES_V2[0]], key)
  }
  assert.notEqual(binding.hashes[EXCHANGES_V2[0]], binding.hashes[EXCHANGES_V2[1]])
})
test('rejects incidental order text, wrong emitter, malformed logs and wrong transaction', () => {
  assert.throws(() => verify({ ...receipt([]), incidental: binding.hashes[EXCHANGES_V2[0]] } as ReturnType<typeof receipt>), /No exact/)
  assert.throws(() => verify(receipt([{ ...log(), address: order.maker }])), /No exact/)
  assert.throws(() => verify(receipt([{ ...log(), data: '0x1234' }])), /No exact/)
  assert.throws(() => verify({ ...receipt(), transactionHash: other }), /identity/)
  assert.throws(() => verify(receipt([log()]), other), /No exact/)
  assert.throws(() => verify(receipt([{ ...log(), removed: true }])), /removed/)
  assert.throws(() => verify(receipt([{ ...log(), transactionHash: other }])), /another transaction/)
  assert.throws(() => verify(receipt([{ ...log(), logIndex: undefined }])), /index/)
})
test('rejects wrong maker, token, side, builder, metadata, and out-of-bound fills', () => {
  for (const overrides of [{ maker: EXCHANGES_V2[0] }, { token: '9' }, { side: 1 }, { builder: other }, { metadata: other },
    { spent: 3000000 }, { spent: 0 }, { shares: 0 }, { spent: 6000000, shares: 12000000 }]) {
    assert.throws(() => verify(receipt([log(EXCHANGES_V2[0], overrides)])))
  }
})
test('sums only exact-order fills and rejects duplicate or excessive aggregates', () => {
  const second = { ...log(), logIndex: '0x1' }
  assert.equal(verify(receipt([log(), second, { ...log(EXCHANGES_V2[0], { hash: other }), logIndex: '0x2' }])).spent, 5000000n)
  assert.throws(() => verify(receipt([log(), log()])), /Duplicate/)
  assert.throws(() => verify(receipt([log(), second, { ...log(), logIndex: '0x2' }])), /spend bound/)
})
