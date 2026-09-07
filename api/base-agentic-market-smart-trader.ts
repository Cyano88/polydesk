import type { Request, Response } from 'express'
import { createCdpFacilitatorClient } from '@coinbase/cdp-sdk/x402'
import {
  x402HTTPResourceServer,
  x402ResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type RouteConfig,
  type RoutesConfig,
} from '@x402/core/server'
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types'
import { BasePaymentAttempts, ExistingBasePaymentAttempt, basePaymentAttemptBinding } from './base-payment-attempt.js'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar'
import polymarketSmartTraderHandler, {
  checkPolymarketSmartTraderOperational,
  polymarketSmartTraderReady,
} from './polymarket-smart-trader.js'
import {
  preflightSmartTraderBeforeSettlement,
  smartTraderRequestInput,
} from './okx-a2mcp-standard-services.js'

export const BASE_AGENTIC_MARKET_SMART_TRADER_PATH = '/api/x402/base/polymarket-smart-trader'
export const BASE_MAINNET_CAIP2 = 'eip155:8453'
export const BASE_SMART_TRADER_PRICE_USDC = '$0.30'
// Circle native USDC, also verified against the installed @x402/evm asset registry.
export const BASE_NATIVE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

const description = 'Evidence-backed Polymarket market analysis with a durable bounded decision and a separately approved Onchain OS execution handoff.'

const inputProperties = {
  action: {
    type: 'string',
    enum: ['ANALYZE', 'REVIEW', 'PREPARE', 'INDEPENDENT_PREPARE'],
    description: 'ANALYZE buys research. REVIEW returns free exact-market evidence without AI. PREPARE uses an approved receipt. INDEPENDENT_PREPARE requires your own acknowledged exact-market decision.',
  },
  independentOrder: { type: 'object', description: 'For INDEPENDENT_PREPARE: acknowledged exact-market request from GET /api/polymarket-independent/prepare. No analysis payment required.' },
  query: { type: 'string', maxLength: 180 },
  marketId: { type: 'string', minLength: 1, maxLength: 320 },
  outcome: { type: 'string', minLength: 1, maxLength: 100 },
  side: { type: 'string', enum: ['BUY', 'SELL'] },
  decisionId: { type: 'string', pattern: '^pstd_[a-f0-9]{24,64}$' },
  amountUsdc: { type: 'number', exclusiveMinimum: 0 },
  shares: { type: 'number', exclusiveMinimum: 0 },
  orderType: { type: 'string', enum: ['FOK', 'FAK', 'GTC', 'GTD'] },
  limitPrice: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 },
  expiresAt: { type: 'integer', exclusiveMinimum: 0 },
  postOnly: { type: 'boolean' },
  limit: { type: 'integer', minimum: 1, maximum: 10 },
  category: { type: 'string', maxLength: 50 },
  mandate: { type: 'object' },
  smartMoneyWallets: {
    type: 'array',
    maxItems: 10,
    items: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
  },
} as const

export function baseSmartTraderDiscoveryExtension() {
  return declareDiscoveryExtension({
    input: {
      action: 'ANALYZE',
      query: 'Find active liquid Polymarket markets about football',
      side: 'BUY',
    },
    inputSchema: {
      type: 'object',
      properties: inputProperties,
      required: ['action'],
      additionalProperties: false,
    },
    bodyType: 'json',
    output: {
      example: {
        ok: true,
        action: 'ANALYZE',
        status: 'accepted',
        paymentStatus: 'settled',
        statusUrl: '/api/a2mcp/polymarket-smart-trader/payment/0x...',
      },
    },
  })
}

export function buildBaseSmartTraderRouteConfig(origin: string, payTo: string): RouteConfig {
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) throw new Error('BASE_X402_PAY_TO must be a valid EVM address')
  return {
    accepts: {
      scheme: 'exact',
      network: BASE_MAINNET_CAIP2,
      payTo: payTo as `0x${string}`,
      price: BASE_SMART_TRADER_PRICE_USDC,
      maxTimeoutSeconds: 600,
    },
    resource: `${origin.replace(/\/+$/, '')}${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}`,
    description,
    mimeType: 'application/json',
    extensions: baseSmartTraderDiscoveryExtension(),
    unpaidResponseBody: () => ({
      contentType: 'application/json',
      body: {
        ok: false,
        error: 'payment_required',
        service: 'PolyDesk Polymarket Decision',
        payment: { network: 'Base', asset: 'USDC', amount: '0.30' },
        message: 'Approve the service payment, replay the same request, then separately approve any resulting Polymarket trade.',
      },
    }),
  }
}

let baseServerPromise: Promise<x402HTTPResourceServer> | undefined

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function configuredOrigin(req: Request) {
  const configured = clean(process.env.PUBLIC_APP_URL)
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '')
  const protocol = clean(req.headers['x-forwarded-proto']).split(',')[0] || req.protocol || 'https'
  const host = clean(req.headers['x-forwarded-host']).split(',')[0] || clean(req.headers.host).split(',')[0]
  return host ? `${protocol}://${host}` : 'https://polydesk.trade'
}

