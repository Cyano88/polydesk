import type { Request, Response } from 'express'

type Dependencies = {
  fetch: typeof fetch
  apiOrigin: () => string
  apiKey: () => string
  publicOrigin: (req: Request) => string
}

export type HashPayLinkFundingStatus = {
  ok?: boolean
  fundingRequestId?: string
  status?: 'awaiting_payment' | 'bridging' | 'funded' | 'expired'
  paymentStatus?: string
  bridgeStatus?: string
  network?: string
  paymentTransaction?: string
  bridgeTransaction?: string
  receiptUrl?: string
  returnUrl?: string
  error?: string
}

function clean(value: unknown, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function env(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name], 500)
    if (value) return value
  }
  return ''
}

function configuredPublicOrigin(req: Request) {
  const configured = env('PUBLIC_APP_URL', 'POLYDESK_PUBLIC_ORIGIN', 'RENDER_EXTERNAL_URL')
  if (configured) return configured.replace(/\/+$/, '')
  const proto = clean(req.headers['x-forwarded-proto'], 20) || req.protocol || 'https'
  const host = clean(req.headers['x-forwarded-host'] || req.headers.host, 240)
  return host ? `${proto}://${host}` : 'https://polydesk.trade'
}

const defaults: Dependencies = {
  fetch,
  apiOrigin: () => env('HASH_PAYLINK_BASE_URL') || 'https://app.hashpaylink.com',
  apiKey: () => env('HASH_PAYLINK_API_KEY'),
  publicOrigin: configuredPublicOrigin,
}

function absoluteCheckoutUrl(apiOrigin: string, value: unknown) {
  const path = clean(value, 500)
  if (!path) return ''
  try {
    const url = new URL(path, `${apiOrigin.replace(/\/+$/, '')}/`)
    return url.origin === new URL(apiOrigin).origin ? url.toString() : ''
  } catch {
    return ''
  }
}

export async function fetchHashPayLinkPolymarketFundingStatus(fundingRequestId: string, dependencies: Pick<Dependencies, 'fetch' | 'apiOrigin' | 'apiKey'> = defaults) {
  const id = clean(fundingRequestId, 80)
  if (!/^pmf_[a-f0-9]{20}$/.test(id)) return { statusCode: 400, data: { ok: false, error: 'Invalid funding request id.' } as HashPayLinkFundingStatus }
  const apiKey = dependencies.apiKey()
  const apiOrigin = dependencies.apiOrigin().replace(/\/+$/, '')
  if (!apiKey || !/^https:\/\//i.test(apiOrigin)) return { statusCode: 503, data: { ok: false, error: 'Hash PayLink funding integration is not configured.' } as HashPayLinkFundingStatus }
  const upstream = await dependencies.fetch(`${apiOrigin}/api/v2/funding/polymarket/checkouts?id=${encodeURIComponent(id)}`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000),
  })
  const data = await upstream.json().catch(() => undefined) as HashPayLinkFundingStatus | undefined
  if (!data) return { statusCode: upstream.status, data: { ok: false, error: 'Hash PayLink returned an invalid status response.' } as HashPayLinkFundingStatus }
  const receiptUrl = data.receiptUrl ? absoluteCheckoutUrl(apiOrigin, data.receiptUrl) : ''
  return { statusCode: upstream.status, data: { ...data, ...(receiptUrl ? { receiptUrl } : { receiptUrl: undefined }) } }
}

export async function createHashPayLinkPolymarketFundingCheckout(input: {
  polymarketWallet: string
  amount: string
  networks: string[]
  requestId: string
  returnUrl: string
}, dependencies: Pick<Dependencies, 'fetch' | 'apiOrigin' | 'apiKey'> = defaults) {
  const apiKey = dependencies.apiKey()
  const apiOrigin = dependencies.apiOrigin().replace(/\/+$/, '')
  if (!apiKey || !/^https:\/\//i.test(apiOrigin)) return { statusCode: 503, data: { ok: false, error: 'Hash PayLink funding integration is not configured.' } as Record<string, unknown> }
  const upstream = await dependencies.fetch(`${apiOrigin}/api/v2/funding/polymarket/checkouts`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Idempotency-Key': `polydesk:funding:${input.requestId}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ polymarketWallet: input.polymarketWallet, amount: input.amount, networks: input.networks, returnUrl: input.returnUrl }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await upstream.json().catch(() => undefined) as Record<string, unknown> | undefined
  if (!data) return { statusCode: upstream.status, data: { ok: false, error: 'Hash PayLink returned an invalid checkout response.' } as Record<string, unknown> }
  if (!upstream.ok || !data.ok) return { statusCode: upstream.status, data }
  const checkoutUrl = absoluteCheckoutUrl(apiOrigin, data.checkoutUrl)
  if (!checkoutUrl) return { statusCode: 502, data: { ok: false, error: 'Hash PayLink returned an invalid checkout URL.' } as Record<string, unknown> }
  return { statusCode: upstream.status, data: { ...data, checkoutUrl } }
}

export function createHashPayLinkPolymarketFundingHandler(dependencies: Dependencies = defaults) {
  return async function hashPayLinkPolymarketFundingHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const apiKey = dependencies.apiKey()
      const apiOrigin = dependencies.apiOrigin().replace(/\/+$/, '')
      if (!apiKey || !/^https:\/\//i.test(apiOrigin)) return res.status(503).json({ ok: false, error: 'Hash PayLink funding integration is not configured.' })

      if (req.method === 'GET') {
        const fundingRequestId = clean(req.query?.id, 80)
        const result = await fetchHashPayLinkPolymarketFundingStatus(fundingRequestId, dependencies)
        return res.status(result.statusCode).json(result.data)
      }

      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
      const wallet = clean(req.body?.polymarketWallet, 64)
      const amount = clean(req.body?.amount, 40)
      const requestId = clean(req.body?.requestId, 80)
      const flow = clean(req.body?.flow, 20) === 'external' ? 'external' : 'portfolio'
      const networks = Array.isArray(req.body?.networks) ? req.body.networks.map((item: unknown) => clean(item, 20)).filter((item: string) => item === 'base' || item === 'arbitrum') : []
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ ok: false, error: 'Enter a valid Polymarket wallet.' })
      if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) < 3) return res.status(400).json({ ok: false, error: 'Enter at least 3 USDC.' })
      if (!/^[a-zA-Z0-9_-]{12,64}$/.test(requestId)) return res.status(400).json({ ok: false, error: 'Invalid funding request id.' })
      if (!networks.length) return res.status(400).json({ ok: false, error: 'Choose Base or Arbitrum.' })

      const returnParams = new URLSearchParams({ service: 'portfolio', notice: 'polymarket-funding-complete', portfolio: flow === 'external' ? 'external' : 'trading' })
      if (flow === 'portfolio') returnParams.set('wallet', 'balance')
      const returnUrl = `${dependencies.publicOrigin(req)}/polydesk?${returnParams.toString()}`
      const result = await createHashPayLinkPolymarketFundingCheckout({ polymarketWallet: wallet, amount, networks, requestId, returnUrl }, dependencies)
      return res.status(result.statusCode).json(result.data)
    } catch (error) {
      const timeout = error instanceof Error && /abort|timeout/i.test(error.message)
      return res.status(timeout ? 504 : 502).json({ ok: false, error: timeout ? 'Hash PayLink funding request timed out.' : 'Hash PayLink funding request failed.' })
    }
  }
}

export default createHashPayLinkPolymarketFundingHandler()
