import type { Request, Response } from 'express'
import { createHmac, randomUUID } from 'node:crypto'
import type { Response as ExpressResponse } from 'express'
import a2mcpPolymarketFundingLinkHandler from './a2mcp-polymarket-funding-link.js'
import a2mcpPolymarketPortfolioWatchHandler from './a2mcp-polymarket-portfolio-watch.js'
import { getPolyStreamFeed } from './poly-stream.js'
import { getPolyWorldcupNewsFeed } from './poly-worldcup-news.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson, writeDurableJson } from './render-durable-store.js'
import { scoutResponse } from './x402-polymarket-scout.js'

const OKX_API_ORIGIN = 'https://web3.okx.com'
const OKX_CREATE_PAYMENT_PATH = '/api/v6/pay/a2a/payment/create'
const CHECKOUT_TTL_SECONDS = 30 * 60
const DELIVERY_LOCK_MS = 2 * 60 * 1000

type ServiceId =
  | 'okx-polymarket-lp-scout'
  | 'worldcup-live-scores'
  | 'worldcup-market-news'
  | 'polymarket-portfolio-watch'
  | 'polymarket-funding-link'

type MarketplaceIntent = {
  version: 1
  paymentId: string
  externalId: string
  paymentUrl: string
  serviceId: ServiceId
  amount: string
  inputs: Record<string, string>
  createdAt: string
  expiresAt: string
  state: 'pending' | 'paid' | 'delivering' | 'completed' | 'failed'
  deliveryStartedAt?: string
  transaction?: string
  deliverable?: unknown
  error?: string
}

type OkxEnvelope<T> = { code?: string; msg?: string; data?: T | null }

type OkxPaymentCreate = {
  paymentId: string
  status: string
  createdAt: string
  expiresAt: string
  deliveries?: Array<{ type?: string; value?: string; description?: string }>
}

type OkxPaymentStatus = {
  paymentId: string
  status: string
  executed?: { txHash?: string; blockNumber?: number; blockTimestamp?: string }
  failure?: { reason?: string; message?: string }
}

const services: Record<ServiceId, { amount: string; title: string }> = {
  'okx-polymarket-lp-scout': { amount: '0.3', title: 'PolyDesk Polymarket LP Scout' },
  'worldcup-live-scores': { amount: '0.1', title: 'PolyDesk World Cup Live Scores' },
  'worldcup-market-news': { amount: '0.1', title: 'PolyDesk World Cup Market News' },
  'polymarket-portfolio-watch': { amount: '0.1', title: 'PolyDesk Polymarket Portfolio Watch' },
  'polymarket-funding-link': { amount: '0.1', title: 'PolyDesk Polymarket Funding Link' },
}

function clean(value: unknown, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
}

function env(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name], 1000)
    if (value) return value
  }
  return ''
}

function isServiceId(value: string): value is ServiceId {
  return Object.prototype.hasOwnProperty.call(services, value)
}

function cleanInputs(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(record).slice(0, 12).flatMap(([key, item]) => {
    const safeKey = clean(key, 40)
    const safeValue = clean(item, 300)
    return safeKey && safeValue ? [[safeKey, safeValue]] : []
  }))
}

function validateInputs(serviceId: ServiceId, inputs: Record<string, string>) {
  if ((serviceId === 'polymarket-portfolio-watch' || serviceId === 'polymarket-funding-link') && !/^0x[a-fA-F0-9]{40}$/.test(inputs.wallet ?? '')) {
    throw new Error('Provide a valid public Polymarket 0x wallet address.')
  }
  if (serviceId === 'polymarket-funding-link') {
    const amount = Number(inputs.amount)
    if (!Number.isFinite(amount) || amount < 3) throw new Error('Provide a funding amount of at least 3 USDC.')
  }
}

function okxCredentials() {
  const apiKey = env('OKX_PAYMENT_API_KEY', 'OKX_X402_API_KEY', 'OKX_API_KEY')
  const secretKey = env('OKX_PAYMENT_SECRET_KEY', 'OKX_X402_SECRET_KEY', 'OKX_SECRET_KEY')
  const passphrase = env('OKX_PAYMENT_PASSPHRASE', 'OKX_X402_PASSPHRASE', 'OKX_PASSPHRASE')
  if (!apiKey || !secretKey || !passphrase) throw new Error('OKX Open API credentials are not configured.')
  return { apiKey, secretKey, passphrase }
}

function okxHeaders(method: string, path: string, body = '') {
  const { apiKey, secretKey, passphrase } = okxCredentials()
  const timestamp = new Date().toISOString()
  const signature = createHmac('sha256', secretKey).update(`${timestamp}${method}${path}${body}`).digest('base64')
  return {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'OK-ACCESS-TIMESTAMP': timestamp,
  }
}