function adapterForRequest(req: Request): HTTPAdapter {
  const header = (name: string) => {
    const value = req.headers[name.toLowerCase()]
    return Array.isArray(value) ? clean(value[0]) : value === undefined ? undefined : clean(value)
  }
  return {
    getHeader: header,
    getMethod: () => req.method,
    getPath: () => BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
    getUrl: () => `${configuredOrigin(req)}${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}`,
    getAcceptHeader: () => header('accept') || '',
    getUserAgent: () => header('user-agent') || '',
    getQueryParams: () => Object.fromEntries(Object.entries(req.query).map(([key, value]) => [key, clean(value)])),
    getQueryParam: name => {
      const value = req.query[name]
      return Array.isArray(value) ? value.map(clean) : value === undefined ? undefined : clean(value)
    },
    getBody: () => req.body,
  }
}

async function getBaseServer(req: Request) {
  if (!baseServerPromise) {
    baseServerPromise = (async () => {
      const apiKeyId = clean(process.env.CDP_API_KEY_ID || process.env.BASE_X402_CDP_API_KEY_ID)
      const apiKeySecret = clean(process.env.CDP_API_KEY_SECRET || process.env.BASE_X402_CDP_API_KEY_SECRET)
      const payTo = clean(process.env.BASE_X402_PAY_TO)
      if (!apiKeyId || !apiKeySecret) throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for Base x402 settlement')
      const facilitator = createCdpFacilitatorClient({ apiKeyId, apiKeySecret })
      const resourceServer = new x402ResourceServer(facilitator)
        .register(BASE_MAINNET_CAIP2, new ExactEvmScheme())
        .registerExtension(bazaarResourceServerExtension)
      const routes: RoutesConfig = {
        [`POST ${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}`]: buildBaseSmartTraderRouteConfig(configuredOrigin(req), payTo),
      }
      const server = new x402HTTPResourceServer(resourceServer, routes)
      await server.initialize()
      return server
    })().catch(error => {
      baseServerPromise = undefined
      throw error
    })
  }
  return baseServerPromise
}

function payerFromPayload(paymentPayload: PaymentPayload) {
  const payload = paymentPayload.payload as Record<string, unknown>
  const authorization = payload.authorization as Record<string, unknown> | undefined
  const permit2 = payload.permit2Authorization as Record<string, unknown> | undefined
  return clean(authorization?.from || permit2?.from || permit2?.owner)
}

export function verifyBaseServiceRequirements(requirements: PaymentRequirements, payload: PaymentPayload, seller: string) {
  const payer = payerFromPayload(payload)
  if (requirements.scheme !== 'exact' || requirements.network !== BASE_MAINNET_CAIP2
    || requirements.asset.toLowerCase() !== BASE_NATIVE_USDC.toLowerCase()
    || requirements.amount !== '300000' || !/^0x[a-fA-F0-9]{40}$/.test(seller)
    || requirements.payTo.toLowerCase() !== seller.toLowerCase()
    || !/^0x[a-fA-F0-9]{40}$/.test(payer)) {
    throw new Error('Base service payment requirements do not match this service.')
  }
  return payer
}

export function verifiedBaseServicePayment(
  requirements: PaymentRequirements, payload: PaymentPayload, seller: string,
  settlement: { success: boolean; network: string; transaction: string; payer?: string; amount?: string; errorReason?: string; errorMessage?: string },
) {
  const payer = verifyBaseServiceRequirements(requirements, payload, seller)
  if (settlement.success !== true || settlement.network !== BASE_MAINNET_CAIP2
    || !/^0x[a-fA-F0-9]{64}$/.test(settlement.transaction) || /^0x0{64}$/.test(settlement.transaction)
    || (settlement.payer !== undefined && settlement.payer.toLowerCase() !== payer.toLowerCase())
    || (settlement.amount !== undefined && settlement.amount !== requirements.amount)
    || settlement.errorReason || settlement.errorMessage) {
    throw new Error('Base settlement is unresolved or conflicts with the verified payment.')
  }
  return { verified: true, payer, amount: requirements.amount, network: 'Base', transaction: settlement.transaction,
    asset: 'USDC', provider: 'CDP x402', seller: requirements.payTo, serviceUrl: BASE_AGENTIC_MARKET_SMART_TRADER_PATH }
}

type BaseHandlerDependencies = {
  attempts: BasePaymentAttempts
  server: (req: Request) => Promise<Pick<x402HTTPResourceServer, 'processHTTPRequest' | 'processSettlement'>>
  preflight: typeof preflightSmartTraderBeforeSettlement
  ready: () => boolean
  operational: () => Promise<boolean>
  seller: () => string
  deliver: typeof polymarketSmartTraderHandler
}

