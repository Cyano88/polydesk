import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { createBuilderSession } from './polymarket-builder-session.js'

type RecordValue = Record<string, unknown>

const DEFAULT_MAX_USDC = '25'

function clean(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function env(key: string) {
  return process.env[key]?.trim() ?? ''
}

function validMarketUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:'
      && url.hostname === 'polymarket.com'
      && (url.pathname.startsWith('/event/') || url.pathname.startsWith('/sports/'))
      && !url.username
      && !url.password
    )
  } catch {
    return false
  }
}

function maxUsdc() {
  const configured = env('POLYDESK_EXTERNAL_OPEN_MAX_USDC') || DEFAULT_MAX_USDC
  if (!/^\d+(?:\.\d{1,6})?$/.test(configured) || Number(configured) <= 0) return DEFAULT_MAX_USDC
  return configured
}

function usdcAtomic(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

function validSignature(value: unknown) {
  const signature = clean(value, 1600)
  return /^0x[a-fA-F0-9]{130,}$/.test(signature) && signature.length % 2 === 0
}

function hasOnlyKeys(value: RecordValue, allowed: string[]) {
  const accepted = new Set(allowed)
  return Object.keys(value).every(key => accepted.has(key))
}

function exactOrderPayload(value: unknown, order: RecordValue, orderType: string) {
  if (!isRecord(value) || !isRecord(value.order)) return false
  if (value.orderType !== orderType || value.deferExec !== false || value.postOnly !== false) return false
  if (!hasOnlyKeys(value, ['deferExec', 'postOnly', 'order', 'owner', 'orderType'])) return false
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(clean(value.owner, 180))) return false
  const payloadOrder = value.order
  const exactFields = [
    'salt',
    'maker',
    'signer',
    'tokenId',
    'makerAmount',
    'takerAmount',
    'side',
    'signatureType',
    'timestamp',
    'expiration',
    'metadata',
    'builder',
    'signature',
  ]
  const allowedOrderFields = [...exactFields, 'taker']
  if (!hasOnlyKeys(payloadOrder, allowedOrderFields)) return false
  if (!hasOnlyKeys(order, allowedOrderFields)) return false
  if (!exactFields.every(field => String(payloadOrder[field]) === String(order[field]))) return false
  const orderHasTaker = clean(order.taker, 80) !== ''
  const payloadHasTaker = clean(payloadOrder.taker, 80) !== ''
  return orderHasTaker === payloadHasTaker && (!orderHasTaker || String(payloadOrder.taker) === String(order.taker))
}

export type SignedOpenValidation =
  | {
      ok: true
      externalOrderId: string
      marketUrl: string
      marketTitle: string
      outcome: string
      tokenId: string
      signer: string
      orderType: 'FAK' | 'FOK'
      order: RecordValue
      orderPayload: RecordValue
      maxUsdc: string
      orderBody: string
      handoffId: string
    }
  | { ok: false; status: number; error: string }