async function createOkxPayment(serviceId: ServiceId, externalId: string) {
  const service = services[serviceId]
  const recipient = env('OKX_X402_PAY_TO', 'OKX_X402_SELLER_ADDRESS', 'X402_SELLER_ADDRESS', 'TREASURY_ADDRESS')
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) throw new Error('OKX seller recipient is not configured.')
  const body = JSON.stringify({
    type: 'charge',
    amount: service.amount,
    symbol: 'USD₮0',
    recipient,
    description: service.title,
    externalId,
    expiresIn: CHECKOUT_TTL_SECONDS,
    realm: env('OKX_PAYMENT_REALM') || 'polydesk.trade',
    deliveries: { includeUrl: true },
  })
  const response = await fetch(`${OKX_API_ORIGIN}${OKX_CREATE_PAYMENT_PATH}`, {
    method: 'POST',
    headers: okxHeaders('POST', OKX_CREATE_PAYMENT_PATH, body),
    body,
  })
  const envelope = await response.json().catch(() => null) as OkxEnvelope<OkxPaymentCreate> | null
  if (!response.ok || envelope?.code !== '0' || !envelope.data?.paymentId) {
    throw new Error(envelope?.msg || `OKX payment creation failed with HTTP ${response.status}.`)
  }
  const paymentUrl = envelope.data.deliveries?.find(item => item.type === 'url' && /^https:\/\//i.test(item.value ?? ''))?.value
  if (!paymentUrl) throw new Error('OKX created the payment but did not return a universal checkout URL.')
  return { ...envelope.data, paymentUrl }
}

async function getOkxPaymentStatus(paymentId: string) {
  const path = `/api/v6/pay/a2a/p/${encodeURIComponent(paymentId)}/status`
  const response = await fetch(`${OKX_API_ORIGIN}${path}`, { headers: { Accept: 'application/json' } })
  const envelope = await response.json().catch(() => null) as OkxEnvelope<OkxPaymentStatus> | null
  if (!response.ok || envelope?.code !== '0' || !envelope.data) {
    throw new Error(envelope?.msg || `OKX payment status failed with HTTP ${response.status}.`)
  }
  if (envelope.data.paymentId !== paymentId) throw new Error('OKX returned a mismatched payment identifier.')
  return envelope.data
}

function durableKey(paymentId: string) {
  return `okx-marketplace-checkout:${paymentId}`
}

async function captureHandler(handler: (req: Request, res: ExpressResponse) => unknown, intent: MarketplaceIntent) {
  let statusCode = 200
  let responseBody: unknown
  const headers = new Map<string, unknown>()
  const fakeResponse = {
    status(code: number) { statusCode = code; return this },
    setHeader(name: string, value: unknown) { headers.set(name.toLowerCase(), value); return this },
    getHeader(name: string) { return headers.get(name.toLowerCase()) },
    json(value: unknown) { responseBody = value; return this },
    send(value: unknown) { responseBody = value; return this },
  } as unknown as ExpressResponse
  const fakeRequest = {
    method: 'POST',
    query: intent.inputs,
    body: intent.inputs,
    headers: { 'x-buyer-agent': 'okx-agentic-wallet' },
  } as unknown as Request
  await handler(fakeRequest, fakeResponse)
  if (statusCode < 200 || statusCode >= 300) {
    const error = responseBody && typeof responseBody === 'object' ? clean((responseBody as { error?: unknown }).error) : ''
    throw new Error(error || `Service delivery failed with HTTP ${statusCode}.`)
  }
  return responseBody
}

async function deliverService(intent: MarketplaceIntent, status: OkxPaymentStatus) {
  const payment = {
    verified: true,
    payer: 'okx-agentic-wallet',
    amount: String(Math.round(Number(intent.amount) * 1_000_000)),
    network: 'X Layer',
    transaction: status.executed?.txHash,
    asset: 'USDT',
    provider: 'OKX Agent Payments Protocol',
    kind: 'okx_agent_payments_x402' as const,
    seller: env('OKX_X402_PAY_TO', 'OKX_X402_SELLER_ADDRESS', 'X402_SELLER_ADDRESS', 'TREASURY_ADDRESS'),
    serviceUrl: `/api/a2mcp/${intent.serviceId}`,
  }
  if (intent.serviceId === 'worldcup-live-scores') return getPolyStreamFeed(intent.inputs.date ?? '')
  if (intent.serviceId === 'worldcup-market-news') return getPolyWorldcupNewsFeed()
  if (intent.serviceId === 'polymarket-portfolio-watch') return captureHandler(a2mcpPolymarketPortfolioWatchHandler, intent)
  if (intent.serviceId === 'polymarket-funding-link') return captureHandler(a2mcpPolymarketFundingLinkHandler, intent)
  const request = {
    method: 'GET',
    query: intent.inputs,
    body: intent.inputs,
    headers: { 'x-buyer-agent': 'okx-agentic-wallet' },
    payment,
  } as unknown as Parameters<typeof scoutResponse>[0]
  return scoutResponse(request)
}

