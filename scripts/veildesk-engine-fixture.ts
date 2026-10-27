// Offline integration dependency adapter: real PolyDesk engine, synthetic external inputs.
// This does not represent an accepted OKX job or a live ZeroScout purchase.
import assert from 'node:assert/strict'
import { type SmartTraderDependencies, type SmartTraderMarket } from '../api/polymarket-smart-trader.js'
import { createVeilDeskResearchEngine } from '../api/veildesk-research-engine.js'
import type { VeilDeskResearchInput } from '../api/veildesk-research-service.mjs'

export function createEngineTestService() {
  const now = Date.now(), conditionId = `0x${'12'.repeat(32)}`
  let engineCalls = 0, modelCalls = 0
  const market: SmartTraderMarket = {
    eventSlug: 'fixture-market', marketSlug: 'fixture-market', conditionId,
    question: 'Will Team A win the final?', description: 'Resolves Yes if Team A wins the final.',
    resolutionSource: 'Official competition results', category: 'sports', active: true, closed: false,
    acceptingOrders: true, enableOrderBook: true, endDate: new Date(now + 86400000 * 14).toISOString(),
    liquidityUsd: 50000, volume24hrUsd: 100000, outcomes: ['Yes', 'No'], prices: [0.51, 0.49], tokenIds: ['111', '222'],
  }
  const dependencies: SmartTraderDependencies = {
    searchMarkets: async () => [market], resolveMarket: async () => [market],
    fetchBook: async tokenId => ({asset_id: tokenId, market: conditionId, timestamp: String(now - 1000),
      bids: [{price: '0.50', size: '2000'}], asks: [{price: '0.51', size: '2000'}],
      min_order_size: '5', tick_size: '0.01', last_trade_price: '0.50'}),
    fetchSmartMoney: async () => [], trustedSmartMoneyWallets: () => [], researchReady: async () => {},
    research: async context => {
      modelCalls++
      assert.equal(context.researchOnly, true)
      assert.equal(context.mandate, null)
      return {id: 'synthetic-zeroscout-response', summary: 'Synthetic evidence for integration testing.',
        reasoningSummary: 'No live market or model requests were made.', confidence: 0.68,
        signals: ['Synthetic team update'], riskFlags: ['Synthetic fixture only'], dataGaps: ['Final lineup unknown'],
        proof: {contentHash: '0x' + 'ab'.repeat(32)},
        tradeAssessment: {stance: 'SUPPORT', side: 'BUY', thesis: 'Fixture thesis.', counterThesis: 'Fixture counter-thesis.',
          resolutionRisk: 'Official results control resolution.', evidenceQuality: 'MEDIUM'}}
    },
    sportsNews: async () => [{title: 'Synthetic Team A update', description: 'Offline fixture.', source: 'Fixture',
      url: 'https://example.com/fixture', publishedAt: new Date(now - 3600000).toISOString()}],
    generalNews: async () => [], now: () => now,
    saveDecision: async () => {assert.fail('Research must not persist an executable decision')},
    readDecision: async () => {assert.fail('Research must not consume an executable decision')},
    decisionNonce: () => 'veildesk-integration-fixture',
  }
  const service = createVeilDeskResearchEngine(dependencies)
  return {
    research: async (input: VeilDeskResearchInput) => {
      engineCalls++
      return service(input)
    },
    inspect: () => ({engineCalls, modelCalls, conditionId}),
  }
}
