import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSettledSmartTraderAnalysisRecord,
  deriveResolutionSource,
  hasMissingZeroScoutProofDelivery,
  isRemediableMissingZeroScoutProof,
  normalizeMarket,
  preflightPolymarketSmartTraderProviders,
  preflightPolymarketSmartTraderRequest,
  runBoundedSmartTraderDelivery,
  runPolymarketSmartTrader,
  type SmartTraderDependencies,
  type SmartTraderDecisionReceipt,
  type SmartTraderMarket,
  type SmartTraderServicePayment,
} from '../api/polymarket-smart-trader.js'

const now = Date.parse('2026-09-01T10:00:00.000Z')
const conditionId = `0x${'12'.repeat(32)}`
const smartWallet = '0x1111111111111111111111111111111111111111'
const servicePayment: SmartTraderServicePayment = {
  provider: 'OKX Agent Payments Protocol',
  transaction: `0x${'cd'.repeat(32)}`,
  payer: smartWallet,
  amountAtomic: '300000',
  network: 'X Layer',
  serviceUrl: '/api/a2mcp/polymarket-smart-trader',
}

test('settled ANALYZE recovery record preserves the exact normalized mandate', () => {
  const paid = buildSettledSmartTraderAnalysisRecord({
    action: 'ANALYZE',
    marketId: conditionId,
    outcome: 'Yes',
    side: 'BUY',
    mandate: {
      maximumSpendUsdc: 5,
      maximumPrice: 0.6,
      maximumPriceDrift: 0.02,
    },
  }, servicePayment, now)
  const differentMandate = buildSettledSmartTraderAnalysisRecord({
    action: 'ANALYZE',
    marketId: conditionId,
    outcome: 'Yes',
    side: 'BUY',
    mandate: {
      maximumSpendUsdc: 10,
      maximumPrice: 0.6,
      maximumPriceDrift: 0.02,
    },
  }, servicePayment, now)

  assert.equal(paid.request.mandate.maximumSpendUsdc, 5)
  assert.equal(paid.request.mandate.maximumPrice, 0.6)
  assert.equal(paid.payment.transaction, servicePayment.transaction)
  assert.notEqual(paid.requestHash, differentMandate.requestHash)
})

test('settled ANALYZE accepts the object parameter encoding emitted by the payment CLI', () => {
  const paid = buildSettledSmartTraderAnalysisRecord({
    action: 'ANALYZE',
    marketId: conditionId,
    outcome: 'Yes',
    side: 'BUY',
    mandate: '{maximumPrice:0.95,maximumSpendUsdc:5,maximumPriceDrift:0.05}',
  }, servicePayment, now)

  assert.equal(paid.request.mandate.maximumSpendUsdc, 5)
  assert.equal(paid.request.mandate.maximumPrice, 0.95)
  assert.equal(paid.request.mandate.maximumPriceDrift, 0.05)
})

test('only a completed missing-ZeroScout-proof delivery is eligible for one remediation', () => {
  const paid = buildSettledSmartTraderAnalysisRecord({
    action: 'ANALYZE',
    marketId: conditionId,
    outcome: 'Yes',
    side: 'BUY',
  }, servicePayment, now)
  const missingProof = {
    ...paid,
    status: 'completed' as const,
    response: {
      action: 'ANALYZE',
      decision: {
        decision: 'ESCALATE',
        evidence: { zeroScoutId: null, zeroScoutProof: null },
        blockers: ['ZeroScout research evidence is required before this decision can be approved.'],
        riskFlags: ['ZeroScout research was unavailable; directional opinion is withheld.'],
      },
    },
  }

  assert.equal(isRemediableMissingZeroScoutProof(missingProof), true)
  assert.equal(hasMissingZeroScoutProofDelivery(missingProof.response), true)
  assert.equal(isRemediableMissingZeroScoutProof({ ...missingProof, deliveryAttemptCount: 3 }), true)
  assert.equal(isRemediableMissingZeroScoutProof({ ...missingProof, deliveryAttemptCount: 4 }), false)
  assert.equal(isRemediableMissingZeroScoutProof({
    ...missingProof,
    response: {
      action: 'ANALYZE',
      decision: {
        decision: 'APPROVE',
        evidence: { zeroScoutId: 'zs_1', zeroScoutProof: { proof: true } },
        blockers: [],
        riskFlags: [],
      },
    },
  }), false)
})

