import type { Request, Response } from 'express'

type Service = {
  id: string
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

const services: Service[] = [
  {
    id: 'polymarket-lp-scout',
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
    name: 'Football Match Live Data',
    oneLine: 'Reuse provider-truth fixtures, live scores, match events, and verified Polymarket trade metadata.',
    endpoint: '/api/a2mcp/football-live-data',
    method: 'POST',
    price: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    useWhen: 'An agent needs current football data and an instant-trade link when PolyDesk confidently matches an active Polymarket event.',
    input: ['optional date in YYYY-MM-DD'],
    returns: ['fixture and status', 'score and match events when available', 'source metadata', 'Polymarket event URL, token IDs, price, tick size, and minimum size when matched'],
    boundary: 'No match data means no payment challenge. PolyDesk never invents a score or market match.',
  },
  {
    id: 'football-news-brief',
    name: 'Football News Brief',
    oneLine: 'Reuse current football headlines with source links and related active Polymarket events.',
    endpoint: '/api/a2mcp/football-news-brief',
    method: 'POST',
    price: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    useWhen: 'An agent needs current football attention signals it can cite, summarize, or connect to an active market.',
    input: [],
    returns: ['headline and concise description', 'publisher and source URL', 'published time', 'deterministically matched Polymarket event URL and slug when available'],
    boundary: 'Provider-backed articles only. Empty, fallback, or non-football feeds are not sold.',
  },
  {
    id: 'verified-polymarket-funding',
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
    boundary: 'A mismatched wallet is rejected before x402. Checkout settlement must complete before trading.',
  },
  {
    id: 'governed-polymarket-trader',
    name: 'Governed Polymarket Trader',
    oneLine: 'Watch, pick, or copy a public signal; verify the buyer account; fund if needed; enforce a mandate; submit directly; publish proof.',
    endpoint: '/api/a2mcp/polymarket-agent-flow',
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
]

export function polyDeskAgentServices() {
  return services
}

export default function a2mcpServicesHandler(_req: Request, res: Response) {
  res.json({
    ok: true,
    provider: 'PolyDesk',
    agentId: 5427,
    protocol: 'OKX Agent Payments Protocol',
    baseUrl: String(process.env.PUBLIC_APP_URL || 'https://polydesk.trade').replace(/\/+$/, ''),
    summary: 'Five focused services: football data, football news, LP research, verified funding, and governed buyer-controlled trading.',
    rule: 'Every paid service returns machine-readable JSON. Empty provider data and invalid preflight requests are rejected before payment.',
    services,
    docs: '/docs/okx-ai',
  })
}
