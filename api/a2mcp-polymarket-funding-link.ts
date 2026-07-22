import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { isAddress } from 'viem'
import { cleanNetwork, minimumUsdcFor, type BridgeNetwork } from './polymarket-bridge.js'
import { createHashPayLinkPolymarketFundingCheckout } from './hashpaylink-polymarket-funding.js'

function cleanText(value: unknown, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function polydeskOrigin() {
  return (process.env.PUBLIC_APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'https://polydesk.trade').trim().replace(/\/+$/, '')
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return ''
  return raw
}

function requestValue(req: Request, ...names: string[]) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {}
  for (const name of names) {
    const value = req.query[name] ?? body[name]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function networkLabel(network: BridgeNetwork) {
  if (network === 'arbitrum') return 'Arbitrum'
  return 'Base'
}

export default async function a2mcpPolymarketFundingLinkHandler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const polymarketWallet = cleanText(requestValue(req, 'wallet', 'polymarketWallet', 'pmw'), 64)
    const amount = cleanAmount(requestValue(req, 'amount', 'a'))
    const network = cleanNetwork(requestValue(req, 'network', 'n'))
    const buyerAgent = cleanText(requestValue(req, 'agent') ?? req.headers['x-buyer-agent'] ?? req.headers['x-agent-slug'], 64) || 'external-agent'
    const minimumUsdc = minimumUsdcFor(network)
    const amountNumber = Number(amount)

    if (!isAddress(polymarketWallet)) {
      return res.status(400).json({
        ok: false,
        error: 'Provide a valid public Polymarket 0x wallet address.',
      })
    }
    if (!amount || !Number.isFinite(amountNumber) || amountNumber < minimumUsdc) {
      return res.status(400).json({
        ok: false,
        error: `Provide an amount of at least ${minimumUsdc} USDC.`,
        minimumUsdc,
      })
    }
    if (network !== 'base' && network !== 'arbitrum') return res.status(400).json({ ok: false, error: 'Hash PayLink Polymarket funding supports Base or Arbitrum.' })

    const requestId = `a2mcp-${randomUUID()}`
    const returnUrl = `${polydeskOrigin()}/polydesk?service=portfolio&notice=polymarket-funding-complete&portfolio=external`
    const checkout = await createHashPayLinkPolymarketFundingCheckout({ polymarketWallet, amount, networks: [network], requestId, returnUrl })
    const checkoutData = checkout.data as { ok?: boolean; checkoutUrl?: string; fundingRequestId?: string; error?: string }
    if (
      checkout.statusCode < 200
      || checkout.statusCode >= 300
      || !checkoutData.ok
      || !checkoutData.checkoutUrl
      || !/^pmf_[a-zA-Z0-9_-]+$/.test(checkoutData.fundingRequestId ?? '')
    ) {
      return res.status(checkout.statusCode).json({ ok: false, error: checkoutData.error || 'Could not prepare Hash PayLink funding checkout.' })
    }

    return res.json({
      ok: true,
      service: 'PolyDesk Polymarket Funding Link',
      protocol: 'A2MCP funding handoff',
      buyerAgent,
      payment: {
        asset: 'USDC',
        network: networkLabel(network),
        amount,
        minimumUsdc,
      },
      polymarket: {
        wallet: polymarketWallet,
        bridge: 'polymarket',
      },
      checkout: {
        url: checkoutData.checkoutUrl,
        requestId: checkoutData.fundingRequestId,
        statusUrl: `/api/hashpaylink/polymarket-funding?id=${encodeURIComponent(checkoutData.fundingRequestId ?? '')}`,
        expires: 'Use promptly; delivery is final only when funding status is funded.',
      },
      safety: [
        'Verify the Polymarket wallet before opening the checkout.',
        'Funding is not complete until the hosted checkout confirms the Polymarket bridge settlement.',
        'This endpoint creates a funding handoff only; PolyDesk does not custody funds for buyer agents.',
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not prepare Polymarket funding checkout.'
    return res.status(502).json({ ok: false, error: message })
  }
}
