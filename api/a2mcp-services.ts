import type { Request, Response } from 'express'
import { standardServiceInputSchema, type StandardServicePath } from './okx-a2mcp-standard-services.js'
import { polydeskMarketplaceProducts } from '../src/lib/polydeskMarketplaceProducts.js'

type Service = {
  id: string
  marketplaceServiceId: number
  name: string
  oneLine: string
  endpoint: string
  method: 'GET' | 'POST'
  price: { amount: string; asset: 'USDT'; network: 'X Layer' }
  useWhen: string
  input: string[]
  returns: string[]
  freeSteps?: Array<{ endpoint: string; purpose: string }>
  boundary: string
}

const AGENT_ID = 5427
const AGENT_PROFILE_URL = 'https://www.okx.ai/agents/' + AGENT_ID
const XLAYER_USDT = '0x779ded0c9e1022225f8e0630b35a9b54be713736'

const services: Service[] = [
  {
    id: 'polymarket-lp-scout',
    marketplaceServiceId: 33342,
    name: 'Polymarket LP Scout',
    oneLine: 'Research active reward markets and receive maker-oriented limit-order instructions.',
    endpoint: '/api/a2mcp/okx/polymarket-lp-scout',
    method: 'GET',
    price: { amount: '0.3', asset: 'USDT', network: 'X Layer' },
    useWhen: 'An agent needs current spread, depth, reward, and execution-risk research before it places its own maker order.',
    input: ['scoutMode=best or market', 'context=Polymarket URL or slug for market mode', 'optional budget'],
    returns: ['ranked opportunities', 'limit-order research brief', 'risk and freshness flags', 'receipt-backed report URL'],
    boundary: 'Research only. PolyDesk does not submit the LP order or guarantee rewards.',
  },
  {
    id: 'football-live-data',
    marketplaceServiceId: 33343,
    name: 'Football Match Live Data',
    oneLine: 'Reuse provider-truth fixtures, live scores, match events, and verified Polymarket trade metadata.',
    endpoint: '/api/a2mcp/worldcup-live-scores',
    method: 'POST',
    price: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    useWhen: 'An agent needs current football data and an instant-trade link when PolyDesk confidently matches an active Polymarket event.',
    input: ['optional exact team name', 'optional date in YYYY-MM-DD'],
    returns: ['fixture and status', 'score and match events when available', 'source metadata', 'Polymarket event URL, token IDs, price, tick size, and minimum size when matched'],
    boundary: 'No match data means no payment challenge. PolyDesk never invents a score or market match.',
  },
  {
    id: 'football-news-brief',
    marketplaceServiceId: 33346,
    name: 'Football News Brief',
    oneLine: 'Reuse current football headlines with source links and related active Polymarket events.',
    endpoint: '/api/a2mcp/worldcup-market-news',
    method: 'POST',
    price: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    useWhen: 'An agent needs current football attention signals it can cite, summarize, or connect to an active market.',
    input: ['optional exact team name', 'optional league name', 'optional type: prematch or postmatch'],
    returns: ['headline and concise description', 'publisher and source URL', 'published time', 'deterministically matched Polymarket event URL and slug when available'],
    boundary: 'Provider-backed articles only. Empty, fallback, or non-football feeds are not sold.',
  },
  {
    id: 'verified-polymarket-funding',
    marketplaceServiceId: 33344,
    name: 'Verified Polymarket Funding',
    oneLine: 'Fund only the deterministic Deposit Wallet controlled by the supplied owner EOA.',
    endpoint: '/api/a2mcp/polymarket-funding-link',
    method: 'POST',
    price: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    useWhen: 'A buyer agent has a verified pUSD shortfall before a Polymarket action.',
    input: ['ownerAddress', 'requiredBalanceUsdc', 'optional claimed wallet', 'source network: base or arbitrum'],
    returns: ['derived Deposit Wallet and match proof', 'deployment and pUSD readiness', 'verified shortfall', 'Hash PayLink checkout and status URL only when funding is required'],
    freeSteps: [
      { endpoint: '/api/polymarket-account/readiness', purpose: 'Derive and inspect the buyer account before payment.' },
    ],
    boundary: 'A mismatched wallet is rejected before checkout creation. Checkout settlement must complete before trading.',
  },
  {
    id: 'governed-polymarket-trader',
    marketplaceServiceId: 33345,
    name: 'Governed Polymarket Trader',
    oneLine: 'Watch, pick, or copy a public signal; verify the buyer account; fund if needed; enforce a mandate; submit directly; publish proof.',
    endpoint: '/api/a2mcp/polymarket-portfolio-watch',
    method: 'POST',
    price: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    useWhen: 'A Polymarket agent needs a complete buyer-controlled path from public signal to a bounded immediate BUY and verified receipt.',
    input: ['prepared exact signed FAK or FOK BUY', 'authority-signed amount, price, market, token, signer, and expiry mandate'],
    returns: ['APPROVE, ESCALATE, or BLOCK trace', 'exact direct-submit CLOB payload only when approved', 'durable order, mandate, and decision hashes', 'public verified completion receipt'],
    freeSteps: [
      { endpoint: '/api/polymarket-agent-flow', purpose: 'Read the flow, watch a wallet, or prepare TRADE, POSITION, or AUTO_BEST_FIT selection.' },
      { endpoint: '/api/polymarket-governed-open/authorize', purpose: 'Create the exact mandate message.' },
      { endpoint: '/api/polymarket-governed-open/validate', purpose: 'Run deterministic checks before x402 payment.' },
      { endpoint: '/api/polymarket-agent-flow/complete', purpose: 'Verify the submitted order and create the terminal receipt.' },
    ],
    boundary: 'PolyDesk never receives the buyer private key or reusable CLOB credentials. AUTO_BEST_FIT ranks execution quality, not expected profit.',
  },
  {
    id: 'polymarket-smart-trader',
    marketplaceServiceId: 40269,
    name: 'Smart Market OOS Trader',
    oneLine: 'Purchase one PolyDesk analysis workflow to discover when needed, research an exact Polymarket outcome, verify funding readiness, and prepare its included OnchainOS preview.',
    endpoint: '/api/a2mcp/polymarket-smart-trader',
    method: 'POST',
    price: { amount: '0.3', asset: 'USDT', network: 'X Layer' },
    useWhen: 'An agent needs a current evidence brief and bounded APPROVE or ESCALATE decision before preparing a direct Polymarket trade.',
    input: ['action: ANALYZE or PREPARE', 'ANALYZE accepts either query/category discovery or a specific marketId', 'exact outcome and side: BUY or SELL are required for approval', 'optional public signal wallets, order parameters, and mandate bounds'],
    returns: ['ranked market discovery', 'current market and order-book analysis', 'transparent smart-money provenance', 'ZeroScout and category-relevant news evidence', 'durable decision receipt or preview-only OnchainOS handoff', 'verified-shortfall FUND route before a BUY preview when pUSD is low'],
    freeSteps: [
      { endpoint: '/api/a2mcp/polymarket-smart-trader/decision/:decisionId', purpose: 'Verify a persisted OKX AI service decision receipt and expiry.' },
      { endpoint: '/api/a2mcp/polymarket-smart-trader/payment/:transaction', purpose: 'Recover paid analysis delivery status and its decision ID after a client disconnect.' },
      { endpoint: '/api/polymarket-account/readiness', purpose: 'Verify the owner-derived Deposit Wallet and pUSD balance before a BUY preview.' },
    ],
    boundary: 'ANALYZE is the single 0.3 USDT analysis payment gate. Its unexpired paid receipt includes PREPARE. A verified pUSD shortfall routes to the separate funding service and must settle before preview; it never overrides ESCALATE. The official OnchainOS Polymarket plugin owns wallet access, typed live confirmation, signing, and submission.',
  },
]