test('bounded paid delivery retries missing proof and stops on proof-bearing success', async () => {
  const attempts: number[] = []
  const missing = {
    ok: true as const,
    status: 200,
    data: {
      action: 'ANALYZE' as const,
      decision: {
        decision: 'ESCALATE',
        evidence: { zeroScoutId: null, zeroScoutProof: null },
        blockers: ['ZeroScout research evidence is required for an approved decision.'],
        riskFlags: ['ZeroScout research was unavailable; directional opinion is withheld.'],
      },
    },
  } as Awaited<ReturnType<typeof runPolymarketSmartTrader>>
  const complete = {
    ok: true as const,
    status: 200,
    data: {
      action: 'ANALYZE' as const,
      decision: {
        decision: 'APPROVE',
        evidence: { zeroScoutId: 'zs_1', zeroScoutProof: { contentHash: 'abc' } },
        blockers: [],
        riskFlags: [],
      },
    },
  } as Awaited<ReturnType<typeof runPolymarketSmartTrader>>
  const queue = [missing, complete]

  const delivery = await runBoundedSmartTraderDelivery({
    initialAttemptCount: 1,
    maximumAttempts: 4,
    run: async () => queue.shift() || complete,
    onAttempt: async state => { attempts.push(state.attemptCount) },
    retryDelayMs: 0,
    sleep: async () => undefined,
  })

  assert.deepEqual(attempts, [2, 3])
  assert.equal(delivery.attemptCount, 3)
  assert.equal(delivery.result, complete)
})

test('Gamma market normalization preserves complete rules and derives the named resolution authority', () => {
  const rules = `${'Rule context. '.repeat(110)}The resolution source for this market is the FOMC statement at https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm. Final fallback rules remain authoritative.`
  const normalized = normalizeMarket({
    question: 'Will rates remain unchanged?',
    conditionId,
    slug: 'fed-decision',
    description: rules,
    outcomes: ['Yes', 'No'],
    clobTokenIds: ['111', '222'],
    active: true,
    closed: false,
    acceptingOrders: true,
    enableOrderBook: true,
  }, { slug: 'fed-decision-event' })
  assert.ok(normalized)
  assert.equal(normalized.description, rules)
  assert.equal(normalized.resolutionSource, 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm')
  assert.equal(deriveResolutionSource('No authority URL is named.'), '')
})

function market(overrides: Partial<SmartTraderMarket> = {}): SmartTraderMarket {
  return {
    eventSlug: 'will-team-a-win-the-final',
    marketSlug: 'team-a-winner',
    conditionId,
    question: 'Will Team A win the final?',
    description: 'Resolves Yes if Team A wins the final.',
    resolutionSource: 'Official competition results',
    category: 'sports',
    active: true,
    closed: false,
    acceptingOrders: true,
    enableOrderBook: true,
    endDate: new Date(now + 14 * 24 * 60 * 60_000).toISOString(),
    liquidityUsd: 50_000,
    volume24hrUsd: 100_000,
    outcomes: ['Yes', 'No'],
    prices: [0.51, 0.49],
    tokenIds: ['111', '222'],
    ...overrides,
  }
}

function dependencies(overrides: Partial<SmartTraderDependencies> = {}): SmartTraderDependencies {
  const decisions = new Map<string, SmartTraderDecisionReceipt>()
  return {
    searchMarkets: async () => [market()],
    resolveMarket: async () => [market()],
    fetchBook: async tokenId => ({
      asset_id: tokenId,
      market: conditionId,
      timestamp: String(now - 1_000),
      bids: [{ price: tokenId === '111' ? '0.50' : '0.48', size: '2000' }],
      asks: [{ price: tokenId === '111' ? '0.51' : '0.49', size: '2000' }],
      min_order_size: '5',
      tick_size: '0.01',
      last_trade_price: tokenId === '111' ? '0.50' : '0.49',
    }),
    fetchSmartMoney: async () => [{
      wallet: smartWallet,
      conditionId,
      tokenId: '111',
      side: 'BUY',
      sizeUsdc: 1_000,
      timestampMs: now - 60_000,
      transactionHash: `0x${'ab'.repeat(32)}`,
    }],
    trustedSmartMoneyWallets: () => [smartWallet],
    researchReady: async () => undefined,
    research: async () => ({
      id: 'zs-smart-1',
      summary: 'Team A has supporting evidence, but the market remains uncertain.',
      reasoningSummary: 'Official results and current team reporting were compared.',
      confidence: 0.68,
      signals: ['Recent verified team update'],
      riskFlags: ['Lineup may change'],
      dataGaps: ['Final lineup unavailable'],
      proof: { contentHash: '0xproof' },
      tradeAssessment: {
        stance: 'SUPPORT',
        side: 'BUY',
        thesis: 'The supplied evidence supports the requested BUY.',
        counterThesis: 'The lineup can still change.',
        resolutionRisk: 'Official competition results control resolution.',
        evidenceQuality: 'MEDIUM',
      },
    }),
    sportsNews: async () => [{
      title: 'Team A prepares for final',
      description: 'Latest team update.',
      source: 'Sportmonks',
      url: 'https://example.com/team-a',
      publishedAt: new Date(now - 3_600_000).toISOString(),
    }],
    generalNews: async () => [],
    now: () => now,
    saveDecision: async decision => { decisions.set(decision.decisionId, decision) },
    readDecision: async decisionId => decisions.get(decisionId) || null,
    decisionNonce: () => 'test-decision-nonce',
    ...overrides,
  }
}

async function analyzeForBuy(deps: SmartTraderDependencies, extra: Record<string, unknown> = {}) {
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    ...extra,
  }, deps, servicePayment)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error(result.error)
  return result.data.decision
}

