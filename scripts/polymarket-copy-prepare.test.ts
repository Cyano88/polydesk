import assert from 'node:assert/strict'
import test from 'node:test'
import { getAddress } from 'viem'
import { preparePolymarketCopy, type CopyPrepareDependencies } from '../api/polymarket-copy-prepare.js'
import { rankCopyPositionCandidates } from '../api/polymarket-copy-ranking.js'

const watchedWallet = getAddress('0x1111111111111111111111111111111111111111')
const ownerAddress = getAddress('0x2222222222222222222222222222222222222222')
const depositWallet = getAddress('0x3333333333333333333333333333333333333333')
const transactionHash = `0x${'ab'.repeat(32)}`
const conditionId = `0x${'12'.repeat(32)}`
const now = 1_800_000_000_000

function request(overrides: Record<string, unknown> = {}) {
  return {
    watchedWallet,
    ownerAddress,
    transactionHash,
    tokenId: '111',
    maxSpendUsdc: '5',
    orderType: 'FAK',
    ...overrides,
  }
}

function dependencies(overrides: Partial<CopyPrepareDependencies> = {}): CopyPrepareDependencies {
  return {
    fetchActivity: async () => [{
      proxyWallet: watchedWallet,
      timestamp: now / 1000 - 30,
      conditionId,
      type: 'TRADE',
      transactionHash,
      asset: '111',
      side: 'BUY',
      price: 0.42,
      size: 10,
      usdcSize: 4.2,
      title: 'Will Team A win?',
      eventSlug: 'championship-winner',
      outcome: 'Yes',
    }],
    fetchPositions: async () => [{
      proxyWallet: watchedWallet,
      asset: '111',
      conditionId,
      size: 100,
      avgPrice: 0.4,
      currentValue: 50,
      cashPnl: 10,
      percentPnl: 25,
      curPrice: 0.5,
      redeemable: false,
      title: 'Will Team A win?',
      eventSlug: 'championship-winner',
      outcome: 'Yes',
      endDate: new Date(now + 14 * 24 * 60 * 60_000).toISOString(),
      negativeRisk: false,
    }],
    fetchEventMarkets: async () => [{
      conditionId,
      active: true,
      closed: false,
      enableOrderBook: true,
      acceptingOrders: true,
      endDate: new Date(now + 14 * 24 * 60 * 60_000).toISOString(),
    }],
    fetchBook: async () => ({
      market: conditionId,
      asset_id: '111',
      timestamp: String(now - 1_000),
      bids: [{ price: '0.48', size: '100' }],
      asks: [{ price: '0.50', size: '100' }],
      min_order_size: '5',
      tick_size: '0.01',
      neg_risk: false,
    }),
    inspectWallet: async () => ({
      ownerAddress,
      depositWalletAddress: depositWallet,
      deployed: true,
    }),
    prepareOpen: async input => ({
      ok: true,
      status: 200,
      data: {
        ok: true,
        externalOrderId: String((input as Record<string, unknown>).externalOrderId),
        readyForLocalSigning: true,
        market: { executionPrice: '0.50' },
        wallet: { address: (input as Record<string, unknown>).wallet },
      },
    }) as any,
    now: () => now,
    ...overrides,
  }
}

test('turns an exact watched BUY into a buyer-derived signing plan', async () => {
  const result = await preparePolymarketCopy(request(), dependencies())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.flow, 'watch-select-verify-fund-govern-sign-buy')
  assert.equal(result.data.selection.mode, 'TRADE')
  assert.equal(result.data.sourceSignal.transactionHash, transactionHash)
  assert.equal(result.data.sourceSignal.trustedForSizing, false)
  assert.equal(result.data.buyerAccount.depositWalletAddress, depositWallet)
  assert.equal(result.data.buyerAccount.derivedMatchVerified, true)
  assert.equal(result.data.wallet.address, depositWallet)
  assert.match(String(result.data.externalOrderId), /^copy:[a-f0-9]{32}$/)
})

