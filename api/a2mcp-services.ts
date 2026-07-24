import type { Request, Response } from 'express'

type PolyDeskAgentService = {
  id: string
  title: string
  description: string
  category: 'prediction-market' | 'sports-data' | 'market-intelligence' | 'funding' | 'portfolio' | 'trading'
  endpoint: string
  method: 'GET' | 'POST'
  pricing: {
    model: 'free' | 'x402-fixed'
    amount: string
    asset: 'USDC' | 'USDT'
    network?: string
  }
  payment: {
    required: boolean
    standard: 'x402' | 'none'
  }
  request?: {
    preparation?: {
      endpoint: string
      method: 'POST'
      description: string
      body: Array<{
        name: string
        required: boolean
        description: string
        values?: string[]
      }>
    }
    preflight?: {
      endpoint: string
      method: 'POST'
      description: string
    }
    query?: Array<{
      name: string
      required: boolean
      description: string
      values?: string[]
    }>
    headers?: Array<{
      name: string
      required: boolean
      description: string
    }>
    body?: Array<{
      name: string
      required: boolean
      description: string
      values?: string[]
    }>
  }
  output: string[]
  artifacts?: string[]
  safety?: string[]
}

const services: PolyDeskAgentService[] = [
  {
    id: 'polymarket-lp-scout',
    title: 'Polymarket LP Scout',
    description: 'Paid LP operator intelligence for live Polymarket reward markets, spreads, depth, liquidity, and execution risk.',
    category: 'prediction-market',
    endpoint: '/api/a2mcp/polymarket-lp-scout',
    method: 'GET',
    pricing: { model: 'x402-fixed', amount: '0.01', asset: 'USDC', network: 'Arc Testnet' },
    payment: { required: true, standard: 'x402' },
    request: {
      query: [
        { name: 'scoutMode', required: false, description: 'LP Scout category.', values: ['best', 'theme', 'market'] },
        { name: 'context', required: false, description: 'Theme, market URL, slug, sector, event, token, election, or sports category.' },
        { name: 'budget', required: false, description: 'Human budget context in USDC. Used for sizing guidance only; PolyDesk does not trade.' },
        { name: 'agent', required: false, description: 'Buyer-agent slug used to store receipts and reports.' },
      ],
      headers: [
        { name: 'x-buyer-agent', required: false, description: 'Preferred buyer-agent identifier for receipt/report attribution.' },
        { name: 'x-agent-slug', required: false, description: 'Fallback buyer-agent identifier.' },
      ],
    },
    output: [
      'best available LP opportunity when one passes the safety screen',
      'plain-language execution checklist',
      'risk flags and data gaps',
      'x402 receipt and ZeroScout/0G verification handoff',
    ],
    artifacts: [
      'x402 receipt URL',
      'LP Scout report URL',
      '0G proof URL when verification is archived',
      'machine-readable receiptActivityId and resultActivityId',
    ],
    safety: [
      'educational LP research only',
      'human must re-open Polymarket and verify the live book before quoting',
      'no automated trading and no guaranteed rewards',
      'market orders are explicitly discouraged',
    ],
  },
  {
    id: 'okx-polymarket-lp-scout',
    title: 'Polymarket LP Scout for OKX.AI',
    description: 'OKX-compatible paid LP operator intelligence for buyer agents. Pays on X Layer with USDT and returns receipt-backed PolyDesk LP Scout reports.',
    category: 'prediction-market',
    endpoint: '/api/a2mcp/okx/polymarket-lp-scout',
    method: 'GET',
    pricing: { model: 'x402-fixed', amount: '0.3', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    request: {
      query: [
        { name: 'scoutMode', required: false, description: 'LP Scout category.', values: ['best', 'theme', 'market'] },
        { name: 'context', required: false, description: 'Theme, market URL, slug, sector, event, token, election, or sports category.' },
        { name: 'budget', required: false, description: 'Human budget context in USDC. Used for sizing guidance only; PolyDesk does not trade.' },
        { name: 'agent', required: false, description: 'Buyer-agent slug used to store receipts and reports.' },
      ],
      headers: [
        { name: 'x-buyer-agent', required: false, description: 'Preferred buyer-agent identifier for receipt/report attribution.' },
        { name: 'x-agent-slug', required: false, description: 'Fallback buyer-agent identifier.' },
      ],
    },
    output: [
      'best available LP opportunity when one passes the safety screen',
      'plain-language execution checklist',
      'risk flags and data gaps',
      'x402 receipt and ZeroScout/0G verification handoff',
    ],
    artifacts: [
      'OKX x402 receipt URL',
      'LP Scout report URL',
      '0G proof URL when verification is archived',
      'machine-readable receiptActivityId and resultActivityId',
    ],
    safety: [
      'educational LP research only',
      'human must re-open Polymarket and verify the live book before quoting',
      'no automated trading and no guaranteed rewards',
      'market orders are explicitly discouraged',
    ],
  },
  {
    id: 'worldcup-live-scores',
    title: 'World Cup 2026 Final Standings',
    description: 'Verified World Cup 2026 podium and final result, with the next live football data leagues marked as coming soon.',
    category: 'sports-data',
    endpoint: '/api/a2mcp/worldcup-live-scores',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    output: [
      'completed tournament status',
      'Spain, Argentina, and England podium',
      'final and bronze-final scores',
      'five-league live-data roadmap',
    ],
  },
  {
    id: 'polymarket-funding-link',
    title: 'Polymarket Funding Link',
    description: 'Create a Hash PayLink hosted checkout that funds a public Polymarket wallet through the Polymarket bridge with USDC.',
    category: 'funding',
    endpoint: '/api/a2mcp/polymarket-funding-link',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    request: {
      query: [
        { name: 'wallet', required: true, description: 'Public Polymarket 0x wallet to fund.' },
        { name: 'amount', required: true, description: 'USDC amount. Minimum is currently 3 USDC.' },
        { name: 'network', required: false, description: 'Funding network. Defaults to Base.', values: ['base', 'arbitrum'] },
        { name: 'agent', required: false, description: 'Buyer-agent slug used for attribution in the response.' },
      ],
      headers: [
        { name: 'x-buyer-agent', required: false, description: 'Preferred buyer-agent identifier for attribution.' },
        { name: 'x-agent-slug', required: false, description: 'Fallback buyer-agent identifier.' },
      ],
    },
    output: [
      'hosted Hash PayLink checkout URL',
      'provider-verified funding request id',
      'authenticated funding status URL',
      'funding safety instructions for buyer agents',
    ],
    artifacts: [
      'Hash PayLink checkout URL',
      'fundingRequestId for hosted checkout bridge status',
      'receipt URL after provider-confirmed delivery',
    ],
    safety: [
      'agent must show the target Polymarket wallet before the user pays',
      'funding is complete only after the hosted checkout confirms bridge settlement',
      'PolyDesk creates the funding handoff and does not custody buyer-agent funds',
    ],
  },
  {
    id: 'polymarket-signed-open',
    title: 'Polymarket Signed OPEN Handoff',
    description: 'Validate the constraints of a buyer-signed, capped Polymarket BUY payload and return a direct-submit handoff without receiving private keys, CLOB secrets, or passphrases.',
    category: 'trading',
    endpoint: '/api/a2mcp/polymarket-signed-open',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    request: {
      preparation: {
        endpoint: '/api/polymarket-open/prepare',
        method: 'POST',
        description: 'Resolve a simple BUY intent into a live CLOB V2 signing plan and public deposit-wallet readiness report before any key or payment is involved.',
        body: [
          { name: 'externalOrderId', required: true, description: 'Caller-generated correlation identifier, 8-80 safe characters.' },
          { name: 'marketUrl', required: true, description: 'Canonical polymarket.com event URL.' },
          { name: 'outcome', required: true, description: 'Requested outcome. Ambiguous events return market choices instead of guessing.' },
          { name: 'maxSpendUsdc', required: true, description: 'Maximum pUSD spend, capped by the service safety ceiling.' },
          { name: 'wallet', required: true, description: 'Public Polymarket deposit-wallet address. No private key.' },
          { name: 'orderType', required: false, description: 'Immediate order type. Defaults to FAK.', values: ['FAK', 'FOK'] },
          { name: 'marketSlug', required: false, description: 'Exact market slug for multi-market events.' },
          { name: 'tokenId', required: false, description: 'Exact token ID for multi-market events.' },
        ],
      },
      preflight: {
        endpoint: '/api/polymarket-signed-open/validate',
        method: 'POST',
        description: 'Free validation of the exact request body before paying the OKX x402 challenge.',
      },
      body: [
        { name: 'externalOrderId', required: true, description: 'Caller-generated correlation identifier, 8-80 safe characters.' },
        { name: 'marketUrl', required: true, description: 'Canonical polymarket.com event or sports market URL.' },
        { name: 'marketTitle', required: true, description: 'Human-readable market title shown to the buyer.' },
        { name: 'outcome', required: true, description: 'Outcome being bought.' },
        { name: 'tokenId', required: true, description: 'Exact numeric Polymarket CLOB token ID.' },
        { name: 'signer', required: true, description: 'Buyer-controlled Polymarket signer address.' },
        { name: 'orderType', required: true, description: 'Immediate order type.', values: ['FAK', 'FOK'] },
        { name: 'order', required: true, description: 'Exact buyer-signed Polymarket v2 BUY order.' },
        { name: 'orderPayload', required: true, description: 'Exact CLOB submission payload matching the signed order.' },
      ],
    },
    output: [
      'live market, token, order-book, tick-size, and negative-risk resolution',
      'public deposit-wallet deployment, pUSD balance, and exchange-allowance checks',
      'official CLOB V2 local-signing arguments',
      'validated buyer and market binding',
      'deterministic handoff correlation id',
      'exact direct-submit CLOB payload',
      'CLOB V2 builder attribution bound into the signed order',
      'X Layer service-payment proof',
    ],
    artifacts: [
      'exact Polymarket CLOB order payload',
      'handoffId and externalOrderId for correlation',
    ],
    safety: [
      'BUY only; FAK or FOK only',
      'default maximum maker amount is 25 USDC',
      'millisecond timestamp must be fresh and match the exact payload',
      'buyer can use the free preflight endpoint before paying',
      'buyer generates CLOB submission headers locally and submits directly to Polymarket',
      'CLOB credentials remain buyer-local and are never claimed as server-verified',
      'the serialized order payload contains the buyer API-key identifier as owner',
      'Polymarket CLOB performs final cryptographic signature verification',
      'PolyDesk never receives a private key, CLOB API secret, or CLOB passphrase',
    ],
  },
  {
    id: 'polymarket-portfolio-watch',
    title: 'Polymarket Portfolio Watch',
    description: 'Read-only public-wallet monitoring for Polymarket portfolio value, open positions, PnL, and claimable positions.',
    category: 'portfolio',
    endpoint: '/api/a2mcp/polymarket-portfolio-watch',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    request: {
      query: [
        { name: 'wallet', required: true, description: 'Public Polymarket 0x wallet to monitor.' },
        { name: 'limit', required: false, description: 'Maximum positions to inspect. Defaults to 50, max 100.' },
        { name: 'agent', required: false, description: 'Buyer-agent slug used for attribution in the response.' },
      ],
      headers: [
        { name: 'x-buyer-agent', required: false, description: 'Preferred buyer-agent identifier for attribution.' },
        { name: 'x-agent-slug', required: false, description: 'Fallback buyer-agent identifier.' },
      ],
    },
    output: [
      'portfolio value estimate',
      'open position count and top positions',
      'estimated open PnL',
      'claimable position list',
      'source and freshness metadata',
    ],
    artifacts: [
      'PolyDesk portfolio URL',
      'machine-readable wallet snapshot',
    ],
    safety: [
      'read-only public wallet monitoring',
      'PolyDesk does not custody funds or place trades for buyer agents',
      'portfolio values and claimable status should be rechecked on Polymarket before acting',
    ],
  },
  {
    id: 'worldcup-market-news',
    title: 'World Cup Market News',
    description: 'Market-moving World Cup headlines and tags for agents building prediction-market context.',
    category: 'market-intelligence',
    endpoint: '/api/a2mcp/worldcup-market-news',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    output: [
      'headline and description',
      'source and published time',
      'market-impact tag',
      'article URL for attribution',
    ],
  },
]

export function polyDeskAgentServices() {
  return services
}

export default function a2mcpServicesHandler(_req: Request, res: Response) {
  res.json({
    ok: true,
    provider: 'PolyDesk',
    protocol: 'A2MCP-ready x402 services',
    description: 'Prediction-market intelligence, World Cup live context, and paid Polymarket LP Scout services for buyer agents.',
    baseUrl: String(process.env.PUBLIC_APP_URL || 'https://polydesk.trade').replace(/\/+$/, ''),
    agentEconomyPositioning: 'Other agents can pay per call, receive a receipt-backed LP Scout report, and compose or resell the intelligence with proof links intact.',
    services,
  })
}
