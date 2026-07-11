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
  output: string[]
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
    output: [
      'best available LP opportunity when one passes the safety screen',
      'plain-language execution checklist',
      'risk flags and data gaps',
      'x402 receipt and ZeroScout/0G verification handoff',
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
  {
    id: 'worldcup-intelligence-bundle',
    title: 'World Cup Intelligence Bundle',
    description: 'Bundle service combining live scores, market news, and LP Scout context for buyer agents.',
    category: 'prediction-market',
    endpoint: '/api/a2mcp/worldcup-intelligence-bundle',
    method: 'GET',
    pricing: { model: 'x402-fixed', amount: '0.015', asset: 'USDC' },
    payment: { required: true, standard: 'x402' },
    output: [
      'live match context',
      'market-moving news context',
      'LP Scout signal when a clean setup is available',
      'agent-ready summary for resale or composition',
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
    services,
  })
}
