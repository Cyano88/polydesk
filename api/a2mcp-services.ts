import type { Request, Response } from 'express'

type PolyDeskAgentService = {
  id: string
  title: string
  description: string
  category: 'prediction-market' | 'sports-data' | 'market-intelligence'
  endpoint: string
  method: 'GET' | 'POST'
  pricing: {
    model: 'free' | 'x402-fixed'
    amount: string
    asset: 'USDC'
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
    pricing: { model: 'x402-fixed', amount: '0.01', asset: 'USDC' },
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
    id: 'worldcup-live-scores',
    title: 'World Cup Live Scores',
    description: 'Agent-readable World Cup fixture, score, clock, status, and Polymarket market-routing feed.',
    category: 'sports-data',
    endpoint: '/api/a2mcp/worldcup-live-scores',
    method: 'GET',
    pricing: { model: 'free', amount: '0', asset: 'USDC' },
    payment: { required: false, standard: 'none' },
    output: [
      'match status and score',
      'clock and kickoff context',
      'linked Polymarket market context when matched',
      'trade-option metadata for PolyDesk routing',
    ],
  },
  {
    id: 'worldcup-market-news',
    title: 'World Cup Market News',
    description: 'Market-moving World Cup headlines and tags for agents building prediction-market context.',
    category: 'market-intelligence',
    endpoint: '/api/a2mcp/worldcup-market-news',
    method: 'GET',
    pricing: { model: 'free', amount: '0', asset: 'USDC' },
    payment: { required: false, standard: 'none' },
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
    baseUrl: 'https://polydesk-i96m.onrender.com',
    agentEconomyPositioning: 'Other agents can pay per call, receive a receipt-backed LP Scout report, and compose or resell the intelligence with proof links intact.',
    services,
  })
}
