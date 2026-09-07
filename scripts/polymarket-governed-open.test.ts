import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { bindPolymarketOrder, EXCHANGES_V2, FILL_INTERFACE } from '../api/polymarket-order-proof.js'
import type { Request } from 'express'
import { hashMessage, Signature, SigningKey, Wallet } from 'ethers'
import {
  buildGovernedMandateAuthorization,
  evaluateGovernedOpenInput,
  evaluateGovernedOpenWithResearch,
  APPROVED_RESEARCH_POLICY,
  governedMandateAuthorizationMessage,
  governedTradeCompletionMessage,
  governedReceiptReadResponse,
  verifyGovernedTradeCompletion,
  mergeGovernedExecution,
} from '../api/a2mcp-polymarket-governed-open.js'
import { buildStandardServiceRouteConfig } from '../api/okx-a2mcp-standard-services.js'

const now = 1_800_000_000_000
const finality = { chainId: 'eip155:137' as const, blockNumber: '0x10', blockHash: '0x' + 'aa'.repeat(32), finalizedBlockNumber: '0x11', finalizedBlockHash: '0x' + 'bb'.repeat(32) }
const signer = '0x1111111111111111111111111111111111111111'
const marketUrl = 'https://polymarket.com/event/example-market'
const authorityKey = '0x' + '42'.repeat(32)
const authoritySigner = new Wallet(authorityKey).address.toLowerCase()

function signMandate(externalOrderId: string, mandate: Record<string, unknown>) {
  const message = governedMandateAuthorizationMessage(externalOrderId, mandate)
  return Signature.from(new SigningKey(authorityKey).sign(hashMessage(message))).serialized
}

function resignMandate(body: ReturnType<typeof validBody>) {
  const mandate = body.mandate as Record<string, unknown>
  delete mandate.authoritySignature
  mandate.authoritySignature = signMandate(body.externalOrderId as string, mandate)
}

function validBody(overrides: Record<string, unknown> = {}) {
  const order = {
    salt: '1',
    maker: signer,
    signer,
    tokenId: '123456789',
    makerAmount: '5000000',
    takerAmount: '10000000',
    side: 'BUY',
    signatureType: '3',
    timestamp: String(now),
    expiration: '0',
    metadata: '0x' + '00'.repeat(32),
    builder: '0x' + 'ab'.repeat(32),
    signature: '0x' + 'cd'.repeat(96),
  }
  const body = {
    externalOrderId: 'conviction:governed:001',
    marketUrl,
    marketTitle: 'Example market',
    outcome: 'Yes',
    tokenId: order.tokenId,
    signer,
    orderType: 'FAK',
    order,
    orderPayload: {
      order: { ...order },
      owner: 'test-owner-api-key',
      orderType: 'FAK',
      deferExec: false,
      postOnly: false,
    },
    mandate: {
      maximumAmountUsdc: '5',
      maximumPrice: '0.55',
      allowedTokenIds: [order.tokenId],
      allowedMarketUrls: [marketUrl],
      allowedSigner: signer,
      authoritySigner,
      validUntil: new Date(now + 60_000).toISOString(),
      approvalRequiredAboveUsdc: '5',
    },
    ...overrides,
  }
  resignMandate(body)
  return body
}

function updateOrder(body: ReturnType<typeof validBody>, field: string, value: string) {
  ;(body.order as Record<string, unknown>)[field] = value
  ;((body.orderPayload as { order: Record<string, unknown> }).order)[field] = value
}

function researchReceipt(overrides: Record<string, unknown> = {}) {
  const receipt = {
    schema: 'polydesk-smart-trader-decision-v2', decisionId: `pstd_${'a'.repeat(32)}`,
    decision: 'APPROVE', createdAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    market: { conditionId: `0x${'12'.repeat(32)}`, tokenId: '123456789', outcome: 'Yes', url: marketUrl },
    side: 'BUY', mandate: { maximumPrice: 0.55, maximumSpread: 0.1, minimumLiquidityUsd: 100,
      minimumHoursToResolution: 1, maximumBookAgeSeconds: 60, maximumPriceDrift: 0.05,
      maximumSpendUsdc: 5, maximumShares: 100 },
    executionSnapshot: { bestBid: 0.49, bestAsk: 0.5, bookAgeSeconds: 1 },
    evidence: { zeroScoutId: 'synthetic-research', zeroScoutProof: { contentHash: 'synthetic-proof' },
      newsCount: 1, smartMoneyStatus: 'unconfigured', tradeStance: 'SUPPORT',
      evidenceQuality: 'MEDIUM', researchStatus: 'AVAILABLE' },
    servicePayment: { provider: 'CDP x402', network: 'Base',
      serviceUrl: '/api/x402/base/polymarket-smart-trader', payer: signer,
      amountAtomic: '300000', transaction: `0x${'ab'.repeat(32)}` },
    blockers: [], riskFlags: [], ...overrides,
  }
  const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    : JSON.stringify(v)
  return { ...receipt, analysisHash: createHash('sha256').update(canonical(receipt)).digest('hex') }
}