test('DISCOVER ranks eligible outcomes and only applies smart-money tag with observed wallet evidence', async () => {
  const result = await runPolymarketSmartTrader({
    action: 'DISCOVER',
    category: 'sports',
    smartMoneyWallets: [smartWallet],
  }, dependencies())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.scoreLabel, 'risk-adjusted-opportunity-screening-not-profit-forecast')
  assert.equal(result.data.opportunities[0].outcome.label, 'Yes')
  assert.deepEqual(result.data.opportunities[0].tags, ['smart-money-observed'])
  assert.equal(result.data.opportunities[0].smartMoney.matchingBuyerCount, 1)
  assert.match(result.data.boundary, /not a profit forecast/i)
})

test('DISCOVER does not invent a smart-money tag when no wallet source is configured', async () => {
  const result = await runPolymarketSmartTrader({ action: 'DISCOVER', query: 'Team A' }, dependencies({
    fetchSmartMoney: async () => { throw new Error('must not be called') },
    trustedSmartMoneyWallets: () => [],
  }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.data.opportunities[0].tags, [])
  assert.equal(result.data.opportunities[0].smartMoney.status, 'unconfigured')
  assert.match(result.data.opportunities[0].riskFlags.join(' '), /No smart-money wallet set/i)
})

test('caller-supplied public wallets cannot self-assign the trusted smart-money tag', async () => {
  const result = await runPolymarketSmartTrader({
    action: 'DISCOVER',
    query: 'Team A',
    smartMoneyWallets: [smartWallet],
  }, dependencies({ trustedSmartMoneyWallets: () => [] }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.data.opportunities[0].tags, ['public-wallet-signal-observed'])
  assert.equal(result.data.opportunities[0].scoreComponents.smartMoney, 0)
  assert.equal(result.data.smartMoneySources[0].provenance, 'caller-supplied')
})

test('ANALYZE joins exact market data, sports news, and ZeroScout evidence without claiming certainty', async () => {
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketUrl: 'https://polymarket.com/event/will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    category: 'sports',
    smartMoneyWallets: [smartWallet],
  }, dependencies(), servicePayment)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.selected.outcome.tokenId, '111')
  assert.equal(result.data.evidence.news.length, 1)
  assert.equal(result.data.evidence.zeroScout?.id, 'zs-smart-1')
  assert.match(result.data.opinion, /remains uncertain/i)
  assert.match(result.data.boundary, /not a guarantee/i)
  assert.equal(result.data.decision.decision, 'APPROVE')
  assert.match(result.data.decision.decisionId, /^pstd_/)
  assert.deepEqual(result.data.decision.servicePayment, servicePayment)
})

