import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import { hashMessage, Signature, SigningKey, Wallet } from 'ethers'
import {
  buildGovernedMandateAuthorization,
  evaluateGovernedOpenInput,
  governedMandateAuthorizationMessage,
  governedTradeCompletionMessage,
  verifyGovernedTradeCompletion,
} from '../api/a2mcp-polymarket-governed-open.js'
import { buildStandardServiceRouteConfig } from '../api/okx-a2mcp-standard-services.js'

const now = 1_800_000_000_000
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
  const orderId = `0x${'ab'.repeat(32)}`
  const transactionHash = `0x${'cd'.repeat(32)}`
  const completionMessage = governedTradeCompletionMessage(executionId, externalOrderId, orderId, transactionHash)
  const completionSignature = await new Wallet(authorityKey).signMessage(completionMessage)
  const record = {
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
  const result = await verifyGovernedTradeCompletion(
    record,
    { orderId, transactionHash, completionSignature },
    {
      fetchReceipt: async () => ({
        status: '0x1',
        to: '0xE111180000d2663C0091e4f400237545B87B996B',
        logs: [{ topics: [orderId] }],
      }),
      fetchTrades: async () => [{
        transactionHash,
        asset: '123456789',
        side: 'BUY',
        size: 5,
        price: 0.5,
      }],
      now: () => now,
    },
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.receipt.status, 'VERIFIED_FILLED')
  assert.equal(result.receipt.execution.fillAmountUsdc, 2.5)
  assert.equal(result.receipt.proofs.publicTradeMatched, true)
})

test('completion proof fails closed for a non-Polymarket exchange', async () => {
  const executionId = 'pex_' + '34'.repeat(12)
  const externalOrderId = 'copy:verified:002'
  const orderId = `0x${'ef'.repeat(32)}`
  const transactionHash = `0x${'01'.repeat(32)}`
  const completionSignature = await new Wallet(authorityKey).signMessage(
    governedTradeCompletionMessage(executionId, externalOrderId, orderId, transactionHash),
  )
  const result = await verifyGovernedTradeCompletion(
    {
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
      market: { title: 'Example', url: marketUrl, outcome: 'Yes', tokenId: '123' },
      order: { maker: signer, signer, type: 'FAK', maximumAmountUsdc: '5', maximumPrice: '0.55' },
    },
    { orderId, transactionHash, completionSignature },
    {
      fetchReceipt: async () => ({ status: '0x1', to: '0x1111111111111111111111111111111111111111', logs: [{ topics: [orderId] }] }),
      fetchTrades: async () => [],
      now: () => now,
    },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /allowlisted Polymarket/i)
})
