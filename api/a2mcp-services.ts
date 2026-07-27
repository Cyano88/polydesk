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
    authorization?: {
      endpoint: string
      method: 'POST'
      description: string
    }
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
        { name: 'scoutMode', required: false, description: 'Use best for the ranked shortlist or market for one exact market.', values: ['best', 'market'] },
        { name: 'context', required: false, description: 'Required for market mode: a Polymarket event URL or slug.' },
        { name: 'budget', required: false, description: 'Human budget context in USDC. Used for sizing guidance only; PolyDesk does not trade.' },
        { name: 'agent', required: false, description: 'Buyer-agent slug used to store receipts and reports.' },
      ],
      headers: [
        { name: 'x-buyer-agent', required: false, description: 'Preferred buyer-agent identifier for receipt/report attribution.' },
        { name: 'x-agent-slug', required: false, description: 'Fallback buyer-agent identifier.' },
      ],
    },
    output: [
      'up to 10 ranked LP opportunities in best mode when they pass the safety screen',
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
        { name: 'scoutMode', required: false, description: 'Use best for the ranked shortlist or market for one exact market.', values: ['best', 'market'] },
        { name: 'context', required: false, description: 'Required for market mode: a Polymarket event URL or slug.' },
        { name: 'budget', required: false, description: 'Human budget context in USDC. Used for sizing guidance only; PolyDesk does not trade.' },
        { name: 'agent', required: false, description: 'Buyer-agent slug used to store receipts and reports.' },
      ],
      headers: [
        { name: 'x-buyer-agent', required: false, description: 'Preferred buyer-agent identifier for receipt/report attribution.' },
        { name: 'x-agent-slug', required: false, description: 'Fallback buyer-agent identifier.' },
      ],
    },
    output: [
      'up to 10 ranked LP opportunities in best mode when they pass the safety screen',
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
    title: 'Verified Polymarket Funding',
    description: 'Derive and verify an owner EOA’s deployed Polymarket Deposit Wallet, check its pUSD balance, and create a Hash PayLink USDC checkout only when funding is needed.',
    category: 'funding',
    endpoint: '/api/a2mcp/polymarket-funding-link',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    request: {
      query: [
        { name: 'ownerAddress', required: true, description: 'Public owner EOA that controls the Polymarket Deposit Wallet.' },
        { name: 'wallet', required: false, description: 'Optional claimed Polymarket Deposit Wallet. It must match the wallet derived from ownerAddress.' },
        { name: 'requiredBalanceUsdc', required: false, description: 'Required pUSD balance for the intended buy. PolyDesk creates a checkout only for the verified shortfall.' },
        { name: 'amount', required: false, description: 'Direct USDC top-up amount when requiredBalanceUsdc is not supplied. Hosted checkout minimum is currently 3 USDC.' },
        { name: 'network', required: false, description: 'Funding network. Defaults to Base.', values: ['base', 'arbitrum'] },
        { name: 'agent', required: false, description: 'Buyer-agent slug used for attribution in the response.' },
      ],
      headers: [
        { name: 'x-buyer-agent', required: false, description: 'Preferred buyer-agent identifier for attribution.' },
        { name: 'x-agent-slug', required: false, description: 'Fallback buyer-agent identifier.' },
      ],
    },
    output: [
      'derived and deployed Deposit Wallet verification',
      'current pUSD balance and required shortfall',
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
          { name: 'maxSpendUsdc', required: true, description: 'Maximum pUSD spend authorized by the buyer.' },
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
      'spend is limited by the buyer wallet balance and allowance',
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
    id: 'polymarket-governed-open',
    title: 'Polymarket Governed Market OPEN',
    description: 'Apply deterministic spending limits to an exact buyer-signed Polymarket BUY order and return APPROVE, ESCALATE, or BLOCK without receiving private keys or reusable CLOB credentials.',
    category: 'trading',
    endpoint: '/api/a2mcp/polymarket-governed-open',
    method: 'POST',
    pricing: { model: 'x402-fixed', amount: '0.1', asset: 'USDT', network: 'X Layer' },
    payment: { required: true, standard: 'x402' },
    request: {
      authorization: {
        endpoint: '/api/polymarket-governed-open/authorize',
        method: 'POST',
        description: 'Return the canonical mandate and exact personal-sign message before order evaluation or payment.',
      },
      preflight: {
        endpoint: '/api/polymarket-governed-open/validate',
        method: 'POST',
        description: 'Free deterministic mandate evaluation before paying the OKX x402 challenge.',
      },
      body: [
        { name: 'externalOrderId', required: true, description: 'Caller-generated idempotency identifier, 8-80 safe characters.' },
        { name: 'marketUrl', required: true, description: 'Canonical allowlisted polymarket.com market URL.' },
        { name: 'marketTitle', required: true, description: 'Human-readable market title shown to the buyer.' },
        { name: 'outcome', required: true, description: 'Outcome being bought.' },
        { name: 'tokenId', required: true, description: 'Exact numeric Polymarket CLOB outcome token.' },
        { name: 'signer', required: true, description: 'Buyer-controlled signer bound by the mandate.' },
        { name: 'orderType', required: true, description: 'Immediate order type.', values: ['FAK', 'FOK'] },
        { name: 'order', required: true, description: 'Exact buyer-signed Polymarket v2 BUY order.' },
        { name: 'orderPayload', required: true, description: 'Exact direct-submit CLOB payload matching the signed order.' },
        { name: 'mandate', required: true, description: 'Authority-signed maximum amount, maximum price, allowlisted token and market, order signer, authority signer, expiry, and optional human-approval threshold.' },
      ],
    },
    output: [
      'deterministic APPROVE, ESCALATE, or BLOCK decision',
      'amount, price, market, token, signer, and expiry decision trace',
      'order, mandate, and decision hashes',
      'duplicate-safe externalOrderId binding in durable storage',
      'exact buyer-local CLOB submission handoff only when approved',
      'X Layer service-payment proof',
    ],
    artifacts: [
      'executionId and externalOrderId',
      'machine-readable policy decision trace',
      'exact approved CLOB payload',
    ],
    safety: [
      'BUY only; immediate FAK or FOK only',
      'no language model decides whether the order is allowed',
      'the authority signature binds the mandate to the policy version, X Layer, and externalOrderId',
      'changed amount, price, market, token, signer, or externalOrderId binding is blocked',
      'free preflight is available before payment',
      'paid route refuses to challenge the buyer unless durable storage is ready',
      'buyer generates CLOB headers locally and submits directly to Polymarket',
      'PolyDesk never receives a private key, CLOB API secret, or CLOB passphrase',
    ],
  },
  {
    id: 'polymarket-portfolio-watch',
    title: 'Polymarket Portfolio Watch',
    description: 'Public-wallet positions plus exact recent BUY signals that another agent can safely turn into a buyer-signed governed copy intent.',
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
      'exact recent BUY activities with transaction hashes and token IDs',
      'existing-position copy intents with exact condition and outcome token IDs',
      'deterministic AUTO_BEST_FIT execution-quality ranking under a caller-supplied policy',
      'copy-intent handoff to the free buyer-account verification endpoint',
      'source and freshness metadata',
    ],
    artifacts: [
      'PolyDesk portfolio URL',
      'machine-readable wallet snapshot',
      'POST /api/polymarket-copy/prepare handoff',
    ],
    safety: [
      'the watched wallet is a signal source only and never authorizes buyer funds',
      'copy preparation derives and verifies the buyer Deposit Wallet from the buyer owner EOA',
      'PolyDesk does not receive buyer private keys or CLOB secrets',
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