async function createCheckout(req: Request, res: Response) {
  if (!hasRenderDurableStore()) return res.status(503).json({ ok: false, error: 'Marketplace checkout storage is not configured.' })
  const serviceId = clean(req.body?.serviceId, 80)
  if (!isServiceId(serviceId)) return res.status(400).json({ ok: false, error: 'Unknown OKX marketplace service.' })
  const inputs = cleanInputs(req.body?.inputs)
  try {
    validateInputs(serviceId, inputs)
    const externalId = `pd-${randomUUID()}`
    const payment = await createOkxPayment(serviceId, externalId)
    const intent: MarketplaceIntent = {
      version: 1,
      paymentId: payment.paymentId,
      externalId,
      paymentUrl: payment.paymentUrl,
      serviceId,
      amount: services[serviceId].amount,
      inputs,
      createdAt: payment.createdAt || new Date().toISOString(),
      expiresAt: payment.expiresAt || new Date(Date.now() + CHECKOUT_TTL_SECONDS * 1000).toISOString(),
      state: 'pending',
    }
    await writeDurableJson(durableKey(payment.paymentId), intent)
    return res.json({
      ok: true,
      checkout: {
        paymentId: payment.paymentId,
        paymentUrl: payment.paymentUrl,
        status: payment.status || 'pending',
        amount: intent.amount,
        asset: 'USDT',
        network: 'X Layer',
        expiresAt: intent.expiresAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create OKX checkout.'
    return res.status(/valid|unknown|provide/i.test(message) ? 400 : 502).json({ ok: false, error: message })
  }
}

async function checkoutStatus(req: Request, res: Response) {
  const paymentId = clean(req.body?.paymentId, 120)
  if (!/^a2a_[A-Za-z0-9_-]{12,100}$/.test(paymentId)) return res.status(400).json({ ok: false, error: 'Invalid OKX payment identifier.' })
  try {
    const intent = await readDurableJson<MarketplaceIntent>(durableKey(paymentId))
    if (!intent || intent.paymentId !== paymentId) return res.status(404).json({ ok: false, error: 'Marketplace checkout not found.' })
    if (intent.state === 'completed' && intent.deliverable !== undefined) {
      return res.json({ ok: true, status: 'completed', transaction: intent.transaction, deliverable: intent.deliverable })
    }
    const paymentStatus = await getOkxPaymentStatus(paymentId)
    if (paymentStatus.status === 'failed' || paymentStatus.status === 'expired' || paymentStatus.status === 'cancelled') {
      const error = clean(paymentStatus.failure?.message) || `OKX payment ${paymentStatus.status}.`
      await writeDurableJson(durableKey(paymentId), { ...intent, state: 'failed', error })
      return res.status(402).json({ ok: false, status: paymentStatus.status, error })
    }
    if (paymentStatus.status !== 'completed') {
      return res.json({ ok: true, status: paymentStatus.status, expiresAt: intent.expiresAt })
    }

    const locked = await mutateDurableJson<MarketplaceIntent>(durableKey(paymentId), current => {
      if (!current) throw new Error('Marketplace checkout disappeared before delivery.')
      if (current.state === 'completed' || (current.state === 'delivering' && Date.now() - Date.parse(current.deliveryStartedAt ?? '') < DELIVERY_LOCK_MS)) return current
      return { ...current, state: 'delivering', deliveryStartedAt: new Date().toISOString(), transaction: paymentStatus.executed?.txHash }
    })
    if (locked.state === 'completed' && locked.deliverable !== undefined) {
      return res.json({ ok: true, status: 'completed', transaction: locked.transaction, deliverable: locked.deliverable })
    }
    if (locked.state === 'delivering' && locked.deliveryStartedAt && Date.now() - Date.parse(locked.deliveryStartedAt) < DELIVERY_LOCK_MS - 1000) {
      const originalStart = intent.deliveryStartedAt
      if (originalStart && originalStart === locked.deliveryStartedAt) return res.json({ ok: true, status: 'delivering' })
    }

    try {
      const deliverable = await deliverService(locked, paymentStatus)
      const completed: MarketplaceIntent = { ...locked, state: 'completed', transaction: paymentStatus.executed?.txHash, deliverable, error: undefined }
      await writeDurableJson(durableKey(paymentId), completed)
      return res.json({ ok: true, status: 'completed', transaction: completed.transaction, deliverable })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paid service delivery failed.'
      await writeDurableJson(durableKey(paymentId), { ...locked, state: 'paid', error: message })
      return res.status(502).json({ ok: false, status: 'paid', error: `${message} Your OKX payment is recorded; retry delivery without paying again.` })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not check OKX checkout.'
    return res.status(502).json({ ok: false, error: message })
  }
}

export default async function okxMarketplaceCheckoutHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  const action = clean(req.body?.action, 20)
  if (action === 'create') return createCheckout(req, res)
  if (action === 'status') return checkoutStatus(req, res)
  return res.status(400).json({ ok: false, error: 'Use action=create or action=status.' })
}