test('ANALYZE can discover by query inside the single paid workflow', async () => {
  let searchCalls = 0
  const deps = dependencies({
    searchMarkets: async query => {
      searchCalls += 1
      assert.equal(query, 'Team A final')
      return [market()]
    },
    resolveMarket: async () => { throw new Error('exact resolver must not run') },
  })
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    query: 'Team A final',
    outcome: 'Yes',
    side: 'BUY',
  }, deps, servicePayment)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(searchCalls, 1)
  assert.equal(result.data.decision.decision, 'APPROVE')
})

test('ANALYZE provider preflight rejects an empty exact lookup before payment', async () => {
  const result = await preflightPolymarketSmartTraderProviders({
    action: 'ANALYZE',
    marketId: 'missing-market',
  }, dependencies({ resolveMarket: async () => [] }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 404)
  assert.match(result.error, /No active Polymarket market matched/i)
})

test('ANALYZE provider preflight rejects an outcome shared by multiple discovered markets before payment', async () => {
  const result = await preflightPolymarketSmartTraderProviders({
    action: 'ANALYZE',
    category: 'sports',
    outcome: 'Yes',
    side: 'BUY',
  }, dependencies({
    searchMarkets: async () => [
      market(),
      market({
        conditionId: `0x${'34'.repeat(32)}`,
        eventSlug: 'will-team-b-win-the-final',
        marketSlug: 'team-b-winner',
        question: 'Will Team B win the final?',
        tokenIds: ['333', '444'],
      }),
    ],
  }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /maps to 2 active markets/i)
  assert.match(result.error, /exact marketId before payment/i)
})

test('ANALYZE provider preflight rejects unavailable ZeroScout authorization before payment', async () => {
  const result = await preflightPolymarketSmartTraderProviders({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
  }, dependencies({
    researchReady: async () => {
      const error = new Error('Unauthorized integration request.') as Error & { status?: number }
      error.status = 401
      throw error
    },
  }))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 502)
  assert.match(result.error, /Unauthorized integration request/i)
})

test('ANALYZE provider preflight rejects missing category evidence before payment', async () => {
  let researchReadyCalls = 0
  const result = await preflightPolymarketSmartTraderProviders({
    action: 'ANALYZE',
    marketId: 'fed-september-decision',
    outcome: 'Yes',
    side: 'BUY',
  }, dependencies({
    resolveMarket: async () => [market({
      eventSlug: 'fed-september-decision',
      marketSlug: 'fed-september-decision',
      question: 'Will the Fed increase interest rates after the September meeting?',
      category: 'economics',
    })],
    researchReady: async () => { researchReadyCalls += 1 },
    sportsNews: async () => { throw new Error('sports lane must not run') },
    generalNews: async () => [],
  }))
  assert.equal(researchReadyCalls, 1)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 503)
  assert.match(result.error, /No current general news evidence/i)
  assert.match(result.error, /before charging/i)
})

test('ANALYZE cannot approve without the settled 0.3 USDT workflow payment', async () => {
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
  }, dependencies())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.decision.decision, 'ESCALATE')
  assert.equal(result.data.decision.servicePayment, null)
  assert.match(result.data.decision.blockers.join(' '), /settled 0.3 USDT ANALYZE payment/i)
})

