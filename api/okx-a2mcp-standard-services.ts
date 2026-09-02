import type { Request, Response } from 'express'
import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import {
  x402HTTPResourceServer,
  x402ResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type RouteConfig,
  type RoutesConfig,
} from '@okxweb3/x402-core/server'
import type { PaymentPayload, PaymentRequirements } from '@okxweb3/x402-core/types'
import { registerExactEvmScheme } from '@okxweb3/x402-evm/exact/server'
import { recordDeliveredOkxCall } from './okx-rewards.js'
import a2mcpPolymarketFundingLinkHandler from './a2mcp-polymarket-funding-link.js'
import a2mcpPolymarketGovernedOpenHandler, {
  evaluateGovernedOpenInput,
  governedOpenReady,
} from './a2mcp-polymarket-governed-open.js'
import a2mcpPolymarketPortfolioWatchHandler from './a2mcp-polymarket-portfolio-watch.js'
import polymarketAgentFlowHandler, { flowDescriptor } from './polymarket-agent-flow.js'
import polymarketSmartTraderHandler, {
  checkPolymarketSmartTraderOperational,
  polymarketSmartTraderReady,
  preflightPolymarketSmartTraderProviders,
  preflightPolymarketSmartTraderRequest,
  runPolymarketSmartTrader,
} from './polymarket-smart-trader.js'
import polyWorldcupNewsHandler, { getPolyWorldcupNewsFeed, requestFootballNewsQuery } from './poly-worldcup-news.js'
import polyStreamHandler, { getPolyStreamFeed, requestTeam } from './poly-stream.js'

const OKX_XLAYER_NETWORK = 'eip155:196'
const OKX_XLAYER_USDT = '0x779ded0c9e1022225f8e0630b35a9b54be713736'
const DEFAULT_STANDARD_PRICE = '0.1'
const DEFAULT_SMART_TRADER_PRICE = '0.3'

const footballLiveBodyProperties = {
  team: {
    type: 'string',
    minLength: 2,
    maxLength: 100,
    description: 'Optional exact club or national-team name. Unsupported teams return a non-billable not-found response.',
  },
  date: {
    type: 'string',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description: 'Optional UTC fixture date in YYYY-MM-DD format. Defaults to today.',
  },
} as const

const footballNewsBodyProperties = {
  team: {
    type: 'string',
    minLength: 2,
    maxLength: 100,
    description: 'Optional exact team name. If no relevant provider article exists, no payment challenge is issued.',
  },
  league: {
    type: 'string',
    minLength: 2,
    maxLength: 100,
    description: 'Optional league name, such as La Liga.',
  },
  type: {
    type: 'string',
    enum: ['pre-match', 'post-match', 'all'],
    description: 'Select previews, recaps, or both. Defaults to all.',
  },
} as const

const fundingLinkBodyProperties = {
  ownerAddress: {
    type: 'string',
    pattern: '^0x[a-fA-F0-9]{40}$',
    description: 'Owner EOA that controls the Polymarket account.',
  },
  requiredBalanceUsdc: {
    type: 'string',
    pattern: '^[0-9]+(?:\\.[0-9]{1,6})?$',
    description: 'Target pUSD balance required before the intended Polymarket action.',
  },
  network: {
    type: 'string',
    enum: ['base', 'arbitrum'],
    description: 'Source network for the hosted USDC funding checkout.',
  },
  agent: {
    type: 'string',
    maxLength: 80,
    description: 'Optional calling-agent label included in the checkout metadata.',
  },
} as const

const fundingLinkRequiredFields = ['ownerAddress', 'requiredBalanceUsdc'] as const

const governedTraderBodyProperties = {
  externalOrderId: {
    type: 'string',
    minLength: 1,
    maxLength: 80,
    description: 'Caller-generated idempotency key for this exact governed order.',
  },
  marketUrl: {
    type: 'string',
    format: 'uri',
    description: 'Canonical polymarket.com event URL.',
  },
  marketTitle: { type: 'string', minLength: 1, maxLength: 240 },
  outcome: { type: 'string', minLength: 1, maxLength: 120 },
  tokenId: {
    type: 'string',
    pattern: '^[0-9]+$',
    description: 'Exact Polymarket outcome token ID.',
  },
  signer: {
    type: 'string',
    pattern: '^0x[a-fA-F0-9]{40}$',
    description: 'Buyer signer bound by the mandate and signed order.',
  },
  orderType: { type: 'string', enum: ['FAK', 'FOK'] },
  order: {
    type: 'object',
    description: 'Exact buyer-signed Polymarket order.',
  },
  orderPayload: {
    type: 'object',
    description: 'Exact payload the buyer agent will submit directly to Polymarket.',
  },
  mandate: {
    type: 'object',
    description: 'Short-lived deterministic spending mandate and authority signature.',
  },
} as const

