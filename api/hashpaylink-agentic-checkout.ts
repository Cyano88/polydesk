import type { Request } from 'express'
import { isAddress, parseUnits } from 'viem'

type AgenticNetwork = 'arc' | 'base'

type Dependencies = {
  fetch: typeof fetch
  apiOrigin: () => string
  apiKey: (network: AgenticNetwork) => string
  publicOrigin: (req: Request) => string
}

type CheckoutResponse = {
  ok?: boolean
  checkoutId?: string
  paymentAttemptId?: string
  checkoutUrl?: string
  agentPaymentUrl?: string
  network?: string
  error?: string
}

type StatusResponse = {
  ok?: boolean
  checkoutId?: string
  checkoutMode?: string
  status?: string
  network?: string
  paymentAttempt?: {
    id?: string
    receiptId?: string
    receiptUrl?: string
  }
  payment?: {
    status?: string
    payer?: string
    amount?: string
    network?: string
    txHash?: string
  }
  error?: string
}

export type HashPayLinkAgenticResult =
  | { kind: 'challenge'; status: 402; paymentRequired: string; body: string; checkoutUrl: string }
  | {
      kind: 'paid'
      checkoutId: string
      paymentAttemptId: string
      payment: {
        verified: true
        payer: string
        amount: string
        network: string
        transaction: string
        asset: 'USDC'
        provider: 'Hash PayLink · Circle Gateway x402'
        kind: 'circle_gateway_x402'
        serviceUrl: string
        receiptUrl: string
      }
    }

function clean(value: unknown, max = 300) {
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
  apiKey: network => network === 'arc'
    ? env('HASH_PAYLINK_AGENTIC_TEST_API_KEY')
    : env('HASH_PAYLINK_AGENTIC_LIVE_API_KEY', 'HASH_PAYLINK_API_KEY'),
  publicOrigin: configuredPublicOrigin,
}