function researchBody(receipt = researchReceipt()) {
  const body = validBody()
  Object.assign(body.mandate, { researchPolicy: APPROVED_RESEARCH_POLICY,
    researchDecisionId: receipt.decisionId, researchAnalysisHash: receipt.analysisHash })
  resignMandate(body)
  return body
}

test('governed research binds the exact durable receipt to the signed mandate', async () => {
  const receipt = researchReceipt()
  const body = researchBody(receipt)
  assert.equal(evaluateGovernedOpenInput(body, now).ok, false, 'No trusted receipt means no approval')
  const evaluated = await evaluateGovernedOpenWithResearch(body, {
    now: () => now, readDecision: async id => { assert.equal(id, receipt.decisionId); return receipt },
  })
  assert.equal(evaluated.ok && evaluated.decision, 'APPROVE')
  if (evaluated.ok) assert.equal(evaluated.mandate.researchAnalysisHash, receipt.analysisHash)
  Object.assign(body.mandate, { researchAnalysisHash: 'b'.repeat(64) })
  assert.equal(evaluateGovernedOpenInput(body, now, receipt).ok, false, 'Hash substitution breaks authority signature')
  resignMandate(body)
  const mismatch = evaluateGovernedOpenInput(body, now, receipt)
  assert.equal(mismatch.ok && mismatch.decision, 'BLOCK')
})

test('governed research rejects stale, escalated, mismatched and overbroad decisions', () => {
  const fixture = researchReceipt()
  const cases = [
    researchReceipt({ decision: 'ESCALATE' }),
    researchReceipt({ expiresAt: new Date(now).toISOString() }),
    researchReceipt({ market: { ...fixture.market, tokenId: '999' } }),
    researchReceipt({ market: { ...fixture.market, outcome: 'No' } }),
    researchReceipt({ market: { ...fixture.market, url: 'https://polymarket.com/event/other' } }),
    researchReceipt({ side: 'SELL' }),
    researchReceipt({ mandate: { ...fixture.mandate, maximumSpendUsdc: 4 } }),
    researchReceipt({ mandate: { ...fixture.mandate, maximumPrice: 0.54 } }),
    researchReceipt({ mandate: { ...fixture.mandate, maximumPriceDrift: 0.01 } }),
    researchReceipt({ evidence: { ...fixture.evidence, researchStatus: 'UNAVAILABLE' } }),
    researchReceipt({ evidence: { ...fixture.evidence, zeroScoutProof: null } }),
    researchReceipt({ blockers: ['Unresolved research concern'] }),
  ]
  for (const receipt of cases) {
    const result = evaluateGovernedOpenInput(researchBody(receipt), now, receipt)
    assert.notEqual(result.ok && result.decision, 'APPROVE')
  }
  const corrupt = { ...fixture, analysisHash: 'f'.repeat(64) }
  assert.equal(evaluateGovernedOpenInput(researchBody(corrupt), now, corrupt).ok, false)
})

test('research approval fails closed on storage failure and expiry during lookup', async () => {
  const receipt = researchReceipt()
  const body = researchBody(receipt)
  const unavailable = await evaluateGovernedOpenWithResearch(body, {
    now: () => now, readDecision: async () => { throw new Error('offline') },
  })
  assert.equal(!unavailable.ok && unavailable.status, 503)
  let clock = now
  const expired = await evaluateGovernedOpenWithResearch(body, {
    now: () => clock, readDecision: async () => { clock += 60_000; return receipt },
  })
  assert.equal(expired.ok, false)
  const mixed = researchBody(receipt)
  Object.assign(mixed.mandate, { researchPolicy: 'agent-independent-v1' })
  assert.equal(buildGovernedMandateAuthorization(mixed.externalOrderId, mixed.mandate, now).ok, false)
})

