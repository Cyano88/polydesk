import { polymarketRouteIssue } from './polymarket-route-incidents.js'
import type { Request, Response } from 'express'
import { createPublicClient, formatUnits, getAddress, http, parseUnits } from 'viem'
import { polygon } from 'viem/chains'
import { inspectPolymarketDepositWallet } from './polymarket-deposit-wallet.js'
import { tradeBudget } from './polymarket-trade-budget.js'

const PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' as const
const EXCHANGE = '0xE111180000d2663C0091e4f400237545B87B996B' as const
const NEG_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296' as const
const NEG_EXCHANGE = '0xe2222d279d744050d28e00520010520000310F59' as const
const abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const
type RecordValue = Record<string, any>
export type TradePreflightDependencies = {
  fetchJson: (url: string) => Promise<RecordValue>
  inspectWallet: typeof inspectPolymarketDepositWallet
  readWallet: (wallet: `0x${string}`, spender: `0x${string}`) => Promise<{ balance: bigint; allowance: bigint }>
  now: () => number
}
const defaults: TradePreflightDependencies = {
  fetchJson: async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`)
    return response.json()
  },
  inspectWallet: inspectPolymarketDepositWallet,
  readWallet: async (wallet, spender) => {
    const client = createPublicClient({ chain: polygon, transport: http(process.env.POLYMARKET_RPC_URL || process.env.POLYGON_RPC_URL || undefined) })
    const [balance, allowance] = await Promise.all([
      client.readContract({ address: PUSD, abi, functionName: 'balanceOf', args: [wallet] }),
      client.readContract({ address: PUSD, abi, functionName: 'allowance', args: [wallet, spender] }),
    ])
    return { balance, allowance }
  },
  now: Date.now,
}
export async function preflightPolymarketTrade(input: RecordValue, deps = defaults) {
  const started = deps.now()
  const orderType = String(input.orderType ?? 'FOK')
  if (!['FOK', 'FAK', 'GTC'].includes(orderType)) throw new Error('Unsupported order type; do not change the buyer policy.')
  const postOnly = input.postOnly === true
  if (postOnly && orderType !== 'GTC') throw new Error('Post-only requires GTC.')
  const slug = String(input.marketSlug ?? '')
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) throw new Error('Provide an exact marketSlug.')
  const owner = getAddress(String(input.ownerAddress ?? ''))
  const price = String(input.limitPrice ?? '')
  const cap = String(input.maxTotalUsdc ?? '')
  const [market, wallet] = await Promise.all([
    deps.fetchJson(`https://gamma-api.polymarket.com/markets/slug/${slug}`), deps.inspectWallet(owner),
  ])
  if (market.slug !== slug || market.active !== true || market.closed !== false || market.acceptingOrders !== true) throw new Error('Exact market is not accepting orders.')
  const labels = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes
  const tokens = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : market.clobTokenIds
  if (!Array.isArray(labels) || !Array.isArray(tokens) || labels.length !== tokens.length) throw new Error('Invalid outcome mapping.')
  const matches = labels.map((label, index) => ({ label, token: tokens[index] })).filter(x => String(x.label).toLowerCase() === String(input.outcome).toLowerCase())
  if (matches.length !== 1 || !/^\d+$/.test(String(matches[0].token))) throw new Error('Outcome is not uniquely mapped.')
  const token = String(matches[0].token)
  const [book, fee] = await Promise.all([
    deps.fetchJson(`https://clob.polymarket.com/book?token_id=${token}`),
    deps.fetchJson(`https://clob.polymarket.com/fee-rate?token_id=${token}`),
  ])
  const timestamp = Number(book.timestamp)
  if (book.asset_id !== token || book.market !== market.conditionId || typeof book.neg_risk !== 'boolean' || !Number.isFinite(timestamp) || timestamp > deps.now() + 5_000) throw new Error('Unverified order book.')
  if (market.feesEnabled !== false && (market.feesEnabled !== true || market.feeSchedule?.exponent !== 1 || typeof market.feeSchedule?.rate !== 'number')) throw new Error('Live fee schedule is missing or unsupported.')
  if (typeof fee.base_fee !== 'number') throw new Error('Executor fee reserve unavailable.')
  const budget = tradeBudget({ maxTotal: cap, price, reserveBps: fee.base_fee, feeRate: market.feesEnabled === false ? 0 : market.feeSchedule.rate })
  const tick = Number(book.tick_size)
  if (!(tick > 0) || Math.abs(Number(price) / tick - Math.round(Number(price) / tick)) > 1e-8) throw new Error('Limit price does not match market tick size.')
  const depth = (Array.isArray(book.asks) ? book.asks : []).filter((x: any) => Number(x.price) > 0 && Number(x.price) <= Number(price) && Number(x.size) > 0).reduce((sum: number, x: any) => sum + Number(x.size), 0)
  const spender = book.neg_risk ? NEG_EXCHANGE : EXCHANGE
  const state = wallet.deployed ? await deps.readWallet(wallet.depositWalletAddress as `0x${string}`, spender) : { balance: 0n, allowance: 0n }
  const adapterState = wallet.deployed && book.neg_risk ? await deps.readWallet(wallet.depositWalletAddress as `0x${string}`, NEG_ADAPTER) : null
  const required = parseUnits(budget.requiredBalance, 6)
  const issues: string[] = []
  const routeIssue = polymarketRouteIssue(String(market.conditionId))
  if (adapterState && adapterState.allowance < required) issues.push(routeIssue || 'DEPOSIT_WALLET_ADAPTER_APPROVAL_REQUIRED')
  if (deps.now() - timestamp > 60_000) issues.push('STALE_ORDER_BOOK')
  if (!wallet.deployed) issues.push('DEPOSIT_WALLET_NOT_DEPLOYED')
  if (state.balance < required) issues.push('INSUFFICIENT_COLLATERAL_INCLUDING_RESERVE')
  if (state.allowance < required) issues.push('DEPOSIT_WALLET_EXCHANGE_APPROVAL_REQUIRED')
  if (Number(budget.orderAmount) < 1) issues.push('BELOW_IMMEDIATE_ORDER_FLOOR')
  if (orderType === 'FOK' && depth < Number(budget.shares)) issues.push('INSUFFICIENT_DEPTH_AT_LIMIT')
  if (postOnly && depth > 0) issues.push('POST_ONLY_WOULD_CROSS')
  if (orderType === 'GTC' && (!(Number(book.min_order_size) > 0) || Number(budget.shares) < Number(book.min_order_size))) issues.push('RESTING_ORDER_MINIMUM_NOT_MET')
  if (deps.now() - started > 30_000) issues.push('PREFLIGHT_EXPIRED_DURING_CHECKS')
  return { ok: true, publicChecksPassed: issues.length === 0, issues, checkedAt: new Date(deps.now()).toISOString(), validUntil: new Date(deps.now() + 30_000).toISOString(),
    bookTimestamp: String(book.timestamp), bookAgeMs: deps.now() - timestamp,
    owner: wallet.ownerAddress, wallet: wallet.depositWalletAddress, walletType: 'DEPOSIT_WALLET', collateral: 'pUSD',
    balance: formatUnits(state.balance, 6), allowance: formatUnits(state.allowance, 6), spender,
    shortfall: formatUnits(required > state.balance ? required - state.balance : 0n, 6),
    marketSlug: slug, orderType, postOnly, conditionId: market.conditionId, tokenId: token, outcome: matches[0].label, ...budget,
    adapterAllowance: adapterState ? formatUnits(adapterState.allowance, 6) : null,
    adapterSpender: book.neg_risk ? NEG_ADAPTER : null,
    approvalRoute: 'deposit-wallet-relayer',
    routeConflict: routeIssue && adapterState && adapterState.allowance < required ? 'Provider-required adapter allowance is insufficient. Never grant unlimited allowance without separate explicit consent.' : null, legacyProxyApprovalAllowed: false,
    authenticationVerified: false, signingVerified: false, orderAuthorized: false,
    previewArgs: ['buy', '--market-id', slug, '--outcome', String(matches[0].label), '--amount', budget.orderAmount, '--price', price, '--order-type', orderType, ...(postOnly ? ['--post-only'] : []), '--dry-run'],
    note: 'Read-only collateral and market checks. Verify local authentication, access and signing readiness before confirmation. No signing, wrapping, approval or order was performed.' }
}
export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  try { return res.json(await preflightPolymarketTrade(req.body ?? {})) }
  catch (error) { return res.status(409).json({ ok: false, publicChecksPassed: false, error: error instanceof Error ? error.message : 'Preflight failed.' }) }
}
