import type { Request, Response } from 'express'
import { id } from 'ethers'
import { BasePaymentAttempts, type BasePaymentAttempt, type BasePaymentRecoveryProof } from './base-payment-attempt.js'
import { BASE_MAINNET_CAIP2, BASE_NATIVE_USDC, BASE_AGENTIC_MARKET_SMART_TRADER_PATH } from './base-agentic-market-smart-trader.js'
import { bindSettledSmartTraderAnalysis } from './polymarket-smart-trader.js'
import { hasRenderDurableStore } from './render-durable-store.js'

type Json = Record<string, unknown>
type Rpc = (method: string, params: unknown[]) => Promise<unknown>
const authorizationUsed = id('AuthorizationUsed(address,bytes32)')
const transfer = id('Transfer(address,address,uint256)')
const wordAddress = (address: string) => '0x' + address.slice(2).padStart(64, '0').toLowerCase()
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Missing chain evidence.')
  return value as Json
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[a-f0-9]{64}$/i.test(value) || /^0x0{64}$/.test(value)) throw new Error('Invalid chain hash.')
  return value.toLowerCase()
}
function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(value) || value.length > 18) throw new Error('Invalid chain quantity.')
  return BigInt(value)
}

// Only trusted server RPC evidence is accepted. Never import a client-supplied receipt.
export async function verifyBasePaymentRecovery(attempt: BasePaymentAttempt, transaction: string, rpc: Rpc): Promise<BasePaymentRecoveryProof> {
  const tx = hash(transaction)
  if (attempt.network !== BASE_MAINNET_CAIP2 || attempt.asset !== BASE_NATIVE_USDC.toLowerCase()
    || attempt.amount !== '300000' || !/^0x[a-f0-9]{40}$/.test(attempt.payer)
    || !/^0x[a-f0-9]{40}$/.test(attempt.seller) || !/^0x[a-f0-9]{64}$/.test(attempt.nonce)
    || (attempt.transaction && hash(attempt.transaction) !== tx)) throw new Error('Payment attempt does not match the Base lane.')
  if (quantity(await rpc('eth_chainId', [])) !== 8453n) throw new Error('Recovery RPC is not Base mainnet.')
  const receipt = object(await rpc('eth_getTransactionReceipt', [tx]))
  if (receipt.status !== '0x1' || hash(receipt.transactionHash) !== tx) throw new Error('Payment is not successful.')
  const height = quantity(receipt.blockNumber)
  const blockNumber = '0x' + height.toString(16)
  const blockHash = hash(receipt.blockHash)
  const finalized = object(await rpc('eth_getBlockByNumber', ['finalized', false]))
  const finalHeight = quantity(finalized.number)
  const finalizedBlockHash = hash(finalized.hash)
  if (height > finalHeight || (height === finalHeight && finalizedBlockHash !== blockHash)) throw new Error('Payment is not finalized.')
  const canonical = object(await rpc('eth_getBlockByNumber', [blockNumber, false]))
  const transactionIndex = quantity(receipt.transactionIndex)
  if (quantity(canonical.number) !== height || hash(canonical.hash) !== blockHash
    || !Array.isArray(canonical.transactions) || transactionIndex >= BigInt(canonical.transactions.length)
    || typeof canonical.transactions[Number(transactionIndex)] !== 'string'
    || canonical.transactions[Number(transactionIndex)].toLowerCase() !== tx
    || canonical.transactions.filter(value => typeof value === 'string' && value.toLowerCase() === tx).length !== 1) {
    throw new Error('Payment is not in its canonical finalized block.')
  }
  if (!Array.isArray(receipt.logs) || receipt.logs.length > 2048) throw new Error('Invalid payment logs.')
  // Circle emits AuthorizationUsed immediately before its Transfer. Conservatively
  // reject transactions with additional USDC logs rather than infer batch attribution.
  const logs = receipt.logs.map(object).filter(log => typeof log.address === 'string' && log.address.toLowerCase() === attempt.asset)
  if (logs.length !== 2) throw new Error('Ambiguous USDC payment logs.')
  for (const log of logs) {
    if (log.removed !== false || hash(log.transactionHash) !== tx || hash(log.blockHash) !== blockHash
      || quantity(log.blockNumber) !== height || quantity(log.transactionIndex) !== quantity(receipt.transactionIndex)
      || !Array.isArray(log.topics) || log.topics.length !== 3 || log.topics.some(topic => typeof topic !== 'string' || !/^0x[a-f0-9]{64}$/i.test(topic))) {
      throw new Error('Inconsistent payment log evidence.')
    }
  }
  const [used, paid] = logs
  const usedTopics = (used.topics as string[]).map(value => value.toLowerCase())
  const paidTopics = (paid.topics as string[]).map(value => value.toLowerCase())
  if (usedTopics[0] !== authorizationUsed || usedTopics[1] !== wordAddress(attempt.payer) || usedTopics[2] !== attempt.nonce
    || used.data !== '0x' || paidTopics[0] !== transfer || paidTopics[1] !== wordAddress(attempt.payer)
    || paidTopics[2] !== wordAddress(attempt.seller) || typeof paid.data !== 'string' || !/^0x[a-f0-9]{64}$/i.test(paid.data)
    || BigInt(paid.data) !== BigInt(attempt.amount) || quantity(paid.logIndex) !== quantity(used.logIndex) + 1n) {
    throw new Error('Authorization nonce and transfer do not match the original payment.')
  }
  return { chainId: BASE_MAINNET_CAIP2, transaction: tx, blockNumber, blockHash,
    finalizedBlockNumber: '0x' + finalHeight.toString(16), finalizedBlockHash }
}