function sameOriginUrl(apiOrigin: string, value: unknown) {
  const path = clean(value, 600)
  if (!path) return ''
  try {
    const origin = new URL(apiOrigin)
    const url = new URL(path, `${origin.origin}/`)
    return url.origin === origin.origin && url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function requestId(value: unknown) {
  const id = clean(value, 64)
  return /^[a-zA-Z0-9_-]{16,64}$/.test(id) ? id : ''
}

function selectedNetwork(value: unknown): AgenticNetwork | '' {
  const network = clean(value, 20).toLowerCase()
  return network === 'arc' || network === 'base' ? network : ''
}

function selectedAmount(value: unknown) {
  const amount = clean(value, 40).replace(/^\$/, '')
  return /^\d+(?:\.\d{1,6})?$/.test(amount) && Number(amount) > 0 ? amount : ''
}

function signature(req: Request) {
  const value = req.headers['payment-signature']
  return clean(Array.isArray(value) ? value[0] : value, 24_000)
}

export async function protectLpScoutWithHashPayLink(input: {
  req: Request
  requestId: unknown
  network: unknown
  amount: unknown
}, dependencies: Dependencies = defaults): Promise<HashPayLinkAgenticResult> {
  const id = requestId(input.requestId)
  const network = selectedNetwork(input.network)
  const amount = selectedAmount(input.amount)
  if (!id) throw Object.assign(new Error('LP Scout requires a unique requestId between 16 and 64 characters.'), { status: 400 })
  if (!network) throw Object.assign(new Error('LP Scout network must be arc or base.'), { status: 400 })
  if (!amount) throw Object.assign(new Error('LP Scout price is invalid.'), { status: 503 })

  const apiOrigin = dependencies.apiOrigin().replace(/\/+$/, '')
  const apiKey = dependencies.apiKey(network)
  if (!apiKey || !/^https:\/\//i.test(apiOrigin)) {
    throw Object.assign(new Error(`Hash PayLink ${network === 'arc' ? 'test' : 'live'} agentic checkout is not configured.`), { status: 503 })
  }
  const returnUrl = `${dependencies.publicOrigin(input.req).replace(/\/+$/, '')}/polydesk?service=lp-scout&run=polymarket-scout&requestId=${encodeURIComponent(id)}&network=${encodeURIComponent(network)}&maxAmount=${encodeURIComponent(amount)}`
  const created = await dependencies.fetch(`${apiOrigin}/api/v2/checkouts`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Idempotency-Key': `polydesk:lp-scout:${id}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      kind: 'service',
      checkoutMode: 'agentic',
      agenticType: 'agent_treasury',
      network,
      title: 'Polymarket LP Scout',
      description: 'Verified Polymarket liquidity-provider research.',
      amount,
      returnUrl,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const checkout = await created.json().catch(() => undefined) as CheckoutResponse | undefined
  if (!created.ok || !checkout?.ok) {
    throw Object.assign(new Error(checkout?.error || 'Hash PayLink could not create the LP Scout checkout.'), { status: created.status || 502 })
  }
  if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(checkout.checkoutId ?? '') || !/^pat_[a-f0-9]{24}$/.test(checkout.paymentAttemptId ?? '')) {
    throw Object.assign(new Error('Hash PayLink returned an invalid LP Scout checkout.'), { status: 502 })
  }
  if (checkout.network !== network) throw Object.assign(new Error('Hash PayLink returned the wrong LP Scout network.'), { status: 502 })
  const checkoutUrl = sameOriginUrl(
    apiOrigin,
    checkout.checkoutUrl || `/pay/a/${encodeURIComponent(checkout.checkoutId!)}?attempt=${encodeURIComponent(checkout.paymentAttemptId!)}`,
  )
  if (!checkoutUrl) throw Object.assign(new Error('Hash PayLink returned an invalid hosted checkout URL.'), { status: 502 })
  const paymentUrl = sameOriginUrl(apiOrigin, checkout.agentPaymentUrl)
  if (!paymentUrl) throw Object.assign(new Error('Hash PayLink returned an invalid agent payment URL.'), { status: 502 })

  const paymentSignature = signature(input.req)
  const paidResponse = await dependencies.fetch(paymentUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(paymentSignature ? { 'PAYMENT-SIGNATURE': paymentSignature } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  const responseBody = await paidResponse.text()
  if (paidResponse.status === 402) {
    const paymentRequired = clean(paidResponse.headers.get('payment-required'), 24_000)
    if (!paymentRequired) throw Object.assign(new Error('Hash PayLink returned an incomplete payment challenge.'), { status: 502 })
    return { kind: 'challenge', status: 402, paymentRequired, body: responseBody, checkoutUrl }
  }
  if (!paidResponse.ok) {
    const errorBody = (() => { try { return JSON.parse(responseBody) as { error?: string } } catch { return undefined } })()
    throw Object.assign(new Error(errorBody?.error || 'Hash PayLink rejected the LP Scout payment.'), { status: paidResponse.status || 502 })
  }

  const statusResponse = await dependencies.fetch(`${apiOrigin}/api/v2/checkouts?purpose=status&id=${encodeURIComponent(checkout.checkoutId!)}`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  })
  const status = await statusResponse.json().catch(() => undefined) as StatusResponse | undefined
  const payment = status?.payment
  if (!statusResponse.ok || !status?.ok || status.checkoutMode !== 'agentic' || status.status !== 'paid' || payment?.status !== 'paid') {
    throw Object.assign(new Error(status?.error || 'Hash PayLink has not confirmed the LP Scout payment.'), { status: 409 })
  }
  if (
    status.checkoutId !== checkout.checkoutId
    || status.paymentAttempt?.id !== checkout.paymentAttemptId
    || (payment.network || status.network) !== network
    || payment.amount !== amount
  ) {
    throw Object.assign(new Error('Hash PayLink LP Scout payment details do not match the request.'), { status: 409 })
  }
  if (!isAddress(payment.payer ?? '') || !clean(payment.txHash, 100)) {
    throw Object.assign(new Error('Hash PayLink returned incomplete LP Scout payment proof.'), { status: 502 })
  }
  const receiptUrl = sameOriginUrl(apiOrigin, status.paymentAttempt?.receiptUrl || checkoutUrl)
  if (!receiptUrl) throw Object.assign(new Error('Hash PayLink returned an invalid LP Scout receipt URL.'), { status: 502 })
  return {
    kind: 'paid',
    checkoutId: checkout.checkoutId!,
    paymentAttemptId: checkout.paymentAttemptId!,
    payment: {
      verified: true,
      payer: payment.payer!,
      amount: parseUnits(amount, 6).toString(),
      network,
      transaction: payment.txHash!,
      asset: 'USDC',
      provider: 'Hash PayLink · Circle Gateway x402',
      kind: 'circle_gateway_x402',
      serviceUrl: paymentUrl,
      receiptUrl,
    },
  }
}
