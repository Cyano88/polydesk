import assert from 'node:assert/strict'
import test from 'node:test'
import { id } from 'ethers'
import type { Request, Response } from 'express'
import { basePaymentAttemptBinding, BasePaymentAttempts, type BasePaymentAttempt } from '../api/base-payment-attempt.js'
import { createBasePaymentRecoveryHandler, createBaseRecoveryRpc, verifyBasePaymentRecovery } from '../api/base-payment-recovery.js'
import { BASE_MAINNET_CAIP2, BASE_NATIVE_USDC } from '../api/base-agentic-market-smart-trader.js'
import { buildSettledSmartTraderAnalysisRecord, reuseSettledSmartTraderAnalysis, type SmartTraderPaidAnalysisRecord } from '../api/polymarket-smart-trader.js'

const tx = '0x' + 'ab'.repeat(32)
const blockHash = '0x' + 'cd'.repeat(32)
const payer = '0x' + '22'.repeat(20)
const seller = '0x' + '11'.repeat(20)
const nonce = '0x' + 'ef'.repeat(32)
const word = (value: string) => '0x' + value.slice(2).padStart(64, '0')
const request = { action: 'ANALYZE', marketId: '0x' + '12'.repeat(32), outcome: 'Yes', side: 'BUY' }
const requirements = { scheme: 'exact', network: BASE_MAINNET_CAIP2, asset: BASE_NATIVE_USDC, amount: '300000', payTo: seller, maxTimeoutSeconds: 600 }
const payload = { x402Version: 2, accepted: requirements, payload: { authorization: { from: payer, to: seller, value: '300000', nonce } } }
function fixture() {
  const binding = basePaymentAttemptBinding(request, requirements, payload, payer)
  const attempt: BasePaymentAttempt = { ...binding, schema: 'polydesk-base-payment-attempt-v1', state: 'attempted', claimToken: 'synthetic-claim', createdAt: new Date(0).toISOString() }
  const metadata = { address: BASE_NATIVE_USDC, transactionHash: tx, blockHash, blockNumber: '0x10', transactionIndex: '0x0', removed: false }
  const receipt: any = { transactionHash: tx, status: '0x1', blockHash, blockNumber: '0x10', transactionIndex: '0x0', logs: [
    { ...metadata, topics: [id('AuthorizationUsed(address,bytes32)'), word(payer), nonce], data: '0x', logIndex: '0x1' },
    { ...metadata, topics: [id('Transfer(address,address,uint256)'), word(payer), word(seller)], data: word('0x493e0'), logIndex: '0x2' },
  ] }
  const chain = { id: '0x2105', finalized: { number: '0x11', hash: '0x' + 'aa'.repeat(32) },
    canonical: { number: '0x10', hash: blockHash, transactions: [tx] } }
  const calls: string[] = []
  const rpc = async (method: string, params: unknown[]) => {
    calls.push(method)
    if (method === 'eth_chainId') return chain.id
    if (method === 'eth_getTransactionReceipt') { assert.deepEqual(params, [tx]); return receipt }
    if (method === 'eth_getBlockByNumber') return params[0] === 'finalized' ? chain.finalized : chain.canonical
    throw new Error('Unexpected RPC; no writes allowed')
  }
  return { attempt, receipt, chain, calls, rpc }
}

test('finalized Base proof binds the exact EIP-3009 nonce and transfer without any write RPC', async () => {
  const f = fixture()
  assert.deepEqual(await verifyBasePaymentRecovery(f.attempt, tx, f.rpc), { chainId: BASE_MAINNET_CAIP2, transaction: tx,
    blockNumber: '0x10', blockHash, finalizedBlockNumber: '0x11', finalizedBlockHash: f.chain.finalized.hash })
  assert.deepEqual(f.calls, ['eth_chainId', 'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getBlockByNumber'])
})

