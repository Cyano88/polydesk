import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchPolygonFinality, verifyPolygonFinality } from '../api/polymarket-receipt-finality.js'
const blockHash = '0x' + 'aa'.repeat(32)
const tx = '0x' + 'bb'.repeat(32)
const receipt = { blockNumber: '0x10', blockHash, transactionHash: tx }
const block = { number: '0x10', hash: blockHash, transactions: [tx] }
const finalized = { number: '0x11', hash: '0x' + 'cc'.repeat(32) }
test('finality binds Polygon chain, canonical block and transaction membership', () => {
  assert.equal(verifyPolygonFinality(receipt, '0x89', block, finalized).blockHash, blockHash)
  assert.equal(verifyPolygonFinality(receipt, '0x89', block, block).finalizedBlockNumber, '0x10')
})
test('pending, reorged, wrong-chain and unrelated transaction evidence fail closed', () => {
  for (const [chain, canonical, final] of [
    ['0x1', block, finalized],
    ['0x89', { ...block, hash: finalized.hash }, finalized],
    ['0x89', { ...block, number: '0xf' }, finalized],
    ['0x89', { ...block, transactions: [] }, finalized],
    ['0x89', block, { ...finalized, number: '0xf' }],
    ['0x89', block, { ...finalized, number: '0x10' }],
    ['0x89', null, finalized],
    ['0x89', block, null],
  ]) assert.throws(() => verifyPolygonFinality(receipt, chain, canonical, final))
})
test('missing or malformed block identity never defaults to latest', () => {
  for (const bad of [undefined, null, 16, '16', '0x', '0x00', '-1', '0x10000000000000000']) {
    assert.throws(() => verifyPolygonFinality({ ...receipt, blockNumber: bad }, '0x89', block, finalized))
  }
  assert.throws(() => verifyPolygonFinality({ ...receipt, blockHash: undefined }, '0x89', block, finalized))
})
test('RPC finality watermark precedes exact canonical block lookup without fallback', async () => {
  const calls: unknown[] = []
  const proof = await fetchPolygonFinality(receipt, async (method, params) => {
    calls.push([method, params])
    return method === 'eth_chainId' ? '0x89' : params[0] === 'finalized' ? finalized : block
  })
  assert.equal(proof.chainId, 'eip155:137')
  assert.deepEqual(calls, [['eth_chainId', []], ['eth_getBlockByNumber', ['finalized', false]], ['eth_getBlockByNumber', ['0x10', false]]])
  const failed: string[] = []
  await assert.rejects(fetchPolygonFinality(receipt, async method => {
    failed.push(method)
    if (method === 'eth_chainId') return '0x89'
    throw new Error('Unsupported finalized tag')
  }))
  assert.deepEqual(failed, ['eth_chainId', 'eth_getBlockByNumber'])
})