test('ANALYZE rejects an old 0.1 USDT payment as authorization for PREPARE', async () => {
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
  }, dependencies(), { ...servicePayment, amountAtomic: '100000' })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.decision.decision, 'ESCALATE')
  assert.equal(result.data.decision.servicePayment, null)
})

test('ANALYZE withholds a directional opinion when ZeroScout is unavailable', async () => {
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
  }, dependencies({ research: async () => null }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.match(result.data.opinion, /does not yet have enough configured research evidence/i)
  assert.match(result.data.riskFlags.join(' '), /directional opinion is withheld/i)
  assert.equal(result.data.decision.decision, 'ESCALATE')
})

test('ANALYZE cannot approve supportive research without stored ZeroScout proof', async () => {
  const base = dependencies()
  const research = await base.research({})
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
  }, dependencies({ research: async () => research ? { ...research, proof: undefined } : null }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.decision.decision, 'ESCALATE')
  assert.match(result.data.decision.blockers.join(' '), /stored proof metadata/i)
})

test('ANALYZE escalates when ZeroScout opposes the requested direct trade', async () => {
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
  }, dependencies({
    research: async () => ({
      id: 'zs-oppose-1',
      summary: 'The supplied evidence does not support this BUY.',
      confidence: 72,
      tradeAssessment: {
        stance: 'OPPOSE',
        side: 'BUY',
        thesis: 'The requested side lacks support.',
        counterThesis: 'New evidence could change the assessment.',
        resolutionRisk: 'Official results control resolution.',
        evidenceQuality: 'HIGH',
      },
    }),
  }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.decision.decision, 'ESCALATE')
  assert.match(result.data.decision.blockers.join(' '), /opposes the requested trade side/i)
})

test('ANALYZE sends ZeroScout the isolated direct-trade contract', async () => {
  const deps = dependencies()
  const research = deps.research
  let received: Record<string, unknown> = {}
  deps.research = async context => {
    received = context
    return research(context)
  }
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
  }, deps)
  assert.equal(result.ok, true)
  assert.equal(received.proofClass, 'polydesk_smart_market_research')
  assert.equal(received.side, 'BUY')
  assert.equal(typeof received.mandate, 'object')
  assert.equal((received.market as Record<string, unknown>).description, 'Resolves Yes if Team A wins the final.')
  assert.match(String(received.analysisScope), /not a research evidence gap/i)
})

test('ANALYZE routes non-sports evidence through ZeroScout general research', async () => {
  let receivedMarket: Record<string, unknown> | undefined
  const deps = dependencies({
    resolveMarket: async () => [market({ category: 'politics', question: 'Will the proposal pass?' })],
    sportsNews: async () => { throw new Error('sports provider must not be used') },
    generalNews: async (_query, selectedMarket) => {
      receivedMarket = selectedMarket
      return [{
      title: 'Proposal enters final vote',
      description: 'The latest sourced update.',
      source: 'ZeroScout cited publisher',
      url: 'https://example.com/proposal',
      publishedAt: new Date(now - 60_000).toISOString(),
      }]
    },
  })
  const result = await runPolymarketSmartTrader({
    action: 'ANALYZE',
    category: 'politics',
    marketId: 'will-the-proposal-pass',
    outcome: 'Yes',
    side: 'BUY',
  }, deps)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.evidence.newsLane, 'zeroscout-general')
  assert.equal(result.data.evidence.news.length, 1)
  assert.equal(receivedMarket?.conditionId, conditionId)
  assert.match(String(receivedMarket?.description), /Resolves Yes/)
})