test('research share limits and future-dated approvals cannot be bypassed', () => {
  const fixture = researchReceipt()
  for (const maximumShares of [0, -1, 9, 9.999999]) {
    const receipt = researchReceipt({ mandate: { ...fixture.mandate, maximumShares } })
    const result = evaluateGovernedOpenInput(researchBody(receipt), now, receipt)
    assert.notEqual(result.ok && result.decision, 'APPROVE')
  }
  const exact = researchReceipt({ mandate: { ...fixture.mandate, maximumShares: 10 } })
  const result = evaluateGovernedOpenInput(researchBody(exact), now, exact)
  assert.equal(result.ok && result.decision, 'APPROVE')
  const future = researchReceipt({ createdAt: new Date(now + 1_000).toISOString() })
  const blocked = evaluateGovernedOpenInput(researchBody(future), now, future)
  assert.equal(blocked.ok && blocked.decision, 'BLOCK')
})

test('HTTP research adapter rejects caller receipts and never reads research for independent decisions', async () => {
  const receipt = researchReceipt()
  const forged = { ...researchBody(receipt), storedResearch: receipt }
  assert.equal((await evaluateGovernedOpenWithResearch(forged, { now: () => now, readDecision: async () => receipt })).ok, false)
  const independent = validBody()
  Object.assign(independent.mandate, { researchPolicy: 'agent-independent-v1' })
  resignMandate(independent)
  let reads = 0
  const result = await evaluateGovernedOpenWithResearch(independent, {
    now: () => now, readDecision: async () => { reads++; throw new Error('Must not call AI or research storage') },
  })
  assert.equal(reads, 0)
  assert.equal(result.ok && result.decision, 'APPROVE')
})

test('approves an exact signed order inside every deterministic mandate bound', () => {
  const result = evaluateGovernedOpenInput(validBody(), now)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.decision, 'APPROVE')
  assert.equal(result.amountUsdc, '5')
  assert.equal(result.effectivePrice, '0.5')
  assert.match(result.executionId, /^pex_[a-f0-9]{24}$/)
  assert.match(result.orderHash, /^[a-f0-9]{64}$/)
  assert.match(result.mandateHash, /^[a-f0-9]{64}$/)
  assert.match(result.decisionHash, /^[a-f0-9]{64}$/)
  assert.ok(result.checks.every(check => check.result === 'PASS'))
})

test('builds the exact authority message without requiring a signature', () => {
  const body = validBody()
  const unsignedMandate = { ...(body.mandate as Record<string, unknown>) }
  delete unsignedMandate.authoritySignature
  const result = buildGovernedMandateAuthorization(body.externalOrderId, unsignedMandate, now)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.authoritySignature, '')
  assert.equal(result.authoritySigner, authoritySigner)
  assert.match(result.mandateHash, /^[a-f0-9]{64}$/)
  assert.match(result.authorizationMessage, /Policy: polydesk-market-mandate-v1/)
  assert.match(result.authorizationMessage, /Network: X Layer \(eip155:196\)/)
  assert.match(result.authorizationMessage, /External order: conviction:governed:001/)
})

test('blocks amount, price, token, market, and signer drift', () => {
  const amount = validBody()
  updateOrder(amount, 'makerAmount', '6000000')
  const amountResult = evaluateGovernedOpenInput(amount, now)
  assert.equal(amountResult.ok && amountResult.decision, 'BLOCK')
  if (amountResult.ok) assert.match(amountResult.reasons.join(' '), /exceeds the 5 USDC mandate/)

  const price = validBody()
  updateOrder(price, 'takerAmount', '8000000')
  const priceResult = evaluateGovernedOpenInput(price, now)
  assert.equal(priceResult.ok && priceResult.decision, 'BLOCK')
  if (priceResult.ok) assert.match(priceResult.reasons.join(' '), /exceeds the 0.55 limit/)

  const token = validBody()
  ;(token.mandate as Record<string, unknown>).allowedTokenIds = ['999']
  resignMandate(token)
  assert.equal(evaluateGovernedOpenInput(token, now).ok && evaluateGovernedOpenInput(token, now).decision, 'BLOCK')

  const market = validBody()
  ;(market.mandate as Record<string, unknown>).allowedMarketUrls = ['https://polymarket.com/event/another-market']
  resignMandate(market)
  assert.equal(evaluateGovernedOpenInput(market, now).ok && evaluateGovernedOpenInput(market, now).decision, 'BLOCK')

  const differentSigner = '0x2222222222222222222222222222222222222222'
  const signerDrift = validBody()
  ;(signerDrift.mandate as Record<string, unknown>).allowedSigner = differentSigner
  resignMandate(signerDrift)
  assert.equal(evaluateGovernedOpenInput(signerDrift, now).ok && evaluateGovernedOpenInput(signerDrift, now).decision, 'BLOCK')
})