// No public fallback, redirects, retries, payment methods or caller-selected RPC.
export function createBaseRecoveryRpc(url: string, fetcher: typeof fetch = fetch): Rpc {
  const endpoint = new URL(url)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Configure a trusted HTTPS Base recovery RPC.')
  let sequence = 0
  return async (method, params) => {
    if (!['eth_chainId', 'eth_getTransactionReceipt', 'eth_getBlockByNumber'].includes(method)) throw new Error('Recovery is read-only.')
    const requestId = ++sequence
    const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) })
    if (!response.ok || !response.body) throw new Error('Recovery RPC unavailable.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 2 * 1024 * 1024) throw new Error('Recovery RPC response too large.')
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
    const body = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (body.jsonrpc !== '2.0' || body.id !== requestId || 'error' in body || !('result' in body)) throw new Error('Invalid recovery RPC response.')
    return body.result
  }
}

type Dependencies = {
  attempts: BasePaymentAttempts
  ready: () => boolean
  rpc: Rpc
  bind: typeof bindSettledSmartTraderAnalysis
}
export function createBasePaymentRecoveryHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    attempts: new BasePaymentAttempts(), ready: () => hasRenderDurableStore() && Boolean(process.env.BASE_PAYMENT_RECOVERY_RPC_URL),
    rpc: (method, params) => createBaseRecoveryRpc(process.env.BASE_PAYMENT_RECOVERY_RPC_URL ?? '')(method, params),
    bind: bindSettledSmartTraderAnalysis, ...overrides,
  }
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['paymentAttemptId', 'transaction'].includes(key))
      || typeof body.paymentAttemptId !== 'string' || !/^[a-f0-9]{64}$/.test(body.paymentAttemptId)
      || typeof body.transaction !== 'string' || !/^0x[a-f0-9]{64}$/i.test(body.transaction) || /^0x0{64}$/.test(body.transaction)) {
      return res.status(400).json({ ok: false, error: 'Supply only the original payment attempt ID and transaction hash.', retryPayment: false })
    }
    if (!dependencies.ready()) return res.status(503).json({ ok: false, error: 'Payment recovery is not configured.', retryPayment: false })
    try {
      const attempt = await dependencies.attempts.get(body.paymentAttemptId)
      if (!attempt) return res.status(404).json({ ok: false, error: 'Payment attempt not found.', retryPayment: false })
      const proof = await verifyBasePaymentRecovery(attempt, body.transaction, dependencies.rpc)
      // Compare the original claim again under the durable lock after all RPC calls.
      const settled = await dependencies.attempts.settled(attempt, proof.transaction, proof)
      // Restart-safe even if either commit acknowledgement is lost. No new request,
      // payment, research approval, trade signature or order submission is authorized.
      await dependencies.bind(settled.request, { provider: 'CDP x402', network: 'Base', payer: settled.payer,
        transaction: proof.transaction, amountAtomic: settled.amount, serviceUrl: BASE_AGENTIC_MARKET_SMART_TRADER_PATH })
      return res.status(200).json({ ok: true, paymentStatus: 'settled', recoveryBasis: 'finalized_chain', retryPayment: false,
        paymentAttemptId: settled.id, transaction: proof.transaction,
        statusUrl: `/api/a2mcp/polymarket-smart-trader/payment/${proof.transaction}` })
    } catch {
      return res.status(503).json({ ok: false, error: 'Recovery is unconfirmed. Reconcile this attempt; do not pay again.',
        paymentAttemptId: body.paymentAttemptId, retryPayment: false, recoveryRequired: true })
    }
  }
}
export default createBasePaymentRecoveryHandler()