export function validateSignedOpenInput(body: unknown, nowSeconds = Math.floor(Date.now() / 1000)): SignedOpenValidation {
  if (!isRecord(body)) return { ok: false, status: 400, error: 'Signed OPEN request must be a JSON object.' }
  if (!hasOnlyKeys(body, [
    'externalOrderId',
    'marketUrl',
    'marketTitle',
    'outcome',
    'tokenId',
    'signer',
    'orderType',
    'order',
    'orderPayload',
  ])) {
    return { ok: false, status: 400, error: 'Signed OPEN request contains unsupported fields. Never include private keys, CLOB secrets, or passphrases.' }
  }

  const externalOrderId = clean(body.externalOrderId, 80)
  const marketUrl = clean(body.marketUrl, 320)
  const marketTitle = clean(body.marketTitle, 180)
  const outcome = clean(body.outcome, 64)
  const tokenId = clean(body.tokenId, 96)
  const signer = clean(body.signer, 80)
  const orderType = clean(body.orderType, 12).toUpperCase()
  const order = body.order
  const orderPayload = body.orderPayload
  const ceiling = maxUsdc()

  if (!/^[a-zA-Z0-9:_-]{8,80}$/.test(externalOrderId)) {
    return { ok: false, status: 400, error: 'externalOrderId must be 8-80 letters, numbers, colons, underscores, or hyphens.' }
  }
  if (!validMarketUrl(marketUrl)) {
    return { ok: false, status: 400, error: 'A canonical Polymarket event or sports market URL is required.' }
  }
  if (!marketTitle || !outcome || !/^\d+$/.test(tokenId) || !/^0x[a-fA-F0-9]{40}$/.test(signer)) {
    return { ok: false, status: 400, error: 'Signed OPEN market metadata is incomplete.' }
  }
  if (orderType !== 'FAK' && orderType !== 'FOK') {
    return { ok: false, status: 400, error: 'External OPEN supports immediate FAK or FOK BUY orders only.' }
  }
  if (!isRecord(order)) return { ok: false, status: 400, error: 'Signed OPEN order is missing.' }

  const required = [
    'salt',
    'maker',
    'signer',
    'tokenId',
    'makerAmount',
    'takerAmount',
    'side',
    'signatureType',
    'timestamp',
    'expiration',
    'metadata',
    'builder',
    'signature',
  ]
  const missing = required.filter(field => clean(order[field], 1600) === '')
  if (missing.length) return { ok: false, status: 400, error: `Signed OPEN order is missing ${missing.join(', ')}.` }
  if (String(order.tokenId) !== tokenId) return { ok: false, status: 400, error: 'Signed OPEN token does not match the selected market token.' }
  if (clean(order.signer, 80).toLowerCase() !== signer.toLowerCase()) {
    return { ok: false, status: 400, error: 'Signed OPEN signer does not match the declared buyer signer.' }
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean(order.maker, 80))) {
    return { ok: false, status: 400, error: 'Signed OPEN maker must be a valid Polymarket funder address.' }
  }
  if (clean(order.side, 12).toUpperCase() !== 'BUY') {
    return { ok: false, status: 400, error: 'External OPEN accepts signed BUY orders only.' }
  }
  if (!/^[0-3]$/.test(clean(order.signatureType, 8))) {
    return { ok: false, status: 400, error: 'Signed OPEN signature type is unsupported.' }
  }
  if (!/^\d+$/.test(clean(order.salt, 100))) {
    return { ok: false, status: 400, error: 'Signed OPEN salt must be an unsigned integer.' }
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(clean(order.metadata, 80)) || !/^0x[a-fA-F0-9]{64}$/.test(clean(order.builder, 80))) {
    return { ok: false, status: 400, error: 'Signed OPEN metadata and builder must be bytes32 values.' }
  }
  if (!validSignature(order.signature)) return { ok: false, status: 400, error: 'Signed OPEN signature has an unsupported shape.' }

  const makerAmount = clean(order.makerAmount, 80)
  const takerAmount = clean(order.takerAmount, 80)
  if (!/^\d+$/.test(makerAmount) || !/^\d+$/.test(takerAmount) || BigInt(makerAmount) <= 0n || BigInt(takerAmount) <= 0n) {
    return { ok: false, status: 400, error: 'Signed OPEN amounts must be positive minimal-unit integers.' }
  }
  if (BigInt(makerAmount) > usdcAtomic(ceiling)) {
    return { ok: false, status: 400, error: `Signed OPEN maker amount exceeds the ${ceiling} USDC safety ceiling.` }
  }

  const timestamp = Number(clean(order.timestamp, 32))
  const expiration = Number(clean(order.expiration, 32))
  if (!Number.isSafeInteger(timestamp) || timestamp < nowSeconds - 900 || timestamp > nowSeconds + 120) {
    return { ok: false, status: 400, error: 'Signed OPEN timestamp must be within the current 15-minute window.' }
  }
  if (!Number.isSafeInteger(expiration) || expiration < 0 || (expiration !== 0 && expiration <= nowSeconds)) {
    return { ok: false, status: 400, error: 'Signed OPEN order is expired or has an invalid expiration.' }
  }
  if (!exactOrderPayload(orderPayload, order, orderType)) {
    return { ok: false, status: 400, error: 'Polymarket order payload does not exactly match the signed OPEN order.' }
  }

  const orderBody = JSON.stringify(orderPayload)
  const handoffId = createHash('sha256').update(`${externalOrderId}:${orderBody}`).digest('hex').slice(0, 24)
  return {
    ok: true,
    externalOrderId,
    marketUrl,
    marketTitle,
    outcome,
    tokenId,
    signer,
    orderType,
    order,
    orderPayload: orderPayload as RecordValue,
    maxUsdc: ceiling,
    orderBody,
    handoffId,
  }
}

