// Explicit opt-in, dedicated local database only. Never load a project .env file.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { id } from 'ethers'

async function main() {
  const raw = process.env.POLYDESK_TEST_DATABASE_URL
  assert.ok(raw, 'Set POLYDESK_TEST_DATABASE_URL to the dedicated local acceptance database.')
  const url = new URL(raw)
  assert.equal(url.protocol, 'postgresql:')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.port, '55489')
  assert.equal(url.pathname, '/polydesk_recovery_test')
  assert.equal(url.username, 'polydesk_test')
  assert.equal(url.search, '')
  process.env.DATABASE_URL = raw
  delete process.env.POSTGRES_URL
  const { BasePaymentAttempts, basePaymentAttemptBinding, ExistingBasePaymentAttempt } = await import('../api/base-payment-attempt.js')
  const { mutateDurableJson, readDurableJson } = await import('../api/render-durable-store.js')
  const { createBasePaymentRecoveryHandler } = await import('../api/base-payment-recovery.js')
  const { BASE_NATIVE_USDC } = await import('../api/base-agentic-market-smart-trader.js')
  const attempts = new BasePaymentAttempts()
  if (process.argv[2] === '--reopen') {
    const stored = await attempts.get(process.argv[3])
    assert.ok(stored)
    assert.equal(stored.state, 'settled')
    assert.ok(stored.recoveryProof)
    await assert.rejects(attempts.claim(stored), ExistingBasePaymentAttempt)
    console.log('PASS fresh-process durable recovery and replay rejection')
    return
  }
  const payer = '0x' + '22'.repeat(20)
  const seller = '0x' + '11'.repeat(20)
  const nonce = '0x' + randomBytes(32).toString('hex')
  const transaction = '0x' + randomBytes(32).toString('hex')
  const blockHash = '0x' + 'cd'.repeat(32)
  const requirements = { scheme: 'exact', network: 'eip155:8453', asset: BASE_NATIVE_USDC,
    amount: '300000', payTo: seller, maxTimeoutSeconds: 600 }
  const payload = { x402Version: 2, accepted: requirements, payload: { authorization: { from: payer, to: seller, value: '300000', nonce } } }
  const request = { action: 'ANALYZE', marketId: '0x' + '12'.repeat(32), outcome: 'Yes', side: 'BUY' }
  const binding = basePaymentAttemptBinding(request, requirements, payload as never, payer)
  const outcomes = await Promise.allSettled(Array.from({ length: 24 }, () => attempts.claim(binding)))
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1)
  const rejected = outcomes.filter(result => result.status === 'rejected') as PromiseRejectedResult[]
  assert.ok(rejected.every(result => result.reason instanceof ExistingBasePaymentAttempt))
  const claim = await attempts.get(binding.id)
  assert.ok(claim)
  assert.equal(claim.state, 'attempted')
  console.log('PASS 24 competing claims: one commit, 23 replay rejections on real PostgreSQL')

  const rollbackKey = `polydesk:acceptance-rollback:${nonce}`
  await assert.rejects(mutateDurableJson(rollbackKey, () => { throw new Error('synthetic rollback') }))
  assert.equal(await readDurableJson(rollbackKey), undefined)
  await mutateDurableJson(rollbackKey, () => ({ value: 1 }))
  await assert.rejects(mutateDurableJson(rollbackKey, () => { throw new Error('synthetic existing-row rollback') }))
  assert.deepEqual(await readDurableJson(rollbackKey), { value: 1 })
  console.log('PASS transaction rollback preserves absent and existing rows')

  const word = (value: string) => '0x' + value.slice(2).padStart(64, '0')
  const metadata = { address: BASE_NATIVE_USDC, transactionHash: transaction, blockHash, blockNumber: '0x10', transactionIndex: '0x0', removed: false }
  const receipt = { transactionHash: transaction, status: '0x1', blockHash, blockNumber: '0x10', transactionIndex: '0x0', logs: [
    { ...metadata, topics: [id('AuthorizationUsed(address,bytes32)'), word(payer), nonce], data: '0x', logIndex: '0x1' },
    { ...metadata, topics: [id('Transfer(address,address,uint256)'), word(payer), word(seller)], data: word('0x493e0'), logIndex: '0x2' },
  ] }
  const rpc = async (method: string, params: unknown[]) => {
    if (method === 'eth_chainId') return '0x2105'
    if (method === 'eth_getTransactionReceipt') { assert.deepEqual(params, [transaction]); return receipt }
    if (method === 'eth_getBlockByNumber') return params[0] === 'finalized'
      ? { number: '0x11', hash: '0x' + 'aa'.repeat(32) }
      : { number: '0x10', hash: blockHash, transactions: [transaction] }
    throw new Error('No write RPC is permitted')
  }
  // Real HTTP and default Postgres attempt/binding adapters; only chain evidence is synthetic.
  const app = express()
  app.use(express.json({ limit: '256kb' }))
  let interruptBinding = true
  const { bindSettledSmartTraderAnalysis } = await import('../api/polymarket-smart-trader.js')
  app.post('/recover', createBasePaymentRecoveryHandler({ ready: () => true, rpc, bind: async (...args) => {
    if (interruptBinding) throw new Error('synthetic crash after settled-attempt commit')
    return bindSettledSmartTraderAnalysis(...args)
  } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const recover = async () => {
      const response = await fetch(`http://127.0.0.1:${address.port}/recover`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentAttemptId: binding.id, transaction }), signal: AbortSignal.timeout(15000) })
      return { status: response.status, body: await response.json() as Record<string, unknown> }
    }
    const interrupted = await recover()
    assert.equal(interrupted.status, 503)
    assert.equal(interrupted.body.retryPayment, false)
    assert.equal((await attempts.get(binding.id))?.state, 'settled')
    interruptBinding = false
    const recoveries = await Promise.all(Array.from({ length: 16 }, recover))
    assert.ok(recoveries.every(result => result.status === 200 && result.body.retryPayment === false))
    const payment = { provider: 'CDP x402' as const, network: 'Base' as const, payer, transaction,
      amountAtomic: '300000', serviceUrl: '/api/x402/base/polymarket-smart-trader' as const }
    const analysis = await bindSettledSmartTraderAnalysis(request, payment)
    assert.equal(analysis.requestHash, binding.requestHash)
    assert.equal(analysis.deliveryAttemptCount, 0)
    await assert.rejects(bindSettledSmartTraderAnalysis({ ...request, outcome: 'No' }, payment))
    await assert.rejects(bindSettledSmartTraderAnalysis(request, { ...payment, payer: seller }))
    await assert.rejects(attempts.settled({ ...claim, claimToken: 'stale' }, transaction))
    console.log('PASS interrupted recovery repaired by 16 concurrent HTTP requests; original buyer/request retained')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
  const child = await promisify(execFile)(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--reopen', binding.id],
    { timeout: 60000, env: process.env })
  assert.match(child.stdout, /PASS fresh-process/)
  console.log(child.stdout.trim())
  console.log('ACCEPTANCE PASS: real local PostgreSQL and HTTP; synthetic chain only; no payment or trade')
}
main().then(() => process.exit(0)).catch(() => {
  // Do not print connection URLs, provider configuration or row contents on failure.
  console.error('ACCEPTANCE FAILED: inspect the isolated test environment; no production fallback is allowed.')
  process.exit(1)
})
