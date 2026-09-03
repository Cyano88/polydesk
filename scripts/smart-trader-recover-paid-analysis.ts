import { mutateDurableJson } from '../api/render-durable-store.js'
import {
  runPolymarketSmartTrader,
  type SmartTraderPaidAnalysisRecord,
} from '../api/polymarket-smart-trader.js'

const transaction = String(process.argv[2] ?? '').trim()
const payer = String(process.argv[3] ?? '').trim()

if (!/^0x[a-fA-F0-9]{64}$/.test(transaction)) throw new Error('A valid settlement transaction is required.')
if (!/^0x[a-fA-F0-9]{40}$/.test(payer)) throw new Error('A valid payer is required.')

const tokenAddress = '0x779ded0c9e1022225f8e0630b35a9b54be713736'
const payTo = String(process.env.OKX_X402_PAY_TO ?? process.env.OKX_X402_SELLER_ADDRESS ?? '').trim().toLowerCase()
if (!/^0x[a-f0-9]{40}$/.test(payTo)) throw new Error('The configured x402 recipient is unavailable.')

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(String(process.env.XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error(`X Layer RPC returned HTTP ${response.status}.`)
  const payload = await response.json() as { result?: Record<string, unknown>; error?: unknown }
  if (!payload.result || payload.error) throw new Error('X Layer RPC did not return the settlement transaction.')
  return payload.result
}

const [tx, receipt] = await Promise.all([
  rpc('eth_getTransactionByHash', [transaction]),
  rpc('eth_getTransactionReceipt', [transaction]),
])
if (String(receipt.status).toLowerCase() !== '0x1') throw new Error('The settlement transaction did not succeed.')
if (String(tx.to).toLowerCase() !== tokenAddress) throw new Error('The settlement token does not match X Layer USDT.')
const calldata = String(tx.input ?? '')
if (!/^0xe3ee160e[0-9a-f]+$/i.test(calldata)) throw new Error('The settlement is not an EIP-3009 authorization transfer.')
const encoded = calldata.slice(10)
const words = Array.from({ length: 9 }, (_, index) => encoded.slice(index * 64, (index + 1) * 64))
const recoveredPayer = `0x${words[0].slice(24)}`.toLowerCase()
const recoveredPayTo = `0x${words[1].slice(24)}`.toLowerCase()
const recoveredAmount = BigInt(`0x${words[2]}`)
if (recoveredPayer !== payer.toLowerCase()) throw new Error('The settlement payer does not match.')
if (recoveredPayTo !== payTo) throw new Error('The settlement recipient does not match.')
if (recoveredAmount !== 300_000n) throw new Error('The settlement amount is not 0.3 USDT.')

const analysisKey = `polydesk:smart-trader:paid-analysis:${transaction.toLowerCase()}`
const claimed = await mutateDurableJson<SmartTraderPaidAnalysisRecord>(analysisKey, current => {
  if (!current || current.schema !== 'polydesk-smart-trader-paid-analysis-v1') {
    throw new Error('No exact persisted request exists for this settlement transaction. Recovery is refused.')
  }
  if (current.payment.transaction.toLowerCase() !== transaction.toLowerCase()
    || current.payment.payer.toLowerCase() !== payer.toLowerCase()
    || current.payment.amountAtomic !== '300000') {
    throw new Error('The persisted payment metadata does not match the verified settlement.')
  }
  if (current.status === 'completed') throw new Error('This settlement transaction has already been delivered.')
  const updatedAt = Date.parse(current.updatedAt)
  if (current.status === 'running' && Number.isFinite(updatedAt) && Date.now() - updatedAt < 10 * 60_000) {
    throw new Error('Recovery is already running for this settlement transaction.')
  }
  return { ...current, status: 'running', updatedAt: new Date().toISOString(), error: undefined }
})

let result: Awaited<ReturnType<typeof runPolymarketSmartTrader>>
try {
  result = await runPolymarketSmartTrader(claimed.request, undefined, claimed.payment)
} catch (error) {
  await mutateDurableJson<SmartTraderPaidAnalysisRecord>(analysisKey, current => ({
    ...(current || claimed),
    status: 'failed',
    updatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : 'Recovery failed.',
  }))
  throw error
}

await mutateDurableJson<SmartTraderPaidAnalysisRecord>(analysisKey, current => ({
  ...(current || claimed),
  status: result.ok ? 'completed' : 'failed',
  updatedAt: new Date().toISOString(),
  ...(result.ok ? {
    decisionId: result.data.decision.decisionId,
    analysisHash: result.data.decision.analysisHash,
    response: result.data,
    error: undefined,
  } : {
    error: result.error,
  }),
}))
console.log(JSON.stringify(result))
if (!result.ok) process.exitCode = 1
