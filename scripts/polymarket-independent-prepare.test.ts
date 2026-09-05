import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareIndependentPolymarketTrade } from '../api/polymarket-independent-prepare.js'
import { preparePolymarketOpen, type PrepareOpenDependencies } from '../api/polymarket-open-prepare.js'
import { INDEPENDENT_RESEARCH_POLICY } from '../api/polymarket-independent-policy.js'

const now = 1_800_000_000_000
const owner = '0x1111111111111111111111111111111111111111'
const wallet = '0x2222222222222222222222222222222222222222'
const conditionId = `0x${'12'.repeat(32)}`
function input(overrides: Record<string, unknown> = {}) {
  return { acknowledgeIndependentDecision: true, externalOrderId: 'independent:test:001', ownerAddress: owner,
    wallet, marketUrl: 'https://polymarket.com/event/example-market', outcome: 'Yes', side: 'BUY',
    maxSpendUsdc: '5', maximumPrice: '0.55', orderType: 'FOK', ...overrides }
}
function dependencies(options: { price?: string; timestamp?: string; balance?: bigint; allowance?: bigint; deployed?: boolean; active?: boolean } = {}) {
  const execution: PrepareOpenDependencies = {
    fetchJson: async url => url.includes('/events/slug/') ? { slug: 'example-market', markets: [{
      id: '501', slug: 'example-market', question: 'Example market?', conditionId,
      outcomes: '["Yes","No"]', clobTokenIds: '["111","222"]', active: options.active !== false,
      closed: options.active === false, enableOrderBook: true, acceptingOrders: true,
    }] } : { market: conditionId, asset_id: '111', timestamp: options.timestamp ?? String(now), hash: 'book-hash',
      bids: [{ price: '0.49', size: '100' }], asks: [{ price: options.price ?? '0.50', size: '100' }],
      min_order_size: '1', tick_size: '0.01', neg_risk: false },
    readWallet: async () => ({ deployed: options.deployed !== false, balanceRaw: options.balance ?? 20_000_000n, allowanceRaw: options.allowance ?? 20_000_000n }),
    now: () => now, builderCode: () => `0x${'ab'.repeat(32)}`,
  }
  return {
    inspectWallet: async () => ({ ownerAddress: owner as `0x${string}`, depositWalletAddress: wallet as `0x${string}`, deployed: options.deployed !== false }),
    prepare: (raw: unknown) => preparePolymarketOpen(raw, execution), now: () => now,
  }
}
test('prepares an exact independent BUY without a research service or analysis receipt', async () => {
  const result = await prepareIndependentPolymarketTrade(input(), dependencies())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.mode, INDEPENDENT_RESEARCH_POLICY)
  assert.equal(result.data.zeroScoutApproval, false)
  assert.equal(result.data.orderSubmitted, false)
  assert.equal(result.data.authoritySignatureRequired, true)
  assert.equal(result.data.mandate.researchPolicy, INDEPENDENT_RESEARCH_POLICY)
  assert.equal(result.data.mandate.maximumAmountUsdc, '5')
  assert.equal(result.data.mandate.maximumPrice, '0.55')
  assert.equal(result.data.mandate.allowedSigner, wallet)
  assert.equal(result.data.mandate.authoritySigner, owner)
  assert.deepEqual(result.data.mandate.allowedTokenIds, ['111'])
  assert.match(result.data.disclaimer, /independent decision/)
  assert.match(result.data.authorizationMessage, /Mandate SHA-256/)
})
test('requires explicit acknowledgement and rejects unsupported side, order type, and credentials', async () => {
  for (const changes of [{ acknowledgeIndependentDecision: false }, { acknowledgeIndependentDecision: 'true' }, { side: 'SELL' }, { orderType: 'GTC' }, { privateKey: 'never-accepted' }, { maximumPrice: '1' }, { maxSpendUsdc: '-5' }]) {
    const deps = dependencies()
    deps.inspectWallet = async () => { throw new Error('Must reject before wallet lookup') }
    const result = await prepareIndependentPolymarketTrade(input(changes), deps)
    assert.equal(result.ok, false)
    assert([400, 428].includes(result.status))
  }
})
test('rejects an unrelated wallet instead of preparing for it', async () => {
  const result = await prepareIndependentPolymarketTrade(input({ wallet: owner }), dependencies())
  assert.equal(result.ok, false)
  assert.equal(result.status, 409)
})
test('price, freshness, funding, allowance, deployment and market checks still block', async () => {
  for (const options of [
    { price: '0.60' }, { timestamp: String(now - 31_000) }, { timestamp: String(now + 10_000) },
    { timestamp: '' }, { balance: 0n }, { allowance: 0n }, { deployed: false }, { active: false },
  ]) {
    const result = await prepareIndependentPolymarketTrade(input(), dependencies(options))
    assert.equal(result.ok, false, `Must block ${String(Object.keys(options)[0])}`)
    assert(!('data' in result), 'Blocked requests must not expose a signing plan')
  }
})