test('escalates an otherwise-valid order above the human approval threshold', () => {
  const body = validBody()
  ;(body.mandate as Record<string, unknown>).approvalRequiredAboveUsdc = '3.5'
  resignMandate(body)
  const result = evaluateGovernedOpenInput(body, now)
  assert.equal(result.ok && result.decision, 'ESCALATE')
  if (result.ok) {
    assert.equal(result.checks.find(check => check.check === 'human-approval-threshold')?.result, 'ESCALATE')
    assert.match(result.reasons.join(' '), /requires explicit approval/)
  }
})

test('rejects expired and overlong mandates before any paid handoff', () => {
  const expired = validBody()
  ;(expired.mandate as Record<string, unknown>).validUntil = new Date(now - 1).toISOString()
  assert.equal(evaluateGovernedOpenInput(expired, now).ok, false)

  const overlong = validBody()
  ;(overlong.mandate as Record<string, unknown>).validUntil = new Date(now + 8 * 24 * 60 * 60_000).toISOString()
  assert.equal(evaluateGovernedOpenInput(overlong, now).ok, false)
})

test('decision hashes are deterministic and change when the mandate changes', () => {
  const first = evaluateGovernedOpenInput(validBody(), now)
  const second = evaluateGovernedOpenInput(validBody(), now)
  assert.equal(first.ok && first.decisionHash, second.ok && second.decisionHash)

  const changed = validBody()
  ;(changed.mandate as Record<string, unknown>).maximumPrice = '0.54'
  resignMandate(changed)
  const third = evaluateGovernedOpenInput(changed, now)
  assert.notEqual(first.ok && first.decisionHash, third.ok && third.decisionHash)
})

test('rejects a mandate altered after its authority signature', () => {
  const body = validBody()
  ;(body.mandate as Record<string, unknown>).maximumAmountUsdc = '50'
  const result = evaluateGovernedOpenInput(body, now)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /authority signature/)
})

test('independent research policy is bound to the authority signature and retains trade limits', () => {
  const body = validBody()
  const mandate = body.mandate as Record<string, unknown>
  mandate.researchPolicy = 'agent-independent-v1'
  assert.equal(evaluateGovernedOpenInput(body, now).ok, false, 'An unsigned change of policy must fail')
  resignMandate(body)
  const result = evaluateGovernedOpenInput(body, now)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.decision, 'APPROVE')
  assert.equal(result.mandate.researchPolicy, 'agent-independent-v1')
  updateOrder(body, 'makerAmount', '6000000')
  const excessive = evaluateGovernedOpenInput(body, now)
  assert.equal(excessive.ok, true)
  if (excessive.ok) assert.equal(excessive.decision, 'BLOCK')
  delete mandate.researchPolicy
  assert.equal(evaluateGovernedOpenInput(body, now).ok, false, 'Removing the signed policy must fail')
})

test('OKX route advertises non-zero exact USDT payment on X Layer', () => {
  const req = { headers: { host: 'polydesk.trade' }, protocol: 'https' } as Request
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/polymarket-agent-flow',
    '0.1',
    '0x631c96fba389f65da7093e559e8120b587ec7df4',
  )
  const accepts = route.accepts as {
    scheme: string
    network: string
    payTo: string
    price: { amount: string; asset: string; extra?: Record<string, unknown> }
  }
  assert.equal(accepts.scheme, 'exact')
  assert.equal(accepts.network, 'eip155:196')
  assert.equal(accepts.payTo, '0x631c96fba389f65da7093e559e8120b587ec7df4')
  assert.equal(accepts.price.amount, '100000')
  assert.equal(accepts.price.asset, '0x779ded0c9e1022225f8e0630b35a9b54be713736')
  assert.equal(accepts.price.extra?.assetTransferMethod, undefined)
})

