import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import { BasePaymentAttempts, ExistingBasePaymentAttempt, type BasePaymentAttempt } from '../api/base-payment-attempt.js'
import { BASE_NATIVE_USDC, BASE_MAINNET_CAIP2, BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  createBaseAgenticMarketSmartTraderHandler } from '../api/base-agentic-market-smart-trader.js'
import { buildSettledSmartTraderAnalysisRecord, reuseSettledSmartTraderAnalysis,
  type SmartTraderServicePayment } from '../api/polymarket-smart-trader.js'

const seller = `0x${'11'.repeat(20)}`
const payer = `0x${'22'.repeat(20)}`
const transaction = `0x${'ab'.repeat(32)}`
const request = { action: 'ANALYZE', marketId: `0x${'12'.repeat(32)}`, outcome: 'Yes', side: 'BUY' }
const servicePayment: SmartTraderServicePayment = { provider: 'CDP x402', payer, transaction,
  amountAtomic: '300000', network: 'Base', serviceUrl: BASE_AGENTIC_MARKET_SMART_TRADER_PATH }

test('an attempted failed settlement returns reconciliation instead of another payment challenge', async () => {
  const h = harness()
  h.settlement.success = false
  h.settlement.response = { status: 402, headers: { 'PAYMENT-REQUIRED': 'must-not-forward' }, body: { error: 'private facilitator detail' } }
  await h.run()
  assert.equal(h.output.status, 503)
  assert.equal(h.output.body.retryPayment, false)
  assert.equal(h.output.body.settlementAttempted, true)
  assert.equal(h.output.body.recoveryUrl, `${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}/recover`)
  assert.equal(h.output.headers['X-PolyDesk-Payment-Attempt-Id'], h.output.body.paymentAttemptId)
  assert.equal(h.output.headers['PAYMENT-REQUIRED'], undefined)
  assert.equal(h.events.includes('deliver'), false)
  assert.equal([...h.records.values()][0].state, 'attempted')
  await h.run()
  assert.equal(h.output.status, 409)
  assert.equal(h.events.filter(event => event === 'settle').length, 1)
})

function harness() {
  const events: string[] = []
  const requirements = { scheme: 'exact', network: BASE_MAINNET_CAIP2, asset: BASE_NATIVE_USDC,
    amount: '300000', payTo: seller, maxTimeoutSeconds: 600, extra: {} }
  const payload = { x402Version: 2, payload: { authorization: { from: payer, to: seller, value: '300000', nonce: `0x${'ef'.repeat(32)}` } }, accepted: requirements }
  const settlement: Record<string, unknown> = { success: true, network: BASE_MAINNET_CAIP2, transaction, payer, amount: '300000', headers: {} }
  const config = { ready: true, preflight: { ok: true } as any, paymentType: 'payment-verified', throwSettle: false, throwDelivery: false,
    failClaim: false, ambiguousCommit: false, failSettledWrite: false, paymentHeaders: {} as Record<string, string> }
  const records = new Map<string, BasePaymentAttempt>()
  const attempts = new BasePaymentAttempts(async (key, update) => {
    const next = update(records.has(key) ? structuredClone(records.get(key)!) : undefined)
    if (config.failClaim || (config.failSettledWrite && next.state === 'settled')) throw new Error('Synthetic storage unavailable')
    records.set(key, structuredClone(next))
    if (config.ambiguousCommit && next.state === 'attempted') throw new Error('Synthetic commit acknowledgement lost')
    return structuredClone(next)
  })
  const req = { method: 'POST', body: structuredClone(request), query: {}, headers: { host: 'polydesk.trade', 'payment-signature': 'synthetic' }, protocol: 'https' } as unknown as Request
  const output = { status: 0, body: undefined as any, headers: {} as Record<string, unknown> }
  const res = { setHeader: (key: string, value: unknown) => { output.headers[key] = value },
    status: (status: number) => { output.status = status; return res },
    json: (body: unknown) => { output.body = body; return res }, send: (body: unknown) => { output.body = body; return res } } as unknown as Response
  const handler = createBaseAgenticMarketSmartTraderHandler({
    attempts,
    ready: () => config.ready, operational: async () => true, seller: () => seller,
    preflight: async () => { events.push('preflight'); return config.preflight },
    server: async () => ({
      processHTTPRequest: async () => { events.push('verify'); return config.paymentType === 'payment-error'
        ? { type: 'payment-error', response: { status: 402, headers: config.paymentHeaders, body: { ok: false } } }
        : { type: config.paymentType, paymentPayload: payload, paymentRequirements: requirements } },
      processSettlement: async () => { events.push('settle'); if (config.throwSettle) throw new Error('synthetic private provider detail'); return settlement },
    }) as never,
    deliver: async (paidReq, response) => { events.push('deliver');
      if (config.throwDelivery) throw new Error('synthetic private storage detail')
      assert.deepEqual((paidReq as any).payment, { verified: true, payer, amount: '300000', network: 'Base', transaction,
        asset: 'USDC', provider: 'CDP x402', seller, serviceUrl: BASE_AGENTIC_MARKET_SMART_TRADER_PATH })
      return response.status(202).json({ ok: true, paymentStatus: 'settled' }) },
  })
  return { events, requirements, settlement, config, req, output, records, payload, run: () => handler(req, res) }
}