function sendInstructions(res: Response, response: { status: number; headers: Record<string, string>; body?: unknown }) {
  for (const [key, value] of Object.entries(response.headers)) res.setHeader(key, value)
  return res.status(response.status).send(response.body)
}

export function createBaseAgenticMarketSmartTraderHandler(overrides: Partial<BaseHandlerDependencies> = {}) {
 const dependencies: BaseHandlerDependencies = { attempts: new BasePaymentAttempts(), server: getBaseServer, preflight: preflightSmartTraderBeforeSettlement,
   ready: polymarketSmartTraderReady, operational: checkPolymarketSmartTraderOperational,
   seller: () => clean(process.env.BASE_X402_PAY_TO), deliver: polymarketSmartTraderHandler, ...overrides }
 return async function baseAgenticMarketSmartTraderHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Use POST for the Base Agentic Market service.' })
  }
  const body = smartTraderRequestInput(req)
  req.body = body
  const hasPaymentProof = Boolean(req.headers['payment-signature'] || req.headers['x-payment'])
  if (Object.keys(body).length > 0 || hasPaymentProof) {
    const preflight = await dependencies.preflight(body)
    if (!preflight.ok) return res.status(preflight.status).json(preflight.body)
    if (preflight.prepared) {
      res.setHeader('X-PolyDesk-Workflow-Included', clean(body.action).toUpperCase())
      return res.status(preflight.prepared.status).json(preflight.prepared.data)
    }
  }
  if (!dependencies.ready() || !await dependencies.operational()) {
    return res.status(503).json({ ok: false, error: 'This paid service is not ready. No payment challenge was issued.' })
  }

  let settlementAttempted = false
  let settlementVerified = false
  let paymentAttemptId: string | undefined
  try {
    const server = await dependencies.server(req)
    const context: HTTPRequestContext = {
      adapter: adapterForRequest(req),
      path: BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
      method: req.method,
    }
    const paymentResult = await server.processHTTPRequest(context)
    if (paymentResult.type === 'payment-error') return sendInstructions(res, paymentResult.response)
    if (paymentResult.type === 'no-payment-required') {
      return res.status(500).json({ ok: false, error: 'Base x402 route is not protected' })
    }
    const requirements = paymentResult.paymentRequirements as PaymentRequirements
    const seller = dependencies.seller()
    const payer = verifyBaseServiceRequirements(requirements, paymentResult.paymentPayload, seller)
    const binding = basePaymentAttemptBinding(body, requirements, paymentResult.paymentPayload, payer)
    paymentAttemptId = binding.id
    res.setHeader('X-PolyDesk-Payment-Attempt-Id', paymentAttemptId)
    res.setHeader('X-PolyDesk-Payment-Recovery', `${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}/recover`)
    const claim = await dependencies.attempts.claim(binding)
    settlementAttempted = true
    const settlement = await server.processSettlement(
      paymentResult.paymentPayload,
      paymentResult.paymentRequirements,
      paymentResult.declaredExtensions,
      { request: context },
    )
    // An attempted settlement is not permission to present another charge.
    if (!settlement.success) return res.status(503).json({ ok: false,
      error: 'Settlement is unconfirmed. Reconcile this attempt; do not pay again.',
      paymentAttemptId, paymentStatus: 'unknown', settlementAttempted: true, retryPayment: false, recoveryRequired: true,
      recoveryUrl: `${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}/recover` })

    const paidReq = req as Request & { payment?: Record<string, unknown> }
    paidReq.payment = verifiedBaseServicePayment(requirements, paymentResult.paymentPayload, seller, settlement)
    settlementVerified = true
    await dependencies.attempts.settled(claim, settlement.transaction)
    for (const [key, value] of Object.entries(settlement.headers)) res.setHeader(key, value)
    return await dependencies.deliver(paidReq, res)
  } catch (error) {
    if (error instanceof ExistingBasePaymentAttempt) {
      return res.status(409).json({ ok: false, error: 'This payment authorization has an existing attempt. Reconcile it; do not pay again.',
        paymentAttemptId: error.attemptId, paymentStatus: error.paymentState, settlementAttempted: false,
        retryPayment: false, recoveryRequired: true, recoveryUrl: `${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}/recover` })
    }
    return res.status(503).json({ ok: false, error: 'Base service verification or delivery failed. Inspect the existing payment before continuing.',
      settlementAttempted, paymentStatus: settlementVerified ? 'settled_delivery_unconfirmed' : settlementAttempted ? 'unknown' : 'not_attempted',
      paymentAttemptId, retryPayment: false, recoveryRequired: settlementAttempted || Boolean(paymentAttemptId),
      ...(paymentAttemptId ? { recoveryUrl: `${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}/recover` } : {}) })
  }
 }
}

export default createBaseAgenticMarketSmartTraderHandler()
