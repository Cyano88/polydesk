// Read-only API compatibility smoke against Base's documented public endpoint.
// This does not configure production RPC or prove a service payment was settled.
import assert from 'node:assert/strict'
import { createBaseRecoveryRpc } from '../api/base-payment-recovery.js'

async function main() {
  const rpc = createBaseRecoveryRpc('https://mainnet.base.org')
  assert.equal(await rpc('eth_chainId', []), '0x2105')
  const finalized = await rpc('eth_getBlockByNumber', ['finalized', false]) as Record<string, unknown>
  assert.match(String(finalized.number), /^0x[0-9a-f]+$/i)
  assert.match(String(finalized.hash), /^0x[0-9a-f]{64}$/i)
  const canonical = await rpc('eth_getBlockByNumber', [finalized.number, false]) as Record<string, unknown>
  assert.equal(canonical.number, finalized.number)
  assert.equal(canonical.hash, finalized.hash)
  assert.ok(Array.isArray(canonical.transactions) && canonical.transactions.length > 0)
  const tx = canonical.transactions[0]
  assert.match(tx, /^0x[0-9a-f]{64}$/i)
  const receipt = await rpc('eth_getTransactionReceipt', [tx]) as Record<string, unknown>
  assert.equal(receipt.transactionHash, tx)
  assert.equal(receipt.blockNumber, canonical.number)
  assert.equal(receipt.blockHash, canonical.hash)
  assert.equal(receipt.transactionIndex, '0x0')
  assert.ok(Array.isArray(receipt.logs))
  console.log('PASS Base chain ID, finalized/canonical block agreement and receipt identity using the real recovery RPC transport')
  console.log('READ-ONLY ONLY: no service-payment verification, configuration change, signing or settlement')
}
main().then(() => process.exit(0)).catch(() => {
  console.error('Base read-only RPC acceptance failed or unavailable; production configuration remains unchanged.')
  process.exit(1)
})