const governedTraderRequiredFields = [
  'externalOrderId',
  'marketUrl',
  'marketTitle',
  'outcome',
  'tokenId',
  'signer',
  'orderType',
  'order',
  'orderPayload',
  'mandate',
] as const

const portfolioWatchBodyProperties = {
  action: {
    type: 'string',
    enum: ['DESCRIBE', 'WATCH', 'PREPARE'],
    description: 'DESCRIBE returns the complete governed flow. WATCH inspects a public wallet. PREPARE selects and prepares a bounded buyer-controlled action.',
  },
  wallet: {
    type: 'string',
    pattern: '^0x[a-fA-F0-9]{40}$',
    description: 'Public Polymarket wallet to inspect. This wallet never authorizes the buyer trade.',
  },
  ownerAddress: {
    type: 'string',
    pattern: '^0x[a-fA-F0-9]{40}$',
    description: 'Buyer owner EOA used for account-readiness checks during PREPARE.',
  },
  selectionMode: {
    type: 'string',
    enum: ['POSITION', 'TRADE', 'AUTO_BEST_FIT'],
  },
  maxSpendUsdc: {
    type: 'string',
    pattern: '^[0-9]+(?:\\.[0-9]{1,6})?$',
  },
} as const

const smartTraderBodyProperties = {
  action: {
    type: 'string',
    enum: ['ANALYZE', 'PREPARE'],
    description: 'ANALYZE is the single paid workflow gate and may discover by query before issuing a durable decision. PREPARE is included when authorized by that receipt.',
  },
  query: { type: 'string', maxLength: 180 },
  marketId: {
    type: 'string',
    minLength: 1,
    maxLength: 320,
    description: 'Canonical Polymarket URL, event slug, or 0x-prefixed condition ID.',
  },
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
  mandate: {
    type: 'object',
    description: 'Execution-quality, price-drift, and maximum-size bounds persisted into the decision receipt.',
  },
  smartMoneyWallets: {
    type: 'array',
    maxItems: 10,
    items: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
    description: 'Optional public wallets used as caller-supplied signals; they never receive the curated smart-money tag.',
  },
} as const

const smartTraderRequiredFields = ['action'] as const

function fundingLinkReplaySchema() {
  return {
    input: {
      ownerAddress: {
        ...fundingLinkBodyProperties.ownerAddress,
        required: true,
      },
      requiredBalanceUsdc: {
        ...fundingLinkBodyProperties.requiredBalanceUsdc,
        required: true,
      },
      network: fundingLinkBodyProperties.network,
      agent: fundingLinkBodyProperties.agent,
    },
    output: {
      type: 'json',
      description: 'Verified Deposit Wallet readiness and, when funding is required, a hosted checkout URL plus status URL.',
    },
  }
}

function governedTraderReplaySchema() {
  return {
    input: Object.fromEntries(
      Object.entries(governedTraderBodyProperties).map(([name, schema]) => [
        name,
        { ...schema, required: true },
      ]),
    ),
    output: {
      type: 'json',
      description: 'APPROVE decision proof, exact direct-submit payload, service-payment proof, and completion instructions.',
    },
  }
}

function portfolioWatchReplaySchema() {
  return {
    input: Object.fromEntries(
      Object.entries(portfolioWatchBodyProperties).map(([name, schema]) => [
        name,
        { ...schema, required: false },
      ]),
    ),
    output: {
      type: 'json',
      description: 'A machine-readable governed-trading flow, public-wallet watch result, or bounded preparation result. An empty replay returns the complete flow descriptor.',
    },
  }
}

function smartTraderReplaySchema() {
  const properties = Object.fromEntries(Object.entries(smartTraderBodyProperties).map(([name, schema]) => [
    name,
    { ...schema, required: smartTraderRequiredFields.includes(name as typeof smartTraderRequiredFields[number]) },
  ]))
  return {
    input: {
      type: 'http',
      method: 'POST',
      bodyType: 'json',
      body: {
        type: 'object',
        properties,
        required: smartTraderRequiredFields,
        additionalProperties: false,
      },
    },
    output: {
      type: 'json',
      description: 'Ranked discovery, evidence-backed durable decisions, or a preview-only OnchainOS trade handoff. It never signs or submits a trade.',
    },
  }
}