const invalid: Record<string, (f: ReturnType<typeof fixture>) => void> = {
  'wrong chain': f => { f.chain.id = '0x89' },
  'wrong payment network': f => { f.attempt.network = 'eip155:137' },
  'wrong token': f => { f.attempt.asset = seller },
  'wrong fixed fee': f => { f.attempt.amount = '300001' },
  'conflicting prior transaction': f => { f.attempt.transaction = blockHash },
  'reverted receipt': f => { f.receipt.status = '0x0' },
  'wrong receipt transaction': f => { f.receipt.transactionHash = blockHash },
  'unfinalized receipt': f => { f.chain.finalized.number = '0xf' },
  'missing finalized block': f => { f.chain.finalized = null as any },
  'conflicting finality hash': f => { f.chain.finalized.number = '0x10' },
  'noncanonical block': f => { f.chain.canonical.hash = tx },
  'wrong canonical height': f => { f.chain.canonical.number = '0xf' },
  'absent canonical transaction': f => { f.chain.canonical.transactions = [] },
  'wrong canonical transaction index': f => { f.chain.canonical.transactions.unshift(blockHash) },
  'ambiguous canonical transaction': f => { f.chain.canonical.transactions.push(tx) },
  'noncanonical hex height': f => { f.receipt.blockNumber = '0x010' },
  'missing logs': f => { f.receipt.logs = null },
  'transfer alone': f => { f.receipt.logs.shift() },
  'additional USDC transfer': f => { f.receipt.logs.push(structuredClone(f.receipt.logs[1])) },
  'counterfeit token logs': f => { f.receipt.logs.forEach((log: any) => { log.address = seller }) },
  'cancelled authorization': f => { f.receipt.logs[0].topics[0] = id('AuthorizationCanceled(address,bytes32)') },
  'wrong authorization buyer': f => { f.receipt.logs[0].topics[1] = word(seller) },
  'wrong nonce': f => { f.receipt.logs[0].topics[2] = tx },
  'nonempty authorization data': f => { f.receipt.logs[0].data = nonce },
  'wrong transfer buyer': f => { f.receipt.logs[1].topics[1] = word(seller) },
  'wrong transfer seller': f => { f.receipt.logs[1].topics[2] = word(payer) },
  'wrong transfer amount': f => { f.receipt.logs[1].data = word('0x493e1') },
  'truncated amount': f => { f.receipt.logs[1].data = '0x493e0' },
  'removed log': f => { f.receipt.logs[1].removed = true },
  'missing removed evidence': f => { delete f.receipt.logs[1].removed },
  'different log transaction': f => { f.receipt.logs[1].transactionHash = blockHash },
  'different log block': f => { f.receipt.logs[1].blockHash = tx },
  'different log height': f => { f.receipt.logs[1].blockNumber = '0x11' },
  'different log transaction index': f => { f.receipt.logs[1].transactionIndex = '0x1' },
  'duplicate log index': f => { f.receipt.logs[1].logIndex = '0x1' },
  'nonadjacent transfer': f => { f.receipt.logs[1].logIndex = '0x3' },
  'extra event topic': f => { f.receipt.logs[1].topics.push(tx) },
}
for (const [name, change] of Object.entries(invalid)) test(`recovery rejects ${name}`, async () => {
  const f = fixture(); change(f)
  await assert.rejects(verifyBasePaymentRecovery(f.attempt, tx, f.rpc))
})

function harness() {
  const f = fixture()
  const records = new Map<string, BasePaymentAttempt>([[`polydesk:base-payment-attempt:${f.attempt.id}`, structuredClone(f.attempt)]])
  const analyses = new Map<string, SmartTraderPaidAnalysisRecord>()
  const config = { ready: true, failAttempt: false, loseAttemptAck: false, failBind: false, loseBindAck: false, changeDuringProof: false }
  let writes = 0
  const attempts = new BasePaymentAttempts(async (key, update) => {
    const next = update(structuredClone(records.get(key)))
    if (config.failAttempt) throw new Error('private synthetic storage detail')
    records.set(key, structuredClone(next)); writes++
    if (config.loseAttemptAck) throw new Error('lost attempt acknowledgement')
    return structuredClone(next)
  }, async key => structuredClone(records.get(key)))
  const handler = createBasePaymentRecoveryHandler({ attempts, ready: () => config.ready, rpc: async (method, params) => {
    const result = await f.rpc(method, params)
    if (config.changeDuringProof) records.get(`polydesk:base-payment-attempt:${f.attempt.id}`)!.claimToken = 'changed'
    return result
  }, bind: async (raw, payment) => {
    assert.deepEqual(raw, f.attempt.request)
    if (config.failBind) throw new Error('private synthetic delivery detail')
    const next = reuseSettledSmartTraderAnalysis(analyses.get(payment.transaction), buildSettledSmartTraderAnalysisRecord(raw, payment))
    analyses.set(payment.transaction, structuredClone(next))
    if (config.loseBindAck) throw new Error('lost analysis acknowledgement')
    return structuredClone(next)
  } })
  const run = async (body: unknown = { paymentAttemptId: f.attempt.id, transaction: tx }, method = 'POST') => {
    const output = { status: 0, body: undefined as any, headers: {} as Record<string, unknown> }
    const res = { setHeader: (key: string, value: unknown) => { output.headers[key] = value },
      status: (status: number) => { output.status = status; return res }, json: (value: unknown) => { output.body = value; return res } } as unknown as Response
    await handler({ method, body } as Request, res)
    return output
  }
  return { ...f, attempts, records, analyses, config, run, writes: () => writes }
}

