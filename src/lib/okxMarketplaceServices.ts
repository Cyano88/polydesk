import { manageMyPolymarketAgent, oneOffTradeMission, polydeskMarketplaceProducts } from './polydeskMarketplaceProducts'

export type OkxMarketplaceService = {
  key: 'football-live' | 'football-news' | 'verified-funding' | 'governed-trader' | 'lp-scout' | 'smart-trader'
  serviceId: number
  name: string
  summary: string
  endpoint: string
  match: RegExp
}

const OKX_AGENT_ID = 5427
const OKX_AGENT_URL = `https://www.okx.ai/agents/${OKX_AGENT_ID}`

export const okxTradingAgentService = {
  serviceId: manageMyPolymarketAgent.marketplace.serviceId as number,
  name: manageMyPolymarketAgent.name,
  summary: manageMyPolymarketAgent.scope,
  subscriptionUsdtMonthly: manageMyPolymarketAgent.pricing.amountUsdt as number,
  freeTrialDays: manageMyPolymarketAgent.pricing.freeTrialDays as number,
} as const

export const okxTradingTaskService = {
  serviceId: oneOffTradeMission.marketplace.serviceId as number,
  name: oneOffTradeMission.name,
  summary: oneOffTradeMission.scope,
  priceUsdt: oneOffTradeMission.pricing.amountUsdt as number,
} as const

export { polydeskMarketplaceProducts }

export const okxMarketplaceServices: OkxMarketplaceService[] = [
  {
    key: 'football-live',
    serviceId: 33343,
    name: 'Football Match Live Data',
    summary: 'Provider-verified fixtures, scores, events, and a Polymarket link when confidently matched.',
    endpoint: 'https://polydesk.trade/api/a2mcp/worldcup-live-scores',
    match: /\b(football match live data|football data|live match data|live football|live scores?|match scores?|fixtures?|scores?)\b/i,
  },
  {
    key: 'football-news',
    serviceId: 33346,
    name: 'Football News Brief',
    summary: 'Current football headlines, canonical sources, and matched market links when available.',
    endpoint: 'https://polydesk.trade/api/a2mcp/worldcup-market-news',
    match: /\b(football news brief|football news|news brief|football headlines?|sports news|news)\b/i,
  },
  {
    key: 'verified-funding',
    serviceId: 33344,
    name: 'Verified Polymarket Funding',
    summary: 'Deposit Wallet derivation, readiness proof, and a checkout only for a verified shortfall.',
    endpoint: 'https://polydesk.trade/api/a2mcp/polymarket-funding-link',
    match: /\b(verified polymarket funding|verified funding|funding service|fund polymarket|deposit wallet|funding checkout|funding)\b/i,
  },
  {
    key: 'governed-trader',
    serviceId: 33345,
    name: 'Governed Polymarket Trader',
    summary: 'Watch or pick, verify readiness, enforce a mandate, then hand off a buyer-signed trade.',
    endpoint: 'https://polydesk.trade/api/a2mcp/polymarket-portfolio-watch',
    match: /\b(governed polymarket trader|governed trader|governed trade|copy trade|trade service|trading service)\b/i,
  },
  {
    key: 'lp-scout',
    serviceId: 33342,
    name: 'Polymarket LP Scout',
    summary: 'Maker-focused research across rewards, spread, depth, and execution risk.',
    endpoint: 'https://polydesk.trade/api/a2mcp/okx/polymarket-lp-scout',
    match: /\b(polymarket lp scout|lp scout|liquidity scout|maker research|lp research|lp)\b/i,
  },
  {
    key: 'smart-trader',
    serviceId: 40269,
    name: 'Smart Market OOS Trader',
    summary: 'Evidence-backed market analysis with durable decisions and a preview-first handoff to the official Polymarket trading integration.',
    endpoint: 'https://polydesk.trade/api/a2mcp/polymarket-smart-trader',
    match: /\b(smart market oos trader|smart market trader|smart trader|market analysis|direct trade intelligence)\b/i,
  },
]

export function okxMarketplaceServiceUrl(service: Pick<OkxMarketplaceService, 'serviceId'>) {
  return `${OKX_AGENT_URL}?source=polydesk#service-${service.serviceId}`
}

export function wantsOkxMarketplaceServices(value: string) {
  const text = value.trim()
  if (!text) return false
  return /\b(okx(?:\.ai)?|agent marketplace|marketplace|pay[- ]?per[- ]?call|agentic services?|agent services?)\b/i.test(text)
    && /\b(polydesk|service|services|use|open|find|show|browse|access|call|buy|pay)\b/i.test(text)
}

export function matchOkxMarketplaceService(value: string) {
  return okxMarketplaceServices.find(service => service.match.test(value)) ?? null
}

export function okxMarketplaceServiceLinks() {
  return polydeskMarketplaceProducts.flatMap(product => product.marketplace.serviceId ? [{
    label: product.name,
    url: okxMarketplaceServiceUrl({ serviceId: product.marketplace.serviceId }),
  }] : [])
}
