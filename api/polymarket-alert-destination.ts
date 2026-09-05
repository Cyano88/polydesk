export type PolymarketIntegrationSource = 'polydesk' | 'okx-ai' | 'circle-marketplace'

type PortfolioDestinationConfig = {
  polydeskUrl?: unknown
  okxAiUrl?: unknown
  circleMarketplaceUrl?: unknown
}

const DEFAULT_POLYDESK_INTEGRATIONS_URL = 'https://polydesk.trade/integrations'
const DEFAULT_OKX_AI_URL = 'https://www.okx.ai/agents/5427'

function safeHttpsUrl(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

export function polymarketIntegrationSource(value: unknown): PolymarketIntegrationSource | null {
  const source = String(value ?? '').trim().toLowerCase()
  if (source === 'polydesk' || source === 'direct' || source === 'web') return 'polydesk'
  if (source === 'okx-ai' || source === 'okx.ai' || source === 'okx') return 'okx-ai'
  if (source === 'circle-marketplace' || source === 'circle') return 'circle-marketplace'
  return null
}

export function polymarketPortfolioDestination(
  value: unknown,
  config: PortfolioDestinationConfig = {},
) {
  const source = polymarketIntegrationSource(value) ?? 'polydesk'
  const polydeskUrl = safeHttpsUrl(config.polydeskUrl) || DEFAULT_POLYDESK_INTEGRATIONS_URL
  if (source === 'okx-ai') {
    return {
      source,
      label: 'Open in OKX.AI',
      url: safeHttpsUrl(config.okxAiUrl) || DEFAULT_OKX_AI_URL,
    }
  }
  if (source === 'circle-marketplace') {
    const circleUrl = safeHttpsUrl(config.circleMarketplaceUrl)
    return circleUrl
      ? { source, label: 'Open in Circle', url: circleUrl }
      : { source: 'polydesk' as const, label: 'View PolyDesk services', url: polydeskUrl }
  }
  return { source, label: 'View PolyDesk services', url: polydeskUrl }
}