test('verifies a terminal trade receipt against Polygon and the public Polymarket trade feed', async () => {
  const executionId = 'pex_' + '12'.repeat(12)
  const externalOrderId = 'copy:verified:001'
  const orderProof = bindPolymarketOrder(validBody().order)
  const orderId = orderProof.hashes[EXCHANGES_V2[0]]
  const transactionHash = `0x${'cd'.repeat(32)}`
  const completionMessage = governedTradeCompletionMessage(executionId, externalOrderId, orderId, transactionHash)
  const completionSignature = await new Wallet(authorityKey).signMessage(completionMessage)
  const record = {
    orderProof,
    fingerprint: '1'.repeat(64),
    externalOrderId,
    executionId,
    decisionHash: '2'.repeat(64),
    decision: 'APPROVE',
    orderHash: '3'.repeat(64),
    mandateHash: '4'.repeat(64),
    decidedAt: new Date(now).toISOString(),
    payer: 'okx-buyer',
    authoritySigner,
    market: {
      title: 'Example market',
      url: marketUrl,
      outcome: 'Yes',
      tokenId: '123456789',
    },
    order: {
      maker: signer,
      signer,
      type: 'FAK',
      maximumAmountUsdc: '5',
      maximumPrice: '0.55',
    },
  }
  const verificationDependencies = {
      fetchFinality: async () => finality,
      fetchReceipt: async () => ({
        status: '0x1',
        transactionHash,
        to: '0xE111180000d2663C0091e4f400237545B87B996B',
        logs: [{ address: EXCHANGES_V2[0], logIndex: '0x0', ...FILL_INTERFACE.encodeEventLog(FILL_INTERFACE.getEvent('OrderFilled')!, [
          orderId, signer, EXCHANGES_V2[0], 0, '123456789', 2500000, 5000000, 0, validBody().order.builder, validBody().order.metadata,
        ]) }],
      }),
      fetchTrades: async () => [{
        transactionHash,
        asset: '123456789',
        side: 'BUY',
        size: 5,
        price: 0.5,
      }],
      now: () => now,
  }
  const result = await verifyGovernedTradeCompletion(record, { orderId, transactionHash, completionSignature }, verificationDependencies)
  const pending = await verifyGovernedTradeCompletion(record, { orderId, transactionHash, completionSignature }, {
    ...verificationDependencies,
    fetchFinality: async () => { throw new Error('pending finality') },
    fetchTrades: async () => { throw new Error('Trade feed must not be read before finality') },
  })
  assert.equal(pending.ok, false)
  if (!pending.ok) assert.match(pending.error, /finality/)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.receipt.status, 'VERIFIED_FILLED')
  assert.equal(result.receipt.execution.fillAmountUsdc, 2.5)
  assert.equal(result.receipt.proofs.publicTradeMatched, true)
  assert.equal(result.receipt.proofs.exactSignedOrderVerified, true)
  assert.equal(result.receipt.proofs.polygonFinalityVerified, true)
  assert.deepEqual(result.receipt.finality, finality)
  const historical = { ...result.receipt, finality: undefined }
  const preserved = governedReceiptReadResponse(historical)
  assert.equal(preserved.ok, true)
  assert.equal(preserved.receipt, historical, 'Historical evidence is returned unchanged')
  assert.equal(preserved.verificationStatus, 'LEGACY_REQUIRES_REVERIFICATION')
  assert.equal(preserved.tradeReceiptVerified, false)
  assert.equal(preserved.signingAuthorized, false)
  assert.equal(preserved.requiresReverification, true)
  const noExactProof = { ...result.receipt, proofs: { ...result.receipt.proofs, exactSignedOrderVerified: undefined } }
  assert.equal(governedReceiptReadResponse(noExactProof).requiresReverification, true)
  assert.deepEqual(governedReceiptReadResponse(result.receipt), { ok: true, receipt: result.receipt })
  const researched = await verifyGovernedTradeCompletion({ ...record,
    researchPolicy: APPROVED_RESEARCH_POLICY, researchDecisionId: researchReceipt().decisionId,
    researchAnalysisHash: researchReceipt().analysisHash,
  }, { orderId, transactionHash, completionSignature }, verificationDependencies)
  assert.equal(researched.ok, true)
  if (researched.ok) {
    assert.equal(researched.receipt.policy.researchPolicy, APPROVED_RESEARCH_POLICY)
    assert.equal(researched.receipt.policy.researchDecisionId, researchReceipt().decisionId)
    assert.equal(researched.receipt.policy.researchAnalysisHash, researchReceipt().analysisHash)
    assert.equal(researched.receipt.proofs.polygonFinalityVerified, true)
  }
  const independent = await verifyGovernedTradeCompletion({ ...record, researchPolicy: 'agent-independent-v1' }, { orderId, transactionHash, completionSignature }, verificationDependencies)
  assert.equal(independent.ok, true)
  if (independent.ok) {
    assert.equal(independent.receipt.policy.researchPolicy, 'agent-independent-v1')
    assert.equal('researchDecisionId' in independent.receipt.policy, false)
    assert.equal('researchAnalysisHash' in independent.receipt.policy, false)
  }
  const noFinality = await verifyGovernedTradeCompletion({ ...record, receipt: { ...result.receipt, finality: undefined } }, { orderId, transactionHash })
  assert.equal(noFinality.ok, false)
  if (!noFinality.ok) assert.match(noFinality.error, /Legacy receipt lacks Polygon finality/)
  const legacy = await verifyGovernedTradeCompletion({ ...record, orderProof: undefined }, { orderId, transactionHash })
  assert.equal(legacy.ok, false)
  if (!legacy.ok) assert.match(legacy.error, /lacks an exact/)
  const unrelated = await verifyGovernedTradeCompletion(record, { orderId: `0x${'99'.repeat(32)}`, transactionHash })
  assert.equal(unrelated.ok, false)
  if (!unrelated.ok) assert.match(unrelated.error, /does not match the stored signed order/)
  const completed = mergeGovernedExecution(record, { ...record, receipt: result.receipt })
  assert.equal(mergeGovernedExecution(completed, record), completed, 'Handoff replay must preserve the receipt')
  assert.equal(mergeGovernedExecution(completed, { ...record, receipt: result.receipt }), completed, 'Duplicate completion keeps first receipt')
  assert.equal(mergeGovernedExecution(undefined, completed), completed, 'Persisted receipt survives reconstruction')
  assert.throws(() => mergeGovernedExecution(completed, { ...record, fingerprint: 'other' }), /different order/)
  const conflictingReceipt = { ...result.receipt, execution: { ...result.receipt.execution, transactionHash: `0x${'ef'.repeat(32)}` } }
  assert.throws(() => mergeGovernedExecution(completed, { ...record, receipt: conflictingReceipt }), /different verified completion/)
  const noNetwork = {
    fetchFinality: async () => { throw new Error('Replay must not fetch') },
    fetchReceipt: async () => { throw new Error('Replay must not fetch') },
    fetchTrades: async () => { throw new Error('Replay must not fetch') },
    now: () => now,
  }
  const replay = await verifyGovernedTradeCompletion(completed, { orderId, transactionHash }, noNetwork)
  assert.equal(replay.ok && replay.duplicate, true)
  const conflict = await verifyGovernedTradeCompletion(completed, { orderId, transactionHash: conflictingReceipt.execution.transactionHash }, noNetwork)
  assert.equal(conflict.ok, false)
  if (!conflict.ok) assert.equal(conflict.status, 409)
})

