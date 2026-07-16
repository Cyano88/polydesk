import type { Request, Response } from 'express'
import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import {
  x402HTTPResourceServer,
  x402ResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type RoutesConfig,
} from '@okxweb3/x402-core/server'
import type { PaymentPayload, PaymentRequirements } from '@okxweb3/x402-core/types'
import { registerExactEvmScheme } from '@okxweb3/x402-evm/exact/server'
import { scoutResponse } from './x402-polymarket-scout.js'

const OKX_XLAYER_NETWORK = 'eip155:196'
const OKX_XLAYER_USDT = '0x779ded0c9e1022225f8e0630b35a9b54be713736'
const DEFAULT_PRICE = '0.3'

let okxHttpServerPromise: Promise<x402HTTPResourceServer> | undefined

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function env(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name])
    if (value.toLowerCase() === 'undefined' || value.toLowerCase() === 'null') continue
    if (value) return value
  }
  return ''
}

function publicOrigin(req: Request) {
  const forwardedProto = clean(req.headers['x-forwarded-proto'])
  const forwardedHost = clean(req.headers['x-forwarded-host'])
  const host = forwardedHost || clean(req.headers.host)
  if (host) return `${forwardedProto || req.protocol || 'https'}://${host}`
  return env('PUBLIC_APP_URL', 'RENDER_EXTERNAL_URL') || 'https://polydesk-i96m.onrender.com'
}

function requestUrl(req: Request) {
  return `${publicOrigin(req)}${req.originalUrl || req.url}`
}

function routePath(req: Request) {
  return new URL(requestUrl(req)).pathname
}

function getHeader(req: Request, name: string) {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? clean(value[0]) : value === undefined ? undefined : clean(value)
}

function adapterForRequest(req: Request): HTTPAdapter {
  return {
    getHeader: name => getHeader(req, name),
    getMethod: () => req.method,
    getPath: () => routePath(req),
    getUrl: () => requestUrl(req),
    getAcceptHeader: () => getHeader(req, 'accept') || '',
    getUserAgent: () => getHeader(req, 'user-agent') || '',
    getQueryParams: () => {
      const params: Record<string, string | string[]> = {}
      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value)) params[key] = value.map(item => clean(item))
        else if (value !== undefined) params[key] = clean(value)
      }
      return params
    },
    getQueryParam: name => {
      const value = req.query[name]
      if (Array.isArray(value)) return value.map(item => clean(item))
      return value === undefined ? undefined : clean(value)
    },
    getBody: () => req.body,
  }
}

