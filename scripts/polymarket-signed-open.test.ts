import assert from 'node:assert/strict'
import test from 'node:test'
import a2mcpPolymarketSignedOpenHandler, { validateSignedOpenInput } from '../api/a2mcp-polymarket-signed-open.js'
import { buildStandardServiceRouteConfig } from '../api/okx-a2mcp-standard-services.js'
import type { Request, Response } from 'express'

const now = 1_800_000_000_000
const signer = '0x1111111111111111111111111111111111111111'

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
  const orderPayload = {
    order: { ...order },
    owner: 'test-owner-api-key',
    orderType: 'FAK',
    deferExec: false,
    postOnly: false,
  }
  return {
    externalOrderId: 'conviction:test:001',
    marketUrl: 'https://polymarket.com/event/example-market',
    marketTitle: 'Example market',
    outcome: 'Yes',
    tokenId: order.tokenId,
    signer,
    orderType: 'FAK',
    order,
    orderPayload,
    ...overrides,
  }
}

test('accepts a buyer-signed immediate BUY order without a PolyDesk spend ceiling', () => {
  const result = validateSignedOpenInput(validBody(), now)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.orderType, 'FAK')
    assert.match(result.handoffId, /^[a-f0-9]{24}$/)
  }
})

test('rejects SELL, persistent orders, stale signatures, and payload drift', () => {
  const sell = validBody()
  ;(sell.order as Record<string, unknown>).side = 'SELL'
  ;(sell.orderPayload as { order: Record<string, unknown> }).order.side = 'SELL'
  assert.equal(validateSignedOpenInput(sell, now).ok, false)

  assert.equal(validateSignedOpenInput(validBody({ orderType: 'GTC' }), now).ok, false)

  const largerBuy = validBody()
  ;(largerBuy.order as Record<string, unknown>).makerAmount = '100000000'
  ;(largerBuy.orderPayload as { order: Record<string, unknown> }).order.makerAmount = '100000000'
  assert.equal(validateSignedOpenInput(largerBuy, now).ok, true)

  const stale = validBody()
  ;(stale.order as Record<string, unknown>).timestamp = String(now - 900_001)
  ;(stale.orderPayload as { order: Record<string, unknown> }).order.timestamp = String(now - 900_001)
  assert.equal(validateSignedOpenInput(stale, now).ok, false)

  const secondsTimestamp = validBody()
  ;(secondsTimestamp.order as Record<string, unknown>).timestamp = String(Math.floor(now / 1000))
  ;(secondsTimestamp.orderPayload as { order: Record<string, unknown> }).order.timestamp = String(Math.floor(now / 1000))
  assert.equal(validateSignedOpenInput(secondsTimestamp, now).ok, false)

  const persistentExpiration = validBody()
  ;(persistentExpiration.order as Record<string, unknown>).expiration = String(now + 60_000)
  ;(persistentExpiration.orderPayload as { order: Record<string, unknown> }).order.expiration = String(now + 60_000)
  assert.equal(validateSignedOpenInput(persistentExpiration, now).ok, false)

  const drift = validBody()
  ;(drift.orderPayload as { order: Record<string, unknown> }).order.tokenId = '999'
  assert.equal(validateSignedOpenInput(drift, now).ok, false)

  const missingOwner = validBody()
  delete (missingOwner.orderPayload as Record<string, unknown>).owner
  assert.equal(validateSignedOpenInput(missingOwner, now).ok, false)

  const embeddedSecret = { ...validBody(), clobSecret: 'must-never-be-sent' }
  assert.equal(validateSignedOpenInput(embeddedSecret, now).ok, false)

  const takerDrift = validBody()
  ;(takerDrift.orderPayload as { order: Record<string, unknown> }).order.taker = '0x2222222222222222222222222222222222222222'
  assert.equal(validateSignedOpenInput(takerDrift, now).ok, false)
})

test('consolidated OKX trader route advertises exact EIP-3009 payment', () => {
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
    price: { amount: string; extra?: Record<string, unknown> }
  }
  assert.equal(accepts.scheme, 'exact')
  assert.equal(accepts.network, 'eip155:196')
  assert.equal(accepts.price.amount, '100000')
  assert.equal(accepts.price.extra?.assetTransferMethod, undefined)
})

test('paid replay returns a direct-submit handoff without buyer credentials', async () => {
  const previous = {
    code: process.env.POLYMARKET_BUILDER_CODE,
    key: process.env.POLYMARKET_BUILDER_API_KEY,
    secret: process.env.POLYMARKET_BUILDER_SECRET,
    passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE,
  }
  process.env.POLYMARKET_BUILDER_CODE = '0x' + 'ab'.repeat(32)

  let statusCode = 200
  let responseBody: Record<string, any> = {}
  const requestBody = validBody()
  const freshTimestamp = String(Date.now())
  ;(requestBody.order as Record<string, unknown>).timestamp = freshTimestamp
  ;(requestBody.orderPayload as { order: Record<string, unknown> }).order.timestamp = freshTimestamp
  const res = {
    setHeader() { return this },
    status(code: number) { statusCode = code; return this },
    json(body: Record<string, any>) { responseBody = body; return this },
  } as unknown as Response
  const req = {
    method: 'POST',
    body: requestBody,
    payment: {
      verified: true,
      payer: '0x2222222222222222222222222222222222222222',
      transaction: '0x' + 'ef'.repeat(32),
    },
  } as unknown as Request

  try {
    await a2mcpPolymarketSignedOpenHandler(req, res)
    assert.equal(statusCode, 200)
    assert.equal(responseBody.ok, true)
    assert.equal(responseBody.mode, 'buyer-signed-direct-submit')
    assert.equal(responseBody.safety.privateKeyReceived, false)
    assert.equal(responseBody.safety.clobApiKeyIdentifierReceived, true)
    assert.equal(responseBody.safety.clobSecretReceived, false)
    assert.equal(responseBody.safety.clobPassphraseReceived, false)
    assert.equal(responseBody.safety.submittedByPolyDesk, false)
    assert.equal(responseBody.safety.signatureShapeValidated, true)
    assert.equal(responseBody.safety.signatureCryptographicallyVerified, false)
    assert.equal(responseBody.safety.finalSignatureAuthority, 'Polymarket CLOB')
    assert.equal(responseBody.submission.orderPayload.order.side, 'BUY')
    assert.equal('builderSigner' in responseBody.submission, false)
    assert.equal('userHeaders' in responseBody, false)
  } finally {
    if (previous.code === undefined) delete process.env.POLYMARKET_BUILDER_CODE
    else process.env.POLYMARKET_BUILDER_CODE = previous.code
    if (previous.key === undefined) delete process.env.POLYMARKET_BUILDER_API_KEY
    else process.env.POLYMARKET_BUILDER_API_KEY = previous.key
    if (previous.secret === undefined) delete process.env.POLYMARKET_BUILDER_SECRET
    else process.env.POLYMARKET_BUILDER_SECRET = previous.secret
    if (previous.passphrase === undefined) delete process.env.POLYMARKET_BUILDER_PASSPHRASE
    else process.env.POLYMARKET_BUILDER_PASSPHRASE = previous.passphrase
  }
})
