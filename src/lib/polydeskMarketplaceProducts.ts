export type PolyDeskMarketplaceProduct = {
  id: 'one-off-trade-mission' | 'manage-my-polymarket-agent' | 'polymarket-integration-conformance-audit'
  name: string
  type: 'A2A'
  scope: string
  lifecycle: 'one-off' | 'subscription' | 'assessment'
  implementationStatus: 'production' | 'production-capabilities' | 'planned'
  marketplace: {
    serviceId: number | null
    currentListingName: string | null
    migrationStatus: 'rename-pending' | 'not-listed'
  }
  pricing: {
    mode: 'per-task' | 'subscription' | 'quote'
    amountUsdt: number | null
    interval?: 'month'
    freeTrialDays?: number
  }
  includes: readonly string[]
  boundary: string
}

export const oneOffTradeMission: PolyDeskMarketplaceProduct = {
  id: 'one-off-trade-mission',
  name: 'One-Off Trade Mission',
  type: 'A2A',
  scope: 'One bounded Polymarket mission from request and intelligence through readiness, buyer approval, execution handoff, and verified receipt.',
  lifecycle: 'one-off',
  implementationStatus: 'production-capabilities',
  marketplace: {
    serviceId: 38484,
    currentListingName: 'PolyDesk Trading Agent',
    migrationStatus: 'rename-pending',
  },
  pricing: { mode: 'per-task', amountUsdt: 0.1 },
  includes: [
    'market and public-wallet intelligence',
    'account-readiness and verified-shortfall funding routing',
    'bounded buyer-approved execution handoff',
    'public completion and PnL evidence',
  ],
  boundary: 'The mission ends after one result. It does not continuously monitor wallets or authorize future trades.',
}

export const manageMyPolymarketAgent: PolyDeskMarketplaceProduct = {
  id: 'manage-my-polymarket-agent',
  name: 'Manage My Polymarket Agent',
  type: 'A2A',
  scope: 'Continuous portfolio and configured-address monitoring with verified email alerts, scheduled summaries, and optional separately authorized bounded copy trading.',
  lifecycle: 'subscription',
  implementationStatus: 'production-capabilities',
  marketplace: {
    serviceId: 38496,
    currentListingName: 'PolyDesk Trading Membership',
    migrationStatus: 'rename-pending',
  },
  pricing: { mode: 'subscription', amountUsdt: 5, interval: 'month', freeTrialDays: 3 },
  includes: [
    'funding and matched-trade notifications',
    'profit, loss, new-position, resolution, and claimable alerts',
    'daily or weekly portfolio summaries',
    'allowlisted originating-platform links',
  ],
  boundary: 'Monitoring does not grant trading authority. Sell, close, claim, or copy execution requires a separate explicit bounded authorization.',
}

export const polymarketIntegrationConformanceAudit: PolyDeskMarketplaceProduct = {
  id: 'polymarket-integration-conformance-audit',
  name: 'Polymarket Integration Conformance Audit',
  type: 'A2A',
  scope: 'A fixed-scope, evidence-backed assessment of one external platform\'s Polymarket payment, wallet, authorization, execution, recovery, and receipt controls.',
  lifecycle: 'assessment',
  implementationStatus: 'production-capabilities',
  marketplace: {
    serviceId: null,
    currentListingName: null,
    migrationStatus: 'not-listed',
  },
  pricing: { mode: 'per-task', amountUsdt: 25 },
  includes: [
    'machine-readable conformance report',
    'human-readable findings and remediation plan',
    'evidence manifest with hashes and timestamps',
    'optional continuous production monitoring recommendation',
  ],
  boundary: 'This is an integration conformance assessment, not a guarantee of profitability or a formal security certification.',
}

export const polydeskMarketplaceProducts = [
  oneOffTradeMission,
  manageMyPolymarketAgent,
  polymarketIntegrationConformanceAudit,
] as const

export function marketplaceProductUrl(product: PolyDeskMarketplaceProduct) {
  return product.marketplace.serviceId
    ? 'https://www.okx.ai/agents/5427?source=polydesk#service-' + product.marketplace.serviceId
    : null
}