test('completion proof fails closed for a non-Polymarket exchange', async () => {
  const executionId = 'pex_' + '34'.repeat(12)
  const externalOrderId = 'copy:verified:002'
  const orderProof = bindPolymarketOrder(validBody().order)
  const orderId = orderProof.hashes[EXCHANGES_V2[0]]
  const transactionHash = `0x${'01'.repeat(32)}`
  const completionSignature = await new Wallet(authorityKey).signMessage(
    governedTradeCompletionMessage(executionId, externalOrderId, orderId, transactionHash),
  )
  const result = await verifyGovernedTradeCompletion(
    {
      fingerprint: '1'.repeat(64),
      orderProof,
      externalOrderId,
      executionId,
      decisionHash: '2'.repeat(64),
      decision: 'APPROVE',
      orderHash: '3'.repeat(64),
      mandateHash: '4'.repeat(64),
      decidedAt: new Date(now).toISOString(),
      payer: 'okx-buyer',
      authoritySigner,
      market: { title: 'Example', url: marketUrl, outcome: 'Yes', tokenId: '123' },
      order: { maker: signer, signer, type: 'FAK', maximumAmountUsdc: '5', maximumPrice: '0.55' },
    },
    { orderId, transactionHash, completionSignature },
    {
      fetchFinality: async () => { throw new Error('Wrong exchange must stop before finality') },
      fetchReceipt: async () => ({ status: '0x1', transactionHash, to: '0x1111111111111111111111111111111111111111', logs: [{ topics: [orderId] }] }),
      fetchTrades: async () => [],
      now: () => now,
    },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /allowlisted exchange/i)
})
