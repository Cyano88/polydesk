import assert from 'node:assert/strict'
import test from 'node:test'
import { tradeBudget } from '../api/polymarket-trade-budget.js'
import { preflightPolymarketTrade, type TradePreflightDependencies } from '../api/polymarket-trade-preflight.js'
const owner = '0x1111111111111111111111111111111111111111'
const wallet = '0x2222222222222222222222222222222222222222'
const condition = `0x${'12'.repeat(32)}`
const now = 1_800_000_000_000
const input = { ownerAddress: owner, marketSlug: 'united', outcome: 'Yes', maxTotalUsdc: '4', limitPrice: '0.31' }
function deps(balance = 5_025_010n, allowance = 100_000_000n): TradePreflightDependencies {
 return { now: () => now, inspectWallet: async () => ({ ownerAddress: owner, depositWalletAddress: wallet, deployed: true } as any),
 readWallet: async (_, spender) => { assert.equal(spender.toLowerCase(), '0xe2222d279d744050d28e00520010520000310f59'); return { balance, allowance } },
 fetchJson: async url => url.includes('gamma-api') ? { slug: 'united', active: true, closed: false, acceptingOrders: true, conditionId: condition, outcomes: '["Yes","No"]', clobTokenIds: '["111","222"]', feesEnabled: true, feeSchedule: { rate: 0.05, exponent: 1 } }
 : url.includes('fee-rate') ? { base_fee: 1000 } : { asset_id: '111', market: condition, timestamp: String(now), neg_risk: true, tick_size: '0.01', asks: [{ price: '0.31', size: '100' }] } }
}
test('reproduces plugin reserve and sizes within the all-in buyer cap', () => {
 const four = tradeBudget({ maxTotal: '4', price: '0.31', reserveBps: 1000, feeRate: 0.05 })
 assert.equal(four.shares, '11'); assert.equal(four.orderAmount, '3.41'); assert.equal(four.requiredBalance, '3.751')
 const five = tradeBudget({ maxTotal: '5', price: '0.31', reserveBps: 1000, feeRate: 0.05 })
 assert.equal(five.shares, '14'); assert.equal(five.requiredBalance, '4.774')
})
test('uses ceiling reserve and rejects malformed fee, cap and price inputs', () => {
 for (const change of [{ reserveBps: NaN }, { reserveBps: -1 }, { feeRate: NaN }, { maxTotal: '0' }, { price: '1' }, { maxTotal: '1e3' }]) {
 assert.throws(() => tradeBudget({ maxTotal: '4', price: '0.31', reserveBps: 1000, feeRate: 0.05, ...change })) }
})
test('checks derived wallet and exchange only without claiming signing readiness', async () => {
 const result = await preflightPolymarketTrade(input, deps())
 assert.equal(result.publicChecksPassed, true); assert.equal(result.wallet, wallet)
 assert.equal(result.signingVerified, false); assert.equal(result.orderAuthorized, false)
 assert.equal(result.requiredBalance, '3.751'); assert.equal(result.legacyProxyApprovalAllowed, false)
})
test('blocks balance which covers notional but not the executor reserve', async () => {
 const result = await preflightPolymarketTrade(input, deps(3_500_000n))
 assert.equal(result.publicChecksPassed, false)
 assert.ok(result.issues.includes('INSUFFICIENT_COLLATERAL_INCLUDING_RESERVE')); assert.equal(result.shortfall, '0.251')
})
test('reports approval-required before any signing', async () => {
 const result = await preflightPolymarketTrade(input, deps(5_000_000n, 0n))
 assert.ok(result.issues.includes('DEPOSIT_WALLET_EXCHANGE_APPROVAL_REQUIRED'))
})
test('fails closed on missing fees, stale book, mismatched token and RPC errors', async () => {
 for (const mode of ['fee', 'stale', 'token', 'rpc']) {
 const d = deps(), original = d.fetchJson
 d.fetchJson = async url => { const value = await original(url); if (url.includes('fee-rate') && mode === 'fee') return {}; if (url.includes('/book?') && mode === 'stale') value.timestamp = String(now - 61_000); if (url.includes('/book?') && mode === 'token') value.asset_id = '999'; return value }
 if (mode === 'rpc') d.readWallet = async () => { throw new Error('RPC unavailable') }
 if (mode === 'stale') { const result = await preflightPolymarketTrade(input, d); assert.equal(result.publicChecksPassed, false); assert.ok(result.issues.includes('STALE_ORDER_BOOK')); assert.equal(result.balance, '5.02501') }
 else await assert.rejects(preflightPolymarketTrade(input, d)) }
})

test('preserves order policy and blocks crossing post-only or insufficient FOK depth', async () => {
 const post = await preflightPolymarketTrade({ ...input, orderType: 'GTC', postOnly: true }, deps())
 assert.ok(post.issues.includes('POST_ONLY_WOULD_CROSS'))
 assert.ok(post.previewArgs.includes('--post-only'))
 const d = deps(), original = d.fetchJson
 d.fetchJson = async url => { const value = await original(url); if (url.includes('/book?')) value.asks = [{ price: '0.32', size: '100' }]; return value }
 const result = await preflightPolymarketTrade(input, d)
 assert.ok(result.issues.includes('INSUFFICIENT_DEPTH_AT_LIMIT'))
 await assert.rejects(preflightPolymarketTrade({ ...input, orderType: 'GTD' }, deps()))
})