function decimalUsdtToAtomic(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid OKX x402 price: ${amount}`)
  return String(Math.round(amount * 1_000_000))
}

function payerFromPayload(paymentPayload: PaymentPayload) {
  const payload = paymentPayload.payload as Record<string, unknown>
  const authorization = payload.authorization as Record<string, unknown> | undefined
  const permit2 = payload.permit2Authorization as Record<string, unknown> | undefined
  return clean(authorization?.from || permit2?.from || permit2?.owner || 'okx-buyer')
}

function normalizeSupportedResponse(value: unknown) {
  const raw = value as { kinds?: unknown; extensions?: unknown; signers?: unknown } | unknown[]
  if (Array.isArray(raw)) return { kinds: raw, extensions: [], signers: {} }
  const kinds = Array.isArray(raw?.kinds) ? raw.kinds : []
  return {
    kinds,
    extensions: Array.isArray(raw?.extensions) ? raw.extensions : [],
    signers: raw?.signers && typeof raw.signers === 'object' ? raw.signers as Record<string, string[]> : {},
  }
}

async function getOkxHttpServer(req: Request) {
  if (!okxHttpServerPromise) {
    okxHttpServerPromise = (async () => {
      const apiKey = env('OKX_X402_API_KEY', 'OKX_API_KEY')
      const secretKey = env('OKX_X402_SECRET_KEY', 'OKX_SECRET_KEY')
      const passphrase = env('OKX_X402_PASSPHRASE', 'OKX_PASSPHRASE')
      if (!apiKey || !secretKey || !passphrase) {
        throw new Error('OKX_X402_API_KEY, OKX_X402_SECRET_KEY, and OKX_X402_PASSPHRASE are required for OKX SDK x402 settlement')
      }

      const okxBaseUrl = env('OKX_X402_BASE_URL')
      const facilitator = new OKXFacilitatorClient({
        apiKey,
        secretKey,
        passphrase,
        ...(okxBaseUrl && /^https?:\/\//i.test(okxBaseUrl) ? { baseUrl: okxBaseUrl } : {}),
        syncSettle: env('OKX_X402_SYNC_SETTLE') === 'true',
      })
      const supported = normalizeSupportedResponse(await facilitator.getSupported())
      if (!supported.kinds.length) {
        throw new Error('OKX facilitator returned no supported x402 payment kinds. Check that the Render OKX API key has Payment API access.')
      }
      const facilitatorWithNormalizedSupported = {
        verify: facilitator.verify.bind(facilitator),
        settle: facilitator.settle.bind(facilitator),
        getSettleStatus: facilitator.getSettleStatus.bind(facilitator),
        getSupported: async () => supported,
      }

      const resourceServer = new x402ResourceServer(facilitatorWithNormalizedSupported)
      registerExactEvmScheme(resourceServer)

      const payTo = env('OKX_X402_PAY_TO', 'OKX_X402_SELLER_ADDRESS', 'X402_SELLER_ADDRESS', 'TREASURY_ADDRESS')
      if (!payTo) throw new Error('OKX_X402_PAY_TO is required for OKX A2MCP x402 settlement')
      const price = env('OKX_X402_POLYMARKET_LP_SCOUT_PRICE') || DEFAULT_PRICE
      const resource = `${publicOrigin(req)}/api/a2mcp/okx/polymarket-lp-scout`
      const routes: RoutesConfig = {
        'GET /api/a2mcp/okx/polymarket-lp-scout': {
          accepts: {
            scheme: 'exact',
            network: OKX_XLAYER_NETWORK,
            payTo,
            price: {
              amount: decimalUsdtToAtomic(Number(price)),
              asset: OKX_XLAYER_USDT,
              extra: {
                assetTransferMethod: 'permit2',
                tokenSymbol: 'USDT',
                decimals: 6,
                name: 'USDT',
                version: '1',
              },
            },
            maxTimeoutSeconds: 600,
            extra: {
              assetTransferMethod: 'permit2',
              tokenSymbol: 'USDT',
              decimals: 6,
              name: 'USDT',
              version: '1',
            },
          },
          resource,
          description: 'PolyDesk LP Scout report for buyer agents on OKX.AI.',
          mimeType: 'application/json',
          extensions: {
            serviceName: 'PolyDesk LP Scout',
            tags: ['polymarket', 'lp-scout', 'prediction-market'],
          },
          unpaidResponseBody: () => ({
            contentType: 'application/json',
            body: {
              ok: false,
              error: 'payment_required',
              service: 'PolyDesk LP Scout',
              protocol: 'OKX Agent Payments Protocol',
              payment: {
                network: 'X Layer',
                asset: 'USDT',
                amount: price,
              },
              message: 'Pay this x402 challenge from an OKX Agentic Wallet, then replay the same request with the payment header.',
            },
          }),
        },
      }

      const httpServer = new x402HTTPResourceServer(resourceServer, routes)
      await httpServer.initialize()
      return httpServer
    })().catch(err => {
      okxHttpServerPromise = undefined
      throw err
    })
  }
  return okxHttpServerPromise
}

function sendInstructions(res: Response, response: { status: number; headers: Record<string, string>; body?: unknown }) {
  for (const [key, value] of Object.entries(response.headers)) res.setHeader(key, value)
  return res.status(response.status).send(response.body)
}

export default async function okxA2mcpPolymarketLpScoutHandler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const httpServer = await getOkxHttpServer(req)
    const adapter = adapterForRequest(req)
    const context: HTTPRequestContext = {
      adapter,
      path: routePath(req),
      method: req.method,
    }
    const paymentResult = await httpServer.processHTTPRequest(context)
    if (paymentResult.type === 'payment-error') return sendInstructions(res, paymentResult.response)
    if (paymentResult.type === 'no-payment-required') {
      return res.status(500).json({ ok: false, error: 'OKX x402 route is not protected' })
    }

    const settlement = await httpServer.processSettlement(
      paymentResult.paymentPayload,
      paymentResult.paymentRequirements,
      paymentResult.declaredExtensions,
      { request: context },
    )
    if (!settlement.success) return sendInstructions(res, settlement.response)

    const paymentRequirements = paymentResult.paymentRequirements as PaymentRequirements
    const paidReq = req as Request & {
      payment?: {
        verified: boolean
        payer: string
        amount: string
        network: string
        transaction?: string
        asset?: string
        provider?: string
        kind?: 'okx_agent_payments_x402'
        seller?: string
        serviceUrl?: string
      }
    }
    paidReq.payment = {
      verified: true,
      payer: settlement.payer || payerFromPayload(paymentResult.paymentPayload),
      amount: settlement.amount || paymentRequirements.amount,
      network: 'X Layer',
      transaction: settlement.transaction,
      asset: 'USDT',
      provider: 'OKX Agent Payments Protocol',
      kind: 'okx_agent_payments_x402',
      seller: paymentRequirements.payTo,
      serviceUrl: '/api/a2mcp/okx/polymarket-lp-scout',
    }

    for (const [key, value] of Object.entries(settlement.headers)) res.setHeader(key, value)
    return res.json(await scoutResponse(paidReq))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OKX A2MCP x402 route unavailable'
    const status = /OKX_X402_|OKX API|private key|RPC/i.test(message) ? 503 : 500
    return res.status(status).json({ ok: false, error: message })
  }
}