test('Base challenge exposes body replay fields without changing payment terms or settling', async () => {
  const h = harness()
  h.config.paymentType = 'payment-error'
  const challenge = { x402Version: 2, accepts: [h.requirements],
    resource: { url: `https://polydesk.trade${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}`, mimeType: 'application/json' },
    extensions: { bazaar: { preserved: true } } }
  h.config.paymentHeaders['Payment-Required'] = Buffer.from(JSON.stringify(challenge)).toString('base64url')
  h.config.paymentHeaders['Cache-Control'] = 'no-store'
  await h.run()
  assert.equal(h.output.status, 402)
  const decoded = JSON.parse(Buffer.from(String(h.output.headers['Payment-Required']), 'base64url').toString())
  assert.deepEqual(decoded.accepts, challenge.accepts)
  assert.deepEqual(decoded.resource, challenge.resource)
  assert.deepEqual(decoded.extensions, challenge.extensions)
  assert.equal(h.output.headers['Cache-Control'], 'no-store')
  // The compatibility field map is what the quote client uses to retain known
  // parameters on replay; examples from Bazaar must not replace caller values.
  const replay: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(request)) {
    assert.equal(decoded.outputSchema.input[name].carrier, 'body')
    replay[name] = value
  }
  assert.deepEqual(replay, request)
  assert.equal(decoded.outputSchema.input.action.required, true)
  assert.deepEqual(h.req.body, request)
  assert.equal(h.events.includes('settle'), false)
  assert.equal(h.events.includes('deliver'), false)
  assert.equal(h.records.size, 0)
})

test('a durable claim must commit before settlement; uncertain commit is never retried', async () => {
  for (const mode of ['failure', 'ambiguous']) {
    const h = harness(); h.config.failClaim = mode === 'failure'; h.config.ambiguousCommit = mode === 'ambiguous'
    await h.run(); assert.equal(h.events.includes('settle'), false)
    assert.equal(h.output.body.retryPayment, false)
    if (mode === 'ambiguous') {
      h.config.ambiguousCommit = false; await h.run()
      assert.equal(h.output.status, 409)
      assert.equal(h.events.includes('settle'), false)
    }
  }
})

test('concurrent and subsequent identical requests have only one settlement attempt', async () => {
  const h = harness(); await Promise.all([h.run(), h.run()]); await h.run()
  assert.equal(h.events.filter(event => event === 'settle').length, 1)
  assert.equal(h.records.size, 1)
  const record = [...h.records.values()][0]
  assert.equal(record.state, 'settled')
  assert.equal(record.transaction, transaction)
  assert.equal(record.request.action, 'ANALYZE')
  assert.doesNotMatch(JSON.stringify(record), /signature|synthetic private/)
})

test('settlement interruption or lost settlement write leaves a blocking durable attempt', async () => {
  for (const mode of ['timeout', 'write']) {
    const h = harness(); h.config.throwSettle = mode === 'timeout'; h.config.failSettledWrite = mode === 'write'
    await h.run()
    assert.equal([...h.records.values()][0].state, 'attempted')
    h.config.throwSettle = false; h.config.failSettledWrite = false
    await h.run(); assert.equal(h.output.status, 409)
    assert.equal(h.events.filter(event => event === 'settle').length, 1)
    assert.equal(h.events.includes('deliver'), false)
  }
})

test('the same authorization cannot be rebound to changed business inputs', async () => {
  const h = harness(); await h.run(); h.req.body.outcome = 'No'; await h.run()
  assert.equal(h.output.status, 409)
  assert.equal(h.output.body.paymentStatus, 'conflict')
  assert.equal(h.events.filter(event => event === 'settle').length, 1)
})

test('missing stable authorization identity is rejected before settlement', async () => {
  const h = harness(); h.payload.payload.authorization.nonce = ''; await h.run()
  assert.equal(h.events.includes('settle'), false)
  assert.equal(h.records.size, 0)
})

test('a reconstructed coordinator retains the claim and rejects stale or conflicting settlement writers', async () => {
  const h = harness(); h.config.throwSettle = true; await h.run()
  const persisted = structuredClone([...h.records.values()][0])
  let current = structuredClone(persisted)
  const restarted = new BasePaymentAttempts(async (_key, update) => {
    current = update(structuredClone(current)); return structuredClone(current)
  })
  await assert.rejects(restarted.claim(persisted), ExistingBasePaymentAttempt)
  await assert.rejects(restarted.settled({ ...persisted, claimToken: 'stale' }, transaction))
  await restarted.settled(persisted, transaction)
  await restarted.settled(persisted, transaction)
  await assert.rejects(restarted.settled(persisted, `0x${'cd'.repeat(32)}`))
  assert.equal(current.transaction, transaction)
})