function governedTraderDiscoveryExtension() {
  return {
    bazaar: {
      info: {
        input: {
          type: 'http',
          method: 'POST',
          bodyType: 'json',
          body: {
            externalOrderId: 'caller:trade:unique-id',
            marketUrl: 'https://polymarket.com/event/example-market',
            marketTitle: 'Example market',
            outcome: 'Yes',
            tokenId: '123456789',
            signer: '0x1111111111111111111111111111111111111111',
            orderType: 'FAK',
            order: {},
            orderPayload: {},
            mandate: {},
          },
        },
        output: {
          type: 'json',
          example: {
            ok: true,
            decision: 'APPROVE',
            executionId: 'pex_example',
            nextAction: 'SUBMIT',
          },
        },
      },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: {
              type: { const: 'http' },
              method: { const: 'POST' },
              bodyType: { const: 'json' },
              body: {
                type: 'object',
                properties: governedTraderBodyProperties,
                required: governedTraderRequiredFields,
                additionalProperties: false,
              },
            },
            required: ['type', 'method', 'bodyType', 'body'],
            additionalProperties: false,
          },
          output: {
            type: 'object',
            properties: {
              type: { const: 'json' },
              example: { type: 'object' },
            },
            required: ['type', 'example'],
            additionalProperties: false,
          },
        },
        required: ['input', 'output'],
        additionalProperties: false,
      },
    },
  }
}

function fundingLinkDiscoveryExtension() {
  const inputExample = {
    ownerAddress: '0x1111111111111111111111111111111111111111',
    requiredBalanceUsdc: '5',
    network: 'base',
    agent: 'buyer-agent',
  }
  const outputExample = {
    ok: true,
    state: 'funding_required',
    depositWallet: '0x2222222222222222222222222222222222222222',
    shortfallUsdc: '5',
    checkoutUrl: 'https://pay.hashpaylink.com/example',
    fundingRequestId: 'pfr_example',
    statusUrl: 'https://polydesk.trade/api/polymarket/funding/pfr_example',
  }

  return {
    bazaar: {
      info: {
        input: {
          type: 'http',
          method: 'POST',
          bodyType: 'json',
          body: inputExample,
        },
        output: {
          type: 'json',
          example: outputExample,
        },
      },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: {
              type: { const: 'http' },
              method: { const: 'POST' },
              bodyType: { const: 'json' },
              body: {
                type: 'object',
                properties: fundingLinkBodyProperties,
                required: fundingLinkRequiredFields,
                additionalProperties: false,
              },
            },
            required: ['type', 'method', 'bodyType', 'body'],
            additionalProperties: false,
          },
          output: {
            type: 'object',
            properties: {
              type: { const: 'json' },
              example: { type: 'object' },
            },
            required: ['type', 'example'],
            additionalProperties: false,
          },
        },
        required: ['input', 'output'],
        additionalProperties: false,
      },
    },
  }
}

async function deliverMarketplacePortfolioService(req: Request, res: Response) {
  const body = isRecord(req.body) ? req.body : {}
  const hasBusinessInput = Object.keys(body).length > 0 || Object.keys(req.query || {}).length > 0
  if (req.method === 'GET' || !hasBusinessInput) {
    return res.status(200).json({
      ...flowDescriptor(req),
      marketplaceEndpoint: `${requestOrigin(req)}/api/a2mcp/polymarket-portfolio-watch`,
    })
  }
  if (body.externalOrderId && body.order && body.orderPayload && body.mandate) {
    return a2mcpPolymarketGovernedOpenHandler(req, res)
  }
  if (body.action || body.selectionMode || body.ownerAddress || body.watchedWallet) {
    return polymarketAgentFlowHandler(req, res)
  }
  return a2mcpPolymarketPortfolioWatchHandler(req, res)
}

async function deliverSmartTraderAnalysis(req: Request, res: Response) {
  return polymarketSmartTraderHandler(req, res)
}

type SmartTraderPreparedResult = Extract<Awaited<ReturnType<typeof runPolymarketSmartTrader>>, { ok: true }>

type SmartTraderPaymentPreflightDependencies = {
  validate: typeof preflightPolymarketSmartTraderRequest
  operational: typeof checkPolymarketSmartTraderOperational
  providers: typeof preflightPolymarketSmartTraderProviders
  prepare: typeof runPolymarketSmartTrader
}

const smartTraderPaymentPreflightDependencies: SmartTraderPaymentPreflightDependencies = {
  validate: preflightPolymarketSmartTraderRequest,
  operational: checkPolymarketSmartTraderOperational,
  providers: preflightPolymarketSmartTraderProviders,
  prepare: runPolymarketSmartTrader,
}