test('PREPARE returns a preview-only official plugin handoff and performs no signing', async () => {
  const deps = dependencies()
  const decision = await analyzeForBuy(deps)
  const result = await runPolymarketSmartTrader({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    amountUsdc: 5,
    orderType: 'GTC',
    limitPrice: 0.5,
    postOnly: true,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.handoff.provider, 'OKX OnchainOS')
  assert.equal(result.data.handoff.plugin, 'polymarket-plugin')
  assert.equal(result.data.handoff.previewInvocation.args.at(-1), '--dry-run')
  assert.deepEqual(result.data.handoff.invocation.args, [
    'buy', '--market-id', conditionId, '--outcome', 'Yes', '--amount', '5', '--price', '0.5', '--post-only',
    '--strategy-id', decision.decisionId,
  ])
  assert.equal(result.data.signalId, `polydesk:${decision.decisionId}`)
  assert.equal(result.data.handoff.attribution.strategyId, decision.decisionId)
  assert.equal(result.data.handoff.fundingFlow?.requiredBalanceUsdc, 5)
  assert.equal(result.data.handoff.fundingFlow?.readiness.endpoint, '/api/polymarket-account/readiness')
  assert.equal(result.data.handoff.fundingFlow?.onShortfall.type, 'FUND')
  assert.equal(result.data.handoff.fundingFlow?.onShortfall.endpoint, '/api/a2mcp/polymarket-funding-link')
  assert.match(result.data.handoff.fundingFlow?.resumeOnlyWhen || '', /PREPARE_BUY/i)
  assert.match(result.data.handoff.boundary, /never overrides an ESCALATE decision/i)
  assert.match(result.data.next, /No trade has been signed or submitted/i)
})

test('PREPARE rejects an outcome that does not map exactly', async () => {
  const deps = dependencies()
  const decision = await analyzeForBuy(deps)
  const result = await runPolymarketSmartTrader({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Draw',
    side: 'BUY',
    amountUsdc: 5,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.deepEqual(result.outcomes, ['Yes', 'No'])
})

test('PREPARE fails closed when the market violates the mandate', async () => {
  const deps = dependencies()
  const decision = await analyzeForBuy(deps, { mandate: { maximumSpread: 0.005 } })
  const result = await runPolymarketSmartTrader({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    amountUsdc: 5,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.blockers.join(' '), /maximumSpread/i)
})

test('PREPARE enforces the amount bound persisted by ANALYZE', async () => {
  const deps = dependencies()
  const decision = await analyzeForBuy(deps, { mandate: { maximumSpendUsdc: 4 } })
  const result = await runPolymarketSmartTrader({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    amountUsdc: 5,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /maximumSpendUsdc/i)
})

test('PREPARE rejects an expired analysis receipt', async () => {
  let clock = now
  const deps = dependencies({ now: () => clock })
  const decision = await analyzeForBuy(deps)
  clock += 16 * 60_000
  const result = await runPolymarketSmartTrader({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    amountUsdc: 5,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 410)
  assert.match(result.error, /expired/i)
})

test('PREPARE rejects a BUY limit above the analyzed mandate', async () => {
  const deps = dependencies()
  const decision = await analyzeForBuy(deps, { mandate: { maximumPrice: 0.6, maximumPriceDrift: 0.05 } })
  const result = await runPolymarketSmartTrader({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    amountUsdc: 5,
    orderType: 'GTC',
    limitPrice: 0.7,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /maximumPrice/i)
})

test('PREPARE rejects a receipt whose persisted mandate no longer matches its hash', async () => {
  const deps = dependencies()
  const decision = await analyzeForBuy(deps)
  const originalRead = deps.readDecision
  deps.readDecision = async decisionId => {
    const stored = await originalRead(decisionId)
    return stored ? { ...stored, mandate: { ...stored.mandate, maximumSpendUsdc: 999 } } : null
  }
  const result = await runPolymarketSmartTrader({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    amountUsdc: 5,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /integrity check/i)
})

test('free PREPARE preflight rejects an invalid amount before market-provider work', async () => {
  const deps = dependencies()
  const decision = await analyzeForBuy(deps, { mandate: { maximumSpendUsdc: 4 } })
  deps.resolveMarket = async () => { throw new Error('provider work must not run during free preflight') }
  const result = await preflightPolymarketSmartTraderRequest({
    action: 'PREPARE',
    marketId: 'will-team-a-win-the-final',
    outcome: 'Yes',
    side: 'BUY',
    amountUsdc: 5,
    decisionId: decision.decisionId,
  }, deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /maximumSpendUsdc/i)
})