test('Base handler verifies, settles once and only then delivers bound metadata', async () => {
  const h = harness(); await h.run()
  assert.deepEqual(h.events, ['preflight', 'verify', 'settle', 'deliver'])
  assert.equal(h.output.status, 202)
})

test('preflight rejection, included PREPARE and service outage never settle', async () => {
  for (const mode of ['reject', 'included', 'unready']) {
    const h = harness()
    if (mode === 'reject') h.config.preflight = { ok: false, status: 409, body: { ok: false } }
    if (mode === 'included') h.config.preflight = { ok: true, prepared: { status: 200, data: { ok: true } } }
    if (mode === 'unready') h.config.ready = false
    await h.run(); assert.deepEqual(h.events, ['preflight'])
  }
})

test('unpaid and unprotected Base requests cannot reach settlement or delivery', async () => {
  for (const type of ['payment-error', 'no-payment-required']) {
    const h = harness(); h.config.paymentType = type; await h.run()
    assert.deepEqual(h.events, ['preflight', 'verify'])
    assert.ok(h.output.status >= 400)
  }
})

test('crossed network, token, seller, scheme or amount stops before settlement', async () => {
  for (const [key, value] of [['network', 'eip155:196'], ['asset', payer], ['payTo', payer],
    ['amount', '300001'], ['amount', '0300000'], ['scheme', 'upto']]) {
    const h = harness(); (h.requirements as any)[key] = value; await h.run()
    assert.deepEqual(h.events, ['preflight', 'verify'])
    assert.equal(h.output.body.settlementAttempted, false)
  }
})

test('conflicting or incomplete successful settlement cannot deliver research', async () => {
  for (const [key, value] of [['network', 'eip155:196'], ['transaction', ''], ['transaction', `0x${'0'.repeat(64)}`],
    ['payer', seller], ['payer', ''], ['amount', '299999'], ['amount', ''], ['errorReason', 'conflict']]) {
    const h = harness(); h.settlement[key] = value; await h.run()
    assert.deepEqual(h.events, ['preflight', 'verify', 'settle'])
    assert.equal(h.output.body.paymentStatus, 'unknown')
    assert.equal(h.output.body.retryPayment, false)
  }
})

test('settlement timeout and post-settlement storage failure stop without automatic retry or error leakage', async () => {
  for (const stage of ['settle', 'deliver']) {
    const h = harness(); h.config.throwSettle = stage === 'settle'; h.config.throwDelivery = stage === 'deliver'
    await h.run(); assert.equal(h.events.filter(event => event === 'settle').length, 1)
    assert.equal(h.output.body.retryPayment, false)
    assert.equal(h.output.body.recoveryRequired, true)
    assert.equal(h.output.body.paymentStatus, stage === 'settle' ? 'unknown' : 'settled_delivery_unconfirmed')
    assert.doesNotMatch(JSON.stringify(h.output.body), /synthetic private/)
  }
})

test('durable replay keeps the existing delivery and rejects altered buyer, lane, or request', () => {
  const original = buildSettledSmartTraderAnalysisRecord(request, servicePayment)
  const current = { ...original, status: 'completed' as const, response: { ok: true, synthetic: true } }
  assert.equal(reuseSettledSmartTraderAnalysis(current, original), current)
  for (const payment of [{ ...servicePayment, payer: seller },
    { ...servicePayment, provider: 'OKX Agent Payments Protocol', network: 'X Layer', serviceUrl: '/api/a2mcp/polymarket-smart-trader' },
    { ...servicePayment, transaction: `0x${'cd'.repeat(32)}` }]) {
    const candidate = buildSettledSmartTraderAnalysisRecord(request, payment as SmartTraderServicePayment)
    assert.throws(() => reuseSettledSmartTraderAnalysis(current, candidate), /different buyer, payment lane/)
  }
  const different = buildSettledSmartTraderAnalysisRecord({ ...request, outcome: 'No' }, servicePayment)
  assert.throws(() => reuseSettledSmartTraderAnalysis(current, different))
  const corrupt = structuredClone(current); corrupt.requestHash = ''
  assert.throws(() => reuseSettledSmartTraderAnalysis(corrupt, original))
  const corruptBody = structuredClone(current); corruptBody.request.outcome = 'No'
  assert.throws(() => reuseSettledSmartTraderAnalysis(corruptBody, original))
})

test('durable payment identity compares address and transaction case without renewing delivery', () => {
  const original = buildSettledSmartTraderAnalysisRecord(request, servicePayment)
  const candidate = buildSettledSmartTraderAnalysisRecord(request, { ...servicePayment,
    transaction: '0x' + transaction.slice(2).toUpperCase(), payer: '0x' + payer.slice(2).toUpperCase() })
  assert.equal(reuseSettledSmartTraderAnalysis(original, candidate), original)
})