export async function preflightSmartTraderBeforeSettlement(
  body: Record<string, unknown>,
  dependencies: SmartTraderPaymentPreflightDependencies = smartTraderPaymentPreflightDependencies,
): Promise<
  | { ok: true; prepared?: SmartTraderPreparedResult }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (clean(body.action).toUpperCase() === 'DISCOVER') {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: 'DISCOVER is included inside the paid ANALYZE workflow. Submit ANALYZE with query, category, marketId, or marketUrl. No payment challenge was issued.' },
    }
  }
  const preflight = await dependencies.validate(body)
  if (!preflight.ok) {
    return { ok: false, status: preflight.status, body: { ok: false, error: `${preflight.error} No payment challenge was issued.` } }
  }
  if (!await dependencies.operational()) {
    return {
      ok: false,
      status: 503,
      body: { ok: false, error: 'Smart Market Trader dependencies are unavailable. No payment challenge was issued.' },
    }
  }
  if (clean(body.action).toUpperCase() === 'ANALYZE') {
    const providers = await dependencies.providers(body)
    if (!providers.ok) {
      return {
        ok: false,
        status: providers.status,
        body: { ok: false, error: `${providers.error} No payment challenge was issued.` },
      }
    }
  }
  if (clean(body.action).toUpperCase() !== 'PREPARE') return { ok: true }
  const prepared = await dependencies.prepare(body)
  if (!prepared.ok) {
    const { status, ...errorBody } = prepared
    return {
      ok: false,
      status,
      body: { ...errorBody, error: `${prepared.error} No payment was settled.` },
    }
  }
  return { ok: true, prepared }
}

export function smartTraderRequestInput(req: Pick<Request, 'body' | 'query'>): Record<string, unknown> {
  const query = isRecord(req.query) ? req.query : {}
  const body = isRecord(req.body) ? req.body : {}
  // Some OKX buyer clients replay declared parameters in the URL even for a
  // POST. Normalize both carriers, while letting an explicit JSON body win.
  return { ...query, ...body }
}

const serviceDefinitions = {
  // Agent #5427 compatibility routes. Keep these live until the marketplace
  // listing has migrated to the newer football and governed-flow names.
  '/api/a2mcp/worldcup-live-scores': {
    name: 'Football Match Live Data',
    description: 'Provider-truth football fixtures, live scores, match events, and a canonical Polymarket event URL plus trade metadata when confidently resolved.',
    tags: ['world-cup', 'football', 'live-data', 'polymarket'],
    deliver: polyStreamHandler,
  },
  '/api/a2mcp/worldcup-market-news': {
    name: 'Football News Brief',
    description: 'Current provider-sourced football headlines with canonical source links and deterministic Polymarket event matches where available.',
    tags: ['world-cup', 'football', 'news', 'polymarket'],
    deliver: polyWorldcupNewsHandler,
  },
  '/api/a2mcp/polymarket-portfolio-watch': {
    name: 'Governed Polymarket Trader',
    description: 'Watch or pick a Polymarket position, verify account readiness, enforce a short-lived signed mandate, and return an exact buyer-signed direct-submit handoff.',
    tags: ['polymarket', 'portfolio', 'copy-trading', 'governed-execution', 'buyer-signed'],
    deliver: deliverMarketplacePortfolioService,
  },
  '/api/a2mcp/football-live-data': {
    name: 'Football Match Live Data',
    description: 'Provider-truth football fixtures, live scores, match events, and a canonical Polymarket event URL plus trade metadata when an active match market is confidently resolved.',
    tags: ['football', 'live-data', 'polymarket', 'agent-api'],
    deliver: polyStreamHandler,
  },
  '/api/a2mcp/football-news-brief': {
    name: 'Football News Brief',
    description: 'Current provider-sourced football headlines with canonical source links and deterministic Polymarket event matches where available.',
    tags: ['football', 'news', 'polymarket', 'agent-api'],
    deliver: polyWorldcupNewsHandler,
  },
  '/api/a2mcp/polymarket-funding-link': {
    name: 'Verified Polymarket Funding',
    description: 'Derive and verify the owner EOA’s deployed Polymarket Deposit Wallet, check pUSD readiness, and prepare a hosted checkout only for the verified account.',
    tags: ['polymarket', 'deposit-wallet', 'funding', 'checkout', 'readiness'],
    deliver: a2mcpPolymarketFundingLinkHandler,
  },
  '/api/a2mcp/polymarket-agent-flow': {
    name: 'Governed Polymarket Trader',
    description: 'Complete a prepared watch, pick, or copy intent under deterministic spending bounds, then return the exact buyer-signed payload for direct Polymarket submission.',
    tags: ['polymarket', 'copy-trading', 'governed-execution', 'buyer-signed'],
    ready: governedOpenReady,
    deliver: a2mcpPolymarketGovernedOpenHandler,
  },
  '/api/a2mcp/polymarket-smart-trader': {
    name: 'PolyDesk Smart Market Trader',
    description: 'Research an exact Polymarket outcome using current market and order-book state, transparent wallet-flow evidence, ZeroScout research, and category-relevant news; return an expiring durable decision receipt for the free preview-only OnchainOS handoff.',
    tags: ['polymarket', 'research', 'smart-money', 'zeroscout', 'onchainos', 'decision-receipt'],
    ready: polymarketSmartTraderReady,
    deliver: deliverSmartTraderAnalysis,
  },
} as const

