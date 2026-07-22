import type { Request, Response } from 'express'

type PolyDeskAgentService = {
  id: string
  title: string
  description: string
  category: 'prediction-market' | 'sports-data' | 'market-intelligence' | 'funding' | 'portfolio'
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
    title: 'World Cup Live Scores',
    description: 'Agent-readable World Cup fixture, score, clock, status, and Polymarket market-routing feed.',
    category: 'sports-data',
    endpoint: '/api/a2mcp/worldcup-live-scores',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    output: [
      'match status and score',
      'clock and kickoff context',
      'linked Polymarket market context when matched',
      'trade-option metadata for PolyDesk routing',
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
