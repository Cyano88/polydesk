import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { applyHashPayLinkFundingEvent } from './polymarket-portfolio.js'
import { claimHashPayLinkWebhookEvent, completeHashPayLinkWebhookEvent, type StoredHashPayLinkWebhookEvent } from './hashpaylink-webhook-store.js'

const EVENTS = new Set<StoredHashPayLinkWebhookEvent['event']>([
  'checkout.created',
  'payment.processing',
  'payment.confirmed',
  'payment.failed',
])
const MAX_TIMESTAMP_SKEW_SECONDS = 300

type VerifiedEvent = Omit<StoredHashPayLinkWebhookEvent, 'attempts' | 'processed'>
type Dependencies = {
  secret: () => string
  now: () => Date
  claim: typeof claimHashPayLinkWebhookEvent
  complete: typeof completeHashPayLinkWebhookEvent
  applyFundingEvent: typeof applyHashPayLinkFundingEvent
}

const defaults: Dependencies = {
  secret: () => (process.env.HASH_PAYLINK_WEBHOOK_SECRET ?? '').trim(),
  now: () => new Date(),
  claim: claimHashPayLinkWebhookEvent,
  complete: completeHashPayLinkWebhookEvent,
  applyFundingEvent: applyHashPayLinkFundingEvent,
}

function header(req: Request, name: string) {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] ?? '' : String(value ?? '').trim()
}

function signatureParts(value: string) {
  const match = value.match(/^t=(\d{10,}),v1=([a-f0-9]{64})$/)
  return match ? { timestamp: match[1], signature: match[2] } : null
}

function safeSignatureEqual(expected: string, received: string) {
  if (expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}

function verifiedPayload(req: Request, secret: string, now: Date): VerifiedEvent {
  if (!Buffer.isBuffer(req.body)) throw Object.assign(new Error('Webhook body must be raw JSON.'), { status: 400 })
  const eventId = header(req, 'x-hashpaylink-event')
  if (!/^evt_[a-zA-Z0-9]{12,40}$/.test(eventId)) throw Object.assign(new Error('Webhook event id is invalid.'), { status: 400 })
  const parts = signatureParts(header(req, 'x-hashpaylink-signature'))
  if (!parts) throw Object.assign(new Error('Webhook signature is missing or malformed.'), { status: 401 })
  const timestamp = Number(parts.timestamp)
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    throw Object.assign(new Error('Webhook timestamp is outside the accepted window.'), { status: 401 })
  }
  const rawBody = req.body.toString('utf8')
  const expected = createHmac('sha256', secret).update(`${parts.timestamp}.${rawBody}`).digest('hex')
  if (!safeSignatureEqual(expected, parts.signature)) throw Object.assign(new Error('Webhook signature is invalid.'), { status: 401 })
  let payload: { id?: unknown; event?: unknown; createdAt?: unknown; data?: unknown }
  try { payload = JSON.parse(rawBody) as typeof payload } catch { throw Object.assign(new Error('Webhook JSON is invalid.'), { status: 400 }) }
  const event = String(payload.event ?? '') as StoredHashPayLinkWebhookEvent['event']
  const createdAt = String(payload.createdAt ?? '')
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : null
  const checkoutId = String(data?.checkoutId ?? '')
  if (payload.id !== eventId || !EVENTS.has(event) || !Number.isFinite(Date.parse(createdAt)) || !data || !/^chk_[a-zA-Z0-9]{8,40}$/.test(checkoutId)) {
    throw Object.assign(new Error('Webhook payload is invalid.'), { status: 400 })
  }
  return { id: eventId, event, checkoutId, createdAt, receivedAt: now.toISOString(), data }
}

export function createHashPayLinkWebhookHandler(dependencies: Dependencies = defaults) {
  return async function hashPayLinkWebhookHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    const secret = dependencies.secret()
    if (secret.length < 32) return res.status(503).json({ ok: false, error: 'Hash PayLink webhook verification is not configured.' })
    let event: VerifiedEvent
    try {
      event = verifiedPayload(req, secret, dependencies.now())
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status) || 400
      return res.status(status).json({ ok: false, error: (error as Error).message })
    }
    try {
      const claim = await dependencies.claim(event)
      if (claim.alreadyProcessed) return res.json({ ok: true, duplicate: true })
      const matchedFundingAttempts = await dependencies.applyFundingEvent(event)
      await dependencies.complete(event.id, { processedAt: dependencies.now().toISOString() })
      return res.json({ ok: true, received: true, matchedFundingAttempts })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed.'
      await dependencies.complete(event.id, { processedAt: dependencies.now().toISOString(), error: message }).catch(() => undefined)
      console.error('[hashpaylink-webhook] processing failed:', message)
      return res.status(503).json({ ok: false, error: 'Webhook processing is temporarily unavailable.' })
    }
  }
}

export default createHashPayLinkWebhookHandler()
