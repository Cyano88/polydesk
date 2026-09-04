const DATA_API_ORIGIN = 'https://data-api.polymarket.com'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ATTEMPTS = 3
const MAX_RETRY_DELAY_MS = 10_000

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

type FetchOptions = {
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  timeoutMs?: number
  maxAttempts?: number
}

function errorMessage(data: unknown, text: string, status: number) {
  const remote = typeof data === 'object' && data && 'error' in data
    ? String((data as { error?: unknown }).error ?? '').trim()
    : ''
  return remote || text.slice(0, 160) || `Polymarket data-api HTTP ${status}`
}

export function polymarketRetryDelayMs(retryAfter: string | null, attempt: number, now = Date.now()) {
  const header = retryAfter?.trim() ?? ''
  const seconds = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : Number.NaN
  const dateDelay = header && !Number.isFinite(seconds) ? Date.parse(header) - now : Number.NaN
  const requested = Number.isFinite(seconds) ? seconds * 1_000 : dateDelay
  return Math.max(250, Math.min(MAX_RETRY_DELAY_MS,
    Number.isFinite(requested) ? requested : 1_000 * (attempt + 1)))
}

export async function fetchPolymarketData<T>(path: string, options: FetchOptions = {}): Promise<T> {
  if (!path.startsWith('/')) throw new Error('Polymarket data-api path must be relative.')
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS))
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${DATA_API_ORIGIN}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      const text = await response.text()
      let data: unknown = null
      try { data = text ? JSON.parse(text) : null } catch { data = null }
      if (response.ok) return data as T

      lastError = new Error(errorMessage(data, text, response.status))
      if (!TRANSIENT_STATUS.has(response.status) || attempt + 1 >= maxAttempts) throw lastError
      const delayMs = polymarketRetryDelayMs(response.headers.get('retry-after'), attempt)
      console.warn('[polymarket-data-api] transient response', {
        path: new URL(path, DATA_API_ORIGIN).pathname,
        status: response.status,
        attempt: attempt + 1,
        delayMs,
      })
      await sleep(delayMs)
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Polymarket data-api request failed.')
      if (lastError === normalized || attempt + 1 >= maxAttempts) throw normalized
      lastError = normalized
      await sleep(1_000 * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError ?? new Error('Polymarket data-api retry budget exhausted.')
}