test('recovery repairs only the original analysis and concurrent retries preserve its existing delivery', async () => {
  const h = harness()
  assert.equal((await h.run()).status, 200)
  const saved = h.analyses.get(tx)!
  saved.deliveryAttemptCount = 2
  const results = await Promise.all([h.run(), h.run()])
  assert.ok(results.every(result => result.status === 200))
  assert.equal(h.analyses.size, 1)
  assert.equal(h.analyses.get(tx)!.deliveryAttemptCount, 2)
  assert.equal([...h.records.values()][0].recoveryProof?.transaction, tx)
  assert.equal(results[0].body.retryPayment, false)
  assert.equal(results[0].body.statusUrl, `/api/a2mcp/polymarket-smart-trader/payment/${tx}`)
  assert.equal(results[0].headers['Cache-Control'], 'no-store')
  assert.equal(JSON.stringify(results[0].body).includes('claimToken'), false)
  assert.equal(JSON.stringify(results[0].body).includes('marketId'), false)
})

for (const failure of ['failAttempt', 'loseAttemptAck', 'failBind', 'loseBindAck'] as const) test(`recovery can resume after ${failure} without resetting the claim or charging`, async () => {
  const h = harness(); h.config[failure] = true
  const result = await h.run()
  assert.equal(result.status, 503)
  assert.equal(result.body.retryPayment, false)
  assert.equal(result.body.recoveryRequired, true)
  assert.equal(JSON.stringify(result.body).includes('private synthetic'), false)
  if (failure === 'failAttempt' || failure === 'loseAttemptAck') assert.equal(h.analyses.size, 0)
  h.config[failure] = false
  assert.equal((await h.run()).status, 200)
  assert.equal(h.analyses.size, 1)
  assert.equal([...h.records.values()][0].claimToken, h.attempt.claimToken)
})

test('recovery stops on missing/corrupt records and stale claims after chain verification', async () => {
  const h = harness()
  h.config.changeDuringProof = true
  assert.equal((await h.run()).status, 503)
  assert.equal(h.writes(), 0)
  assert.equal(h.analyses.size, 0)
  h.config.changeDuringProof = false
  const stored = [...h.records.values()][0]
  stored.request.outcome = 'No'
  h.calls.length = 0
  assert.equal((await h.run()).status, 503)
  assert.equal(h.calls.length, 0)
  h.records.clear()
  assert.equal((await h.run()).status, 404)
})

test('invalid evidence never mutates either store or creates a paid delivery', async () => {
  const h = harness(); h.receipt.logs[0].topics[2] = tx
  assert.equal((await h.run()).status, 503)
  assert.equal(h.writes(), 0)
  assert.equal(h.analyses.size, 0)
  assert.equal([...h.records.values()][0].state, 'attempted')
})

test('method, input and readiness gates stop before storage or RPC', async () => {
  const h = harness()
  assert.equal((await h.run(undefined, 'GET')).status, 405)
  for (const body of [null, [], {}, { paymentAttemptId: h.attempt.id, transaction: tx, request },
    { paymentAttemptId: h.attempt.id, transaction: tx, rpcUrl: 'https://untrusted.example' },
    { paymentAttemptId: '../other', transaction: tx }, { paymentAttemptId: h.attempt.id, transaction: '0x' + '00'.repeat(32) }]) {
    assert.equal((await h.run(body)).status, 400)
  }
  h.config.ready = false
  assert.equal((await h.run()).status, 503)
  assert.equal(h.calls.length, 0)
  assert.equal(h.writes(), 0)
})

test('read-only RPC transport validates envelopes, disables redirects and bounds responses', async () => {
  let calls = 0
  const rpc = createBaseRecoveryRpc('https://rpc.example/base', (async (_url, init) => {
    calls++
    assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal)
    const body = JSON.parse(String(init?.body))
    return new globalThis.Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x2105' }))
  }) as typeof fetch)
  assert.equal(await rpc('eth_chainId', []), '0x2105')
  await assert.rejects(rpc('eth_sendRawTransaction', []))
  assert.equal(calls, 1)
  for (const url of ['http://rpc.example', 'https://user:password@rpc.example', 'https://rpc.example/#redirect']) assert.throws(() => createBaseRecoveryRpc(url))
  for (const response of [new globalThis.Response('x', { status: 502 }), new globalThis.Response('{'),
    new globalThis.Response(JSON.stringify({ jsonrpc: '2.0', id: 9, result: '0x2105' })),
    new globalThis.Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'private' } })),
    new globalThis.Response('x'.repeat(2 * 1024 * 1024 + 1))]) {
    await assert.rejects(createBaseRecoveryRpc('https://rpc.example', (async () => response) as typeof fetch)('eth_chainId', []))
  }
})