test('rejects a wallet that does not derive from the buyer owner EOA', async () => {
  const result = await preparePolymarketCopy(
    request({ polymarketWallet: '0x4444444444444444444444444444444444444444' }),
    dependencies(),
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /does not match/i)
})

test('requires an exact token when one transaction contains multiple BUY activities', async () => {
  const deps = dependencies({
    fetchActivity: async () => [
      ...(await dependencies().fetchActivity(watchedWallet)),
      {
        proxyWallet: watchedWallet,
        timestamp: now / 1000 - 30,
        type: 'TRADE',
        transactionHash,
        asset: '222',
        side: 'BUY',
        eventSlug: 'championship-winner',
        outcome: 'No',
      },
    ],
  })
  const result = await preparePolymarketCopy(request({ tokenId: undefined }), deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.deepEqual(result.tokenIds, ['111', '222'])
})

test('blocks stale signals instead of copying an old position blindly', async () => {
  const result = await preparePolymarketCopy(request(), dependencies({
    fetchActivity: async () => [{
      proxyWallet: watchedWallet,
      timestamp: now / 1000 - 3600,
      conditionId,
      type: 'TRADE',
      transactionHash,
      asset: '111',
      side: 'BUY',
      eventSlug: 'championship-winner',
      outcome: 'Yes',
    }],
  }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /exceeds/i)
})

test('returns activation_required before preparing an order for an undeployed wallet', async () => {
  let prepareCalls = 0
  const result = await preparePolymarketCopy(request(), dependencies({
    inspectWallet: async () => ({
      ownerAddress,
      depositWalletAddress: depositWallet,
      deployed: false,
    }),
    prepareOpen: async () => {
      prepareCalls += 1
      throw new Error('must not prepare')
    },
  }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.equal(result.nextAction, 'SETUP_DEPOSIT_WALLET')
  assert.equal(prepareCalls, 0)
})

test('rejects a caller-supplied external ID that is not bound to the exact copy source', async () => {
  const result = await preparePolymarketCopy(request({
    externalOrderId: 'caller:unbound:copy',
  }), dependencies())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /canonical source-bound/i)
  assert.match(String(result.canonicalExternalOrderId), /^copy:[a-f0-9]{32}$/)
})

test('prepares an explicitly selected existing position without requiring a transaction hash', async () => {
  const result = await preparePolymarketCopy(request({
    selectionMode: 'POSITION',
    transactionHash: undefined,
    conditionId,
  }), dependencies())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.selection.mode, 'POSITION')
  assert.equal(result.data.sourceSignal.type, 'existing-open-position')
  assert.equal(result.data.sourceSignal.tokenId, '111')
  assert.equal(result.data.sourceSignal.trustedForSizing, false)
})

test('AUTO_BEST_FIT ranks only positions that pass an explicit execution policy', async () => {
  const secondCondition = `0x${'34'.repeat(32)}`
  const result = await preparePolymarketCopy(request({
    selectionMode: 'AUTO_BEST_FIT',
    transactionHash: undefined,
    tokenId: undefined,
    selectionPolicy: {
      maximumPrice: 0.7,
      maximumSpread: 0.05,
      minimumDepthUsdc: 5,
      minimumHoursToResolution: 24,
      maximumBookAgeSeconds: 30,
    },
  }), dependencies({
    fetchPositions: async () => [
      ...(await dependencies().fetchPositions(watchedWallet)),
      {
        proxyWallet: watchedWallet,
        asset: '222',
        conditionId: secondCondition,
        size: 100,
        avgPrice: 0.8,
        currentValue: 100,
        cashPnl: 5,
        percentPnl: 5,
        curPrice: 0.9,
        redeemable: false,
        title: 'Will Team B win?',
        eventSlug: 'team-b-winner',
        outcome: 'Yes',
        endDate: new Date(now + 14 * 24 * 60 * 60_000).toISOString(),
        negativeRisk: false,
      },
    ],
    fetchEventMarkets: async eventSlug => [{
      conditionId: eventSlug === 'team-b-winner' ? secondCondition : conditionId,
      active: true,
      closed: false,
      enableOrderBook: true,
      acceptingOrders: true,
      endDate: new Date(now + 14 * 24 * 60 * 60_000).toISOString(),
    }],
    fetchBook: async candidateToken => candidateToken === '222'
      ? {
          market: secondCondition,
          asset_id: '222',
          timestamp: String(now - 1_000),
          bids: [{ price: '0.70', size: '100' }],
          asks: [{ price: '0.90', size: '100' }],
          min_order_size: '5',
          tick_size: '0.01',
        }
      : dependencies().fetchBook('111'),
  }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.selection.mode, 'AUTO_BEST_FIT')
  assert.equal(result.data.sourceSignal.tokenId, '111')
  assert.equal(result.data.rankedCandidates[0].eligible, true)
  assert.equal(result.data.rankedCandidates[0].market.tokenId, '111')
  assert.equal(result.data.rankedCandidates[1].eligible, false)
  assert.match(result.data.rankedCandidates[1].blockers.join(' '), /maximumPrice|Spread/i)
})

test('AUTO_BEST_FIT fails closed without an explicit selection policy', async () => {
  const result = await preparePolymarketCopy(request({
    selectionMode: 'AUTO_BEST_FIT',
    transactionHash: undefined,
    tokenId: undefined,
  }), dependencies())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 400)
  assert.match(result.error, /selectionPolicy/i)
})

test('analysisOnly ranks public positions without requiring or inspecting a buyer wallet', async () => {
  let inspectCalls = 0
  const result = await preparePolymarketCopy(request({
    selectionMode: 'AUTO_BEST_FIT',
    transactionHash: undefined,
    tokenId: undefined,
    ownerAddress: undefined,
    analysisOnly: true,
    selectionPolicy: {
      maximumPrice: 0.7,
      maximumSpread: 0.05,
      minimumDepthUsdc: 5,
      minimumHoursToResolution: 24,
      maximumBookAgeSeconds: 30,
    },
  }), dependencies({
    inspectWallet: async () => {
      inspectCalls += 1
      throw new Error('must not inspect')
    },
  }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.flow, 'watch-select-analysis')
  assert.equal(result.data.decision, 'ESCALATE')
  assert.equal(result.data.sourceSignal.tokenId, '111')
  assert.equal(inspectCalls, 0)
})

test('ranking blocks closed markets and stale books even when the position snapshot looks profitable', () => {
  const ranked = rankCopyPositionCandidates([{
    position: {
      proxyWallet: watchedWallet,
      asset: '111',
      conditionId,
      size: 100,
      avgPrice: 0.2,
      currentValue: 80,
      cashPnl: 60,
      percentPnl: 300,
      curPrice: 0.8,
      redeemable: false,
      title: 'Closed market',
      eventSlug: 'closed-market',
      outcome: 'Yes',
      endDate: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
      negativeRisk: false,
    },
    market: {
      conditionId,
      active: false,
      closed: true,
      enableOrderBook: true,
      acceptingOrders: false,
      endDate: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
    },
    book: {
      market: conditionId,
      asset_id: '111',
      timestamp: String(now - 120_000),
      bids: [{ price: '0.49', size: '100' }],
      asks: [{ price: '0.50', size: '100' }],
    },
  }], {
    maximumPrice: 0.7,
    maximumSpread: 0.05,
    minimumDepthUsdc: 5,
    minimumHoursToResolution: 24,
    maximumBookAgeSeconds: 30,
  }, 5, now)
  assert.equal(ranked[0].eligible, false)
  assert.equal(ranked[0].rank, null)
  assert.match(ranked[0].blockers.join(' '), /not active|fresh timestamp/i)
})
