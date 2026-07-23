type ServiceEnvironment = Record<string, string | undefined>

const FALLBACK_ORIGIN = 'https://polydesk.trade'
const LP_SCOUT_PATH = '/api/x402/polymarket-scout'

function validHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      ? url
      : null
  } catch {
    return null
  }
}

export function polydeskServiceOrigin(environment: ServiceEnvironment = process.env) {
  const configured = [
    environment.POLYDESK_BASE_URL,
    environment.PUBLIC_POLYDESK_ORIGIN,
    environment.PUBLIC_APP_URL,
    environment.RENDER_EXTERNAL_URL,
  ].find(value => String(value ?? '').trim())
  const url = validHttpUrl(String(configured ?? FALLBACK_ORIGIN).trim()) ?? new URL(FALLBACK_ORIGIN)
  return url.origin
}

export function agentServicePolicy(environment: ServiceEnvironment = process.env) {
  const defaultScoutUrl = new URL(LP_SCOUT_PATH, polydeskServiceOrigin(environment)).toString()
  const configured = String(
    environment.AGENT_WALLET_ALLOWED_SERVICE_URLS
      ?? environment.X402_POLYMARKET_SCOUT_URL
      ?? '',
  )
    .split(',')
    .map(value => validHttpUrl(value.trim())?.toString() ?? '')
    .filter(Boolean)

  return {
    defaultScoutUrl,
    allowedServiceUrls: new Set([defaultScoutUrl, ...configured]),
  }
}