type StandardServicePath = keyof typeof serviceDefinitions

let standardServicesServerPromise: Promise<x402HTTPResourceServer> | undefined

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
  const configuredOrigin = env('PUBLIC_APP_URL')
  if (configuredOrigin && /^https?:\/\//i.test(configuredOrigin)) return configuredOrigin.replace(/\/+$/, '')
  const forwardedProto = clean(req.headers['x-forwarded-proto'])
  const forwardedHost = clean(req.headers['x-forwarded-host'])
  const host = forwardedHost || clean(req.headers.host)
  if (host) return `${forwardedProto || req.protocol || 'https'}://${host}`
  return env('RENDER_EXTERNAL_URL') || 'https://polydesk.trade'
}

function requestOrigin(req: Request) {
  const forwardedProto = clean(req.headers['x-forwarded-proto']).split(',')[0]
  const forwardedHost = clean(req.headers['x-forwarded-host']).split(',')[0]
  const host = forwardedHost || clean(req.headers.host).split(',')[0]
  if (host) return `${forwardedProto || req.protocol || 'https'}://${host}`
  return publicOrigin(req)
}

function requestUrl(req: Request) {
  return `${requestOrigin(req)}${req.originalUrl || req.url}`
}

function routePath(req: Request) {
  return new URL(requestUrl(req)).pathname
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
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
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid OKX x402 standard-service price: ${amount}`)
  return String(Math.round(amount * 1_000_000))
}

function normalizeSupportedResponse(value: unknown) {
  const raw = value as { kinds?: unknown; extensions?: unknown; signers?: unknown } | unknown[]
  if (Array.isArray(raw)) return { kinds: raw, extensions: [], signers: {} }
  return {
    kinds: Array.isArray(raw?.kinds) ? raw.kinds : [],
    extensions: Array.isArray(raw?.extensions) ? raw.extensions : [],
    signers: raw?.signers && typeof raw.signers === 'object' ? raw.signers as Record<string, string[]> : {},
  }
}

function payerFromPayload(paymentPayload: PaymentPayload) {
  const payload = paymentPayload.payload as Record<string, unknown>
  const authorization = payload.authorization as Record<string, unknown> | undefined
  const permit2 = payload.permit2Authorization as Record<string, unknown> | undefined
  return clean(authorization?.from || permit2?.from || permit2?.owner || 'okx-buyer')
}

export function buildStandardServiceRouteConfig(req: Request, path: StandardServicePath, price: string, payTo: string): RouteConfig {
  const service = serviceDefinitions[path]
  const isFundingLink = path === '/api/a2mcp/polymarket-funding-link'
  const isGovernedTrader = path === '/api/a2mcp/polymarket-agent-flow'
  const isPortfolioWatch = path === '/api/a2mcp/polymarket-portfolio-watch'
  const isSmartTrader = path === '/api/a2mcp/polymarket-smart-trader'
  const isFootballLive = path === '/api/a2mcp/football-live-data' || path === '/api/a2mcp/worldcup-live-scores'
  const isFootballNews = path === '/api/a2mcp/football-news-brief' || path === '/api/a2mcp/worldcup-market-news'
  const discoveryExtensions = isFundingLink
    ? fundingLinkDiscoveryExtension()
    : isGovernedTrader
      ? governedTraderDiscoveryExtension()
      : {}
  return {
    accepts: {
      scheme: 'exact',
      network: OKX_XLAYER_NETWORK,
      payTo,
      price: {
        amount: decimalUsdtToAtomic(Number(price)),
        asset: OKX_XLAYER_USDT,
        extra: {
          tokenSymbol: 'USDT',
          decimals: 6,
          name: 'USDT',
          version: '1',
        },
      },
      maxTimeoutSeconds: 600,
      extra: {
        tokenSymbol: 'USDT',
        decimals: 6,
        name: 'USDT',
        version: '1',
      },
    },
    resource: `${requestOrigin(req)}${path}`,
    description: service.description,
    mimeType: 'application/json',
    extensions: {
      serviceName: service.name,
      tags: service.tags,
      ...discoveryExtensions,
    },
    unpaidResponseBody: () => ({
      contentType: 'application/json',
      body: {
        ok: false,
        error: 'payment_required',
        service: service.name,
        protocol: 'OKX Agent Payments Protocol',
        payment: { network: 'X Layer', asset: 'USDT', amount: price },
        message: 'Pay this x402 challenge from an OKX Agentic Wallet, then replay the request with the payment header.',
        ...(isFundingLink ? {
          inputSchema: {
            type: 'object',
            properties: fundingLinkBodyProperties,
            required: fundingLinkRequiredFields,
            additionalProperties: false,
          },
        } : isGovernedTrader ? {
          inputSchema: {
            type: 'object',
            properties: governedTraderBodyProperties,
            required: governedTraderRequiredFields,
            additionalProperties: false,
          },
        } : isSmartTrader ? {
          inputSchema: {
            type: 'object',
            properties: smartTraderBodyProperties,
            required: smartTraderRequiredFields,
            additionalProperties: false,
          },
        } : isPortfolioWatch ? {
          inputSchema: {
            type: 'object',
            properties: portfolioWatchBodyProperties,
            additionalProperties: true,
          },
        } : isFootballLive ? {
          inputSchema: {
            type: 'object',
            properties: footballLiveBodyProperties,
            additionalProperties: true,
          },
        } : isFootballNews ? {
          inputSchema: {
            type: 'object',
            properties: footballNewsBodyProperties,
            additionalProperties: true,
          },
        } : {}),
      },
    }),
  }
}

async function getStandardServicesServer(req: Request) {
  if (!standardServicesServerPromise) {
    standardServicesServerPromise = (async () => {
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
      if (!supported.kinds.length) throw new Error('OKX facilitator returned no supported x402 payment kinds.')

      const resourceServer = new x402ResourceServer({
        verify: facilitator.verify.bind(facilitator),
        settle: facilitator.settle.bind(facilitator),
        getSettleStatus: facilitator.getSettleStatus.bind(facilitator),
        getSupported: async () => supported,
      })
      registerExactEvmScheme(resourceServer)

      const payTo = env('OKX_X402_PAY_TO', 'OKX_X402_SELLER_ADDRESS', 'X402_SELLER_ADDRESS', 'TREASURY_ADDRESS')
      if (!payTo) throw new Error('OKX_X402_PAY_TO is required for OKX A2MCP x402 settlement')
      const standardPrice = env('OKX_X402_STANDARD_SERVICE_PRICE') || DEFAULT_STANDARD_PRICE
      const smartTraderPrice = env('OKX_X402_SMART_TRADER_PRICE') || DEFAULT_SMART_TRADER_PRICE
      const routes: RoutesConfig = {}
      for (const path of Object.keys(serviceDefinitions) as StandardServicePath[]) {
        const price = path === '/api/a2mcp/polymarket-smart-trader' ? smartTraderPrice : standardPrice
        const config = buildStandardServiceRouteConfig(req, path, price, payTo)
        routes[`GET ${path}`] = config
        routes[`POST ${path}`] = config
      }

      const httpServer = new x402HTTPResourceServer(resourceServer, routes)
      await httpServer.initialize()
      return httpServer
    })().catch(err => {
      standardServicesServerPromise = undefined
      throw err
    })
  }
  return standardServicesServerPromise
}

export function addFundingReplaySchema(
  response: { status: number; headers: Record<string, string>; body?: unknown },
  path: StandardServicePath,
) {
  if (path !== '/api/a2mcp/polymarket-funding-link' || response.status !== 402) return response
  const paymentHeaderKey = Object.keys(response.headers).find(key => key.toLowerCase() === 'payment-required')
  if (!paymentHeaderKey) return response

  try {
    const challenge = JSON.parse(Buffer.from(response.headers[paymentHeaderKey], 'base64url').toString('utf8')) as Record<string, unknown>
    const replaySchema = fundingLinkReplaySchema()
    challenge.outputSchema = replaySchema
    return {
      ...response,
      headers: {
        ...response.headers,
        [paymentHeaderKey]: Buffer.from(JSON.stringify(challenge)).toString('base64url'),
      },
    }
  } catch {
    return response
  }
}

export function addGovernedTraderReplaySchema(
  response: { status: number; headers: Record<string, string>; body?: unknown },
  path: StandardServicePath,
) {
  if (path !== '/api/a2mcp/polymarket-agent-flow' || response.status !== 402) return response
  const paymentHeaderKey = Object.keys(response.headers).find(key => key.toLowerCase() === 'payment-required')
  if (!paymentHeaderKey) return response

  try {
    const challenge = JSON.parse(Buffer.from(response.headers[paymentHeaderKey], 'base64url').toString('utf8')) as Record<string, unknown>
    challenge.outputSchema = governedTraderReplaySchema()
    return {
      ...response,
      headers: {
        ...response.headers,
        [paymentHeaderKey]: Buffer.from(JSON.stringify(challenge)).toString('base64url'),
      },
    }
  } catch {
    return response
  }
}

export function addPortfolioWatchReplaySchema(
  response: { status: number; headers: Record<string, string>; body?: unknown },
  path: StandardServicePath,
) {
  if (path !== '/api/a2mcp/polymarket-portfolio-watch' || response.status !== 402) return response
  const paymentHeaderKey = Object.keys(response.headers).find(key => key.toLowerCase() === 'payment-required')
  if (!paymentHeaderKey) return response

  try {
    const challenge = JSON.parse(Buffer.from(response.headers[paymentHeaderKey], 'base64url').toString('utf8')) as Record<string, unknown>
    challenge.outputSchema = portfolioWatchReplaySchema()
    return {
      ...response,
      headers: {
        ...response.headers,
        [paymentHeaderKey]: Buffer.from(JSON.stringify(challenge)).toString('base64url'),
      },
    }
  } catch {
    return response
  }
}

export function addSmartTraderReplaySchema(
  response: { status: number; headers: Record<string, string>; body?: unknown },
  path: StandardServicePath,
) {
  if (path !== '/api/a2mcp/polymarket-smart-trader' || response.status !== 402) return response
  const paymentHeaderKey = Object.keys(response.headers).find(key => key.toLowerCase() === 'payment-required')
  if (!paymentHeaderKey) return response
  try {
    const challenge = JSON.parse(Buffer.from(response.headers[paymentHeaderKey], 'base64url').toString('utf8')) as Record<string, unknown>
    challenge.outputSchema = smartTraderReplaySchema()
    return {
      ...response,
      headers: { ...response.headers, [paymentHeaderKey]: Buffer.from(JSON.stringify(challenge)).toString('base64url') },
    }
  } catch {
    return response
  }
}

function sendInstructions(
  res: Response,
  response: { status: number; headers: Record<string, string>; body?: unknown },
  path: StandardServicePath,
) {
  const prepared = addSmartTraderReplaySchema(addPortfolioWatchReplaySchema(
    addGovernedTraderReplaySchema(addFundingReplaySchema(response, path), path),
    path,
  ), path)
  for (const [key, value] of Object.entries(prepared.headers)) res.setHeader(key, value)
  return res.status(prepared.status).send(prepared.body)
}

export default async function okxA2mcpStandardServiceHandler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const path = routePath(req) as StandardServicePath
  const service = serviceDefinitions[path]
  if (!service) return res.status(404).json({ ok: false, error: 'OKX A2MCP service not found' })
  if (path === '/api/a2mcp/football-live-data' || path === '/api/a2mcp/worldcup-live-scores') {
    const body = isRecord(req.body) ? req.body : {}
    const requestedDate = clean(req.query.date) || clean(body.date) || new Date().toISOString().slice(0, 10)
    const requestedTeam = requestTeam(req)
    const feed = await getPolyStreamFeed(
      /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10),
      requestedTeam,
    )
    if (!feed.matches.length) {
      const providerLookupFailed = Boolean(feed.providerError)
        && !/returned no (?:accessible )?fixtures/i.test(feed.providerError || '')
      const providerUnavailable = feed.providerStatus === 'error'
        || feed.providerStatus === 'not_configured'
        || providerLookupFailed
      return res.status(requestedTeam && !providerUnavailable ? 404 : 503).json({
        ok: false,
        code: requestedTeam && !providerUnavailable ? 'TEAM_NOT_FOUND_OR_NOT_COVERED' : 'FOOTBALL_PROVIDER_UNAVAILABLE',
        error: requestedTeam && !providerUnavailable
          ? `No provider-truth fixtures were found for ${requestedTeam}. No payment challenge was issued.`
          : 'No provider-truth football match data is available. No payment challenge was issued.',
        requestedTeam: requestedTeam || undefined,
        providerStatus: feed.providerStatus,
      })
    }
    ;(req as Request & { polyStreamPreflightFeed?: typeof feed }).polyStreamPreflightFeed = feed
  }
  if (path === '/api/a2mcp/football-news-brief' || path === '/api/a2mcp/worldcup-market-news') {
    const query = requestFootballNewsQuery(req)
    const feed = await getPolyWorldcupNewsFeed(query)
    if (feed.mode !== 'live' || !feed.articles.length) {
      const filtered = Boolean(query.team || query.league)
      return res.status(filtered && feed.providerConfigured ? 404 : 503).json({
        ok: false,
        code: filtered && feed.providerConfigured ? 'FOOTBALL_NEWS_NOT_FOUND' : 'FOOTBALL_NEWS_PROVIDER_UNAVAILABLE',
        error: filtered && feed.providerConfigured
          ? 'No relevant provider-sourced football brief matched this request. No payment challenge was issued.'
          : 'No current provider-sourced football brief is available. No payment challenge was issued.',
        query,
      })
    }
    ;(req as Request & { footballNewsPreflightFeed?: typeof feed }).footballNewsPreflightFeed = feed
  }
  if (path === '/api/a2mcp/polymarket-agent-flow') {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {}
    // OKX marketplace discovery probes this POST route with an empty body. Let
    // the payment layer return its 402 plus the declared input schema. Real
    // non-empty requests still receive the free deterministic preflight before
    // any payment can be accepted.
    if (Object.keys(body).length > 0) {
      const evaluation = evaluateGovernedOpenInput(body)
      if (!evaluation.ok) return res.status(evaluation.status).json({ ok: false, error: evaluation.error })
      if (evaluation.decision !== 'APPROVE') {
        return res.status(409).json({
          ok: false,
          decision: evaluation.decision,
          reasons: evaluation.reasons,
          checks: evaluation.checks,
          error: 'Only an APPROVE decision can proceed to the paid governed handoff. No payment challenge was issued.',
        })
      }
    }
  }
  if (path === '/api/a2mcp/polymarket-smart-trader') {
    const body = smartTraderRequestInput(req)
    req.body = body
    const hasPaymentProof = Boolean(req.headers['payment-signature'] || req.headers['x-payment'])
    // Preserve empty marketplace discovery probes so buyer tooling can receive
    // the declared 402 schema. Any request carrying business input or a signed
    // paid replay must pass the complete free validator before settlement.
    if (Object.keys(body).length > 0 || hasPaymentProof) {
      // PREPARE is a deterministic handoff, not paid research. Re-resolve the
      // market and order book before settlement, then reuse that exact result
      // after settlement so a stale or unavailable market cannot be billed.
      const result = await preflightSmartTraderBeforeSettlement(body)
      if (!result.ok) return res.status(result.status).json(result.body)
      if (result.prepared) {
        // A valid paid ANALYZE receipt is the capability for this continuation.
        // Return the freshly revalidated preview without issuing or settling a
        // second payment challenge.
        res.setHeader('X-PolyDesk-Workflow-Included', 'PREPARE')
        return res.status(result.prepared.status).json(result.prepared.data)
      }
    }
  }
  if ('ready' in service && !service.ready()) {
    return res.status(503).json({ ok: false, error: 'This paid service is not ready. No payment challenge was issued.' })
  }

  try {
    const httpServer = await getStandardServicesServer(req)
    const context: HTTPRequestContext = {
      adapter: adapterForRequest(req),
      path,
      method: req.method,
    }
    const paymentResult = await httpServer.processHTTPRequest(context)
    if (paymentResult.type === 'payment-error') return sendInstructions(res, paymentResult.response, path)
    if (paymentResult.type === 'no-payment-required') {
      return res.status(500).json({ ok: false, error: 'OKX x402 route is not protected' })
    }

    const settlement = await httpServer.processSettlement(
      paymentResult.paymentPayload,
      paymentResult.paymentRequirements,
      paymentResult.declaredExtensions,
      { request: context },
    )
    if (!settlement.success) return sendInstructions(res, settlement.response, path)

    const requirements = paymentResult.paymentRequirements as PaymentRequirements
    const paidReq = req as Request & { payment?: Record<string, unknown> }
    paidReq.payment = {
      verified: true,
      payer: settlement.payer || payerFromPayload(paymentResult.paymentPayload),
      amount: settlement.amount || requirements.amount,
      network: 'X Layer',
      transaction: settlement.transaction,
      asset: 'USDT',
      provider: 'OKX Agent Payments Protocol',
      kind: 'okx_agent_payments_x402',
      seller: requirements.payTo,
      serviceUrl: path,
    }
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return
      void recordDeliveredOkxCall({
        payer: paidReq.payment?.payer,
        transaction: paidReq.payment?.transaction,
        amountAtomic: paidReq.payment?.amount,
        servicePath: path,
      }).catch(error => console.warn('[okx-rewards] could not record delivered call:', error instanceof Error ? error.message : String(error)))
    })
    for (const [key, value] of Object.entries(settlement.headers)) res.setHeader(key, value)
    return service.deliver(paidReq, res)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OKX A2MCP x402 route unavailable'
    const status = /OKX_X402_|OKX API|private key|RPC/i.test(message) ? 503 : 500
    return res.status(status).json({ ok: false, error: message })
  }
}