function builderReady() {
  return Boolean(
    /^0x[a-fA-F0-9]{64}$/.test(env('POLYMARKET_BUILDER_CODE'))
    && env('POLYMARKET_BUILDER_API_KEY')
    && env('POLYMARKET_BUILDER_SECRET')
    && env('POLYMARKET_BUILDER_PASSPHRASE'),
  )
}

export function polymarketSignedOpenValidationHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const validation = validateSignedOpenInput(req.body)
  if (!validation.ok) return res.status(validation.status).json({ ok: false, error: validation.error })
  return res.status(200).json({
    ok: true,
    valid: true,
    handoffId: validation.handoffId,
    externalOrderId: validation.externalOrderId,
    signer: validation.signer,
    tokenId: validation.tokenId,
    side: 'BUY',
    orderType: validation.orderType,
    maxUsdc: validation.maxUsdc,
    next: 'Pay the OKX x402 challenge, then replay this exact body without modification.',
  })
}

export default async function a2mcpPolymarketSignedOpenHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }

  const paidReq = req as Request & { payment?: { verified?: boolean; payer?: string; transaction?: string } }
  if (paidReq.payment?.verified !== true) {
    return res.status(403).json({ ok: false, error: 'A verified OKX service payment is required.' })
  }
  if (!builderReady()) {
    return res.status(503).json({ ok: false, error: 'PolyDesk signed OPEN handoff is not configured.' })
  }

  const validation = validateSignedOpenInput(req.body)
  if (!validation.ok) return res.status(validation.status).json({ ok: false, error: validation.error })
  if (clean(validation.order.builder, 80).toLowerCase() !== env('POLYMARKET_BUILDER_CODE').toLowerCase()) {
    return res.status(400).json({ ok: false, error: 'Signed OPEN builder does not match the PolyDesk builder code.' })
  }

  const session = createBuilderSession(validation.orderBody)
  return res.status(200).json({
    ok: true,
    service: 'PolyDesk Signed OPEN Handoff',
    mode: 'buyer-signed-direct-submit',
    externalOrderId: validation.externalOrderId,
    handoffId: validation.handoffId,
    buyer: {
      servicePayer: clean(paidReq.payment?.payer, 96) || 'okx-buyer',
      signer: validation.signer,
    },
    market: {
      title: validation.marketTitle,
      url: validation.marketUrl,
      outcome: validation.outcome,
      tokenId: validation.tokenId,
      side: 'BUY',
    },
    safety: {
      allowedOrderTypes: ['FAK', 'FOK'],
      maxUsdc: validation.maxUsdc,
      privateKeyReceived: false,
      clobApiKeyIdentifierReceived: true,
      clobSecretReceived: false,
      clobPassphraseReceived: false,
      submittedByPolyDesk: false,
    },
    submission: {
      host: 'https://clob.polymarket.com',
      path: '/order',
      method: 'POST',
      orderType: validation.orderType,
      orderPayload: validation.orderPayload,
      builderSigner: {
        url: `/api/polymarket-builder-signer?id=${session.id}`,
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        oneTime: true,
      },
    },
    instructions: [
      'The order payload contains the buyer CLOB API-key identifier as owner; never send its secret or passphrase to PolyDesk.',
      'Generate the buyer CLOB submission headers locally.',
      'Use the one-time builder signer for this exact order body.',
      'Submit the exact order payload directly to Polymarket CLOB /order.',
      'The buyer agent remains the only wallet signer and order executor.',
    ],
    paymentProof: {
      network: 'X Layer',
      transaction: paidReq.payment?.transaction,
    },
  })
}