function serviceInputSchema(service: Service) {
  if (service.id === 'polymarket-lp-scout') return {
    carrier: 'query',
    type: 'object',
    properties: {
      scoutMode: { type: 'string', enum: ['best', 'market', 'news', 'football'], default: 'best' },
      context: { type: 'string', description: 'Polymarket URL or slug; required for market mode.' },
      budget: { type: 'string', pattern: '^[0-9]+(?:\\.[0-9]{1,6})?$' },
    },
    additionalProperties: false,
  }
  return standardServiceInputSchema(service.endpoint as StandardServicePath)
}

export function polyDeskAgentServices() {
  return services.map(service => ({
    ...service,
    status: 'production' as const,
    marketplace: {
      agentId: AGENT_ID,
      serviceId: service.marketplaceServiceId,
      profileUrl: AGENT_PROFILE_URL + '#service-' + service.marketplaceServiceId,
    },
    requestSchema: serviceInputSchema(service),
  }))
}

export const polyDeskMarketplaceProducts = polydeskMarketplaceProducts

export default function a2mcpServicesHandler(_req: Request, res: Response) {
  const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://polydesk.trade').replace(/\/+$/, '')
  const publicServices = polyDeskAgentServices()
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json({
    ok: true,
    schema: 'polydesk-integration-manifest',
    schemaVersion: '2.0.0',
    status: 'production',
    provider: 'PolyDesk',
    agentId: AGENT_ID,
    protocol: 'OKX Agent Payments Protocol',
    baseUrl,
    summary: 'PolyDesk offers one bounded trade mission, continuous non-custodial agent management, and a planned external integration conformance audit.',
    discovery: {
      wellKnown: baseUrl + '/.well-known/polydesk.json',
      catalog: baseUrl + '/api/a2mcp/services',
      humanGuide: baseUrl + '/integrations',
      technicalGuide: baseUrl + '/docs/okx-ai',
    },
    integration: {
      requestContentType: 'application/json',
      responseContentType: 'application/json',
      payment: {
        requiredStatus: 402,
        challengeHeader: 'PAYMENT-REQUIRED',
        replayHeader: 'PAYMENT-SIGNATURE',
        network: { name: 'X Layer', caip2: 'eip155:196' },
        asset: { symbol: 'USDT', address: XLAYER_USDT, decimals: 6 },
        rule: 'The buyer must inspect and approve every payment challenge before signing. A paid replay must preserve the original business inputs.',
      },
      errors: {
        shape: { ok: false, error: 'machine_readable_or_human_safe_string' },
        nonBillable: 'Validation, provider-readiness, and ambiguous-input failures occur before a payment challenge whenever possible.',
      },
      asynchronousResults: {
        callbacksSupported: false,
        delivery: 'polling-and-public-receipts',
        rule: 'Callers poll the declared status or receipt endpoint. Arbitrary caller-supplied webhook URLs are not accepted.',
      },
      custody: 'PolyDesk never accepts private keys, seed phrases, or reusable Polymarket CLOB credentials. Financial actions remain buyer-approved.',
      returnRouting: {
        allowlistedSources: ['polydesk', 'okx-ai', 'circle-marketplace'],
        rule: 'Human portfolio and email links resolve from a stored allowlisted integration key, never an arbitrary return URL.',
      },
    },
    marketplace: {
      agentId: AGENT_ID,
      profileUrl: AGENT_PROFILE_URL,
      targetProductCount: polyDeskMarketplaceProducts.length,
      products: polyDeskMarketplaceProducts,
      currentCompatibilityListings: {
        a2a: [
          { serviceId: 38484, listingName: 'PolyDesk Trading Agent', targetProductId: 'one-off-trade-mission' },
          { serviceId: 38496, listingName: 'PolyDesk Trading Membership', targetProductId: 'manage-my-polymarket-agent' },
        ],
        directA2mcp: publicServices.map(service => service.marketplace),
      },
      migrationRule: 'Keep current listings live until the three-product contract is tested. Then rename the two A2A listings and roll down superseded direct listings in one controlled migration.',
    },
    products: polyDeskMarketplaceProducts,
    capabilities: publicServices,
    compatibilityServices: publicServices,
    deprecatedAliases: ['compatibilityServices'],
    rule: 'Products are the customer-facing marketplace offers. Capabilities are retained implementation routes and must not be presented as additional products.',
    services: polyDeskMarketplaceProducts,
    docs: '/docs/okx-ai',
  })
}
