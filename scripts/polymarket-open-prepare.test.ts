import assert from 'node:assert/strict'
import test from 'node:test'
import { preparePolymarketOpen, type PrepareOpenDependencies } from '../api/polymarket-open-prepare.js'

const builderCode = `0x${'ab'.repeat(32)}`
const conditionId = `0x${'12'.repeat(32)}`
const wallet = '0x1111111111111111111111111111111111111111'

function input(overrides: Record<string, unknown> = {}) {
  return {
    externalOrderId: 'conviction:open:001',
    marketUrl: 'https://polymarket.com/event/championship-winner',
    outcome: 'Yes',
    maxSpendUsdc: '7',
    wallet,
    orderType: 'FAK',
    ...overrides,
  }
}

function event(markets?: unknown[]) {
  return {
    slug: 'championship-winner',
    markets: markets ?? [{
      id: '501',
      slug: 'will-team-a-win',
      question: 'Will Team A win?',
      conditionId,
      outcomes: '["Yes","No"]',
      clobTokenIds: '["111","222"]',
      active: true,
      closed: false,
      enableOrderBook: true,
      acceptingOrders: true,
    }],
  }
}

function book(tokenId = '111', overrides: Record<string, unknown> = {}) {
  return {
    market: conditionId,
    asset_id: tokenId,
    timestamp: '1800000000000',
    hash: 'book-hash-1',
    bids: [{ price: '0.49', size: '10' }],
    asks: [{ price: '0.60', size: '10' }, { price: '0.50', size: '10' }],
    min_order_size: '1',
    tick_size: '0.01',
    neg_risk: false,
    last_trade_price: '0.50',
    ...overrides,
  }
}

function dependencies(overrides: Partial<PrepareOpenDependencies> = {}): PrepareOpenDependencies {
  return {
    fetchJson: async url => url.includes('/events/slug/') ? event() : book(),
    readWallet: async () => ({
      deployed: true,
      balanceRaw: 20_000_000n,
      allowanceRaw: 10_000_000n,
    }),
    now: () => 1_800_000_000_000,
    builderCode: () => builderCode,
    maxUsdc: () => '25',
    ...overrides,
  }
}

test('resolves a simple intent into a ready local-signing plan', async () => {
  const result = await preparePolymarketOpen(input(), dependencies())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.readyForLocalSigning, true)
  assert.equal(result.data.market.tokenId, '111')
  assert.equal(result.data.market.executionPrice, '0.60')
  assert.equal(result.data.market.executionPriceSource, 'current-asks')
  assert.equal(result.data.market.clobReportedLastTradePrice, '0.50')
  assert.equal(result.data.market.negRisk, false)
  assert.equal(result.data.wallet.signatureType, 3)
  assert.equal(result.data.wallet.collateral.required, '7')
  assert.equal(result.data.signingPlan.client.builderConfig.builderCode, builderCode)
  assert.equal(result.data.signingPlan.createMarketOrder.side, 'BUY')
  assert.equal('builderCode' in result.data.signingPlan.createMarketOrder, false)
  assert.equal(result.data.signingPlan.options.version, 2)
  assert.equal(result.data.checks.clobCredentialsVerified, false)
  assert.deepEqual(result.data.privacy.neverSend, ['private key', 'seed phrase', 'CLOB secret', 'CLOB passphrase'])
})

test('returns choices instead of guessing across multiple markets', async () => {
  let walletRead = false
  const markets = [
    {
      id: '1',
      slug: 'team-a',
      question: 'Will Team A win?',
      conditionId,
      outcomes: '["Yes","No"]',
      clobTokenIds: '["111","112"]',
      active: true,
      closed: false,
      enableOrderBook: true,
    },
    {
      id: '2',
      slug: 'team-b',
      question: 'Will Team B win?',
      conditionId: `0x${'34'.repeat(32)}`,
      outcomes: '["Yes","No"]',
      clobTokenIds: '["221","222"]',
      active: true,
      closed: false,
      enableOrderBook: true,
    },
  ]
  const result = await preparePolymarketOpen(input({ outcome: 'Champion' }), dependencies({
    fetchJson: async url => url.includes('/events/slug/') ? event(markets) : book(),
    readWallet: async () => {
      walletRead = true
      return { deployed: true, balanceRaw: 20_000_000n, allowanceRaw: 20_000_000n }
    },
  }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /will not guess/i)
  assert.equal(result.candidates?.length, 2)
  assert.equal(walletRead, false)
})

test('reports public wallet blockers without asking for credentials', async () => {
  const result = await preparePolymarketOpen(input(), dependencies({
    readWallet: async () => ({
      deployed: false,
      balanceRaw: 2_000_000n,
      allowanceRaw: 0n,
    }),
  }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.readyForLocalSigning, false)
  assert.equal(result.data.checks.walletDeployed, false)
  assert.equal(result.data.checks.balanceSufficient, false)
  assert.equal(result.data.checks.allowanceSufficient, false)
  assert.equal(result.data.wallet.clobCredentials, 'buyer-local-unverified')
  assert.equal(result.data.issues.length, 3)
})

test('fails closed when FOK liquidity or the safety ceiling is insufficient', async () => {
  const noLiquidity = await preparePolymarketOpen(input({ orderType: 'FOK' }), dependencies({
    fetchJson: async url => url.includes('/events/slug/')
      ? event()
      : book('111', { asks: [{ price: '0.50', size: '2' }] }),
  }))
  assert.equal(noLiquidity.ok, false)
  if (!noLiquidity.ok) {
    assert.equal(noLiquidity.status, 409)
    assert.match(noLiquidity.error, /liquidity is insufficient/i)
  }

  const overCap = await preparePolymarketOpen(input({ maxSpendUsdc: '25.000001' }), dependencies())
  assert.equal(overCap.ok, false)
  if (!overCap.ok) {
    assert.equal(overCap.status, 400)
    assert.match(overCap.error, /safety ceiling/i)
  }
})

test('uses current asks instead of a stale last-trade quote and enforces minimum shares', async () => {
  const currentBook = await preparePolymarketOpen(input({ maxSpendUsdc: '1' }), dependencies({
    fetchJson: async url => url.includes('/events/slug/')
      ? event()
      : book('111', {
          asks: [{ price: '0.99', size: '100' }, { price: '0.04', size: '100' }],
          last_trade_price: '0.96',
          min_order_size: '5',
          tick_size: '0.01',
        }),
  }))
  assert.equal(currentBook.ok, true)
  if (currentBook.ok) {
    assert.equal(currentBook.data.market.executionPrice, '0.04')
    assert.equal(currentBook.data.market.clobReportedLastTradePrice, '0.96')
  }

  const belowMinimum = await preparePolymarketOpen(input({ maxSpendUsdc: '1' }), dependencies({
    fetchJson: async url => url.includes('/events/slug/')
      ? event()
      : book('111', {
          asks: [{ price: '0.50', size: '100' }],
          min_order_size: '5',
        }),
  }))
  assert.equal(belowMinimum.ok, false)
  if (!belowMinimum.ok) {
    assert.equal(belowMinimum.status, 409)
    assert.match(belowMinimum.error, /minimum order size/i)
  }
})
