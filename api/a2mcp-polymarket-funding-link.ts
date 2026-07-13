import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { isAddress } from 'viem'
import { cleanNetwork, createDepositAddress, minimumUsdcFor, type BridgeNetwork } from './polymarket-bridge.js'

const DEFAULT_HASH_PAYLINK_ORIGIN = 'https://hashpaylink.com'

function cleanText(value: unknown, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function paylinkOrigin() {
  return (
    process.env.HASH_PAYLINK_BASE_URL
    ?? process.env.PUBLIC_PAYLINK_ORIGIN
    ?? process.env.VITE_PUBLIC_PAYLINK_ORIGIN
    ?? DEFAULT_HASH_PAYLINK_ORIGIN
  ).trim().replace(/\/+$/, '')
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return ''
  return raw
}

function networkLabel(network: BridgeNetwork) {
  if (network === 'arbitrum') return 'Arbitrum'
  if (network === 'solana') return 'Solana'
  return 'Base'
}

function buildPolymarketFundingCheckout(input: {
  amount: string
  network: BridgeNetwork
  depositAddress: string
  polymarketWallet: string
  requestId: string
  fundingLabel: string
}) {
  const params = new URLSearchParams()
  params.set('a', input.amount)
  params.set('src', 'a2mcp')
  params.set('n', input.network)
  if (input.network === 'solana') params.set('s', input.depositAddress)
  else params.set('e', input.depositAddress)
  params.set('m', 'Polymarket')
  params.set('brand', 'polymarket')
  params.set('pm', '1')
  params.set('bridge', 'polymarket')
  params.set('pmw', input.polymarketWallet)
  params.set('pmr', input.requestId)
  params.set('funding', input.fundingLabel)
  return `${paylinkOrigin()}/pay?${params.toString()}`
}

export default async function a2mcpPolymarketFundingLinkHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const polymarketWallet = cleanText(req.query.wallet ?? req.query.polymarketWallet ?? req.query.pmw, 64)
    const amount = cleanAmount(req.query.amount ?? req.query.a)
    const network = cleanNetwork(req.query.network ?? req.query.n)
    const fundingLabel = cleanText(req.query.label ?? req.query.funding, 80) || 'External Polymarket account'
    const buyerAgent = cleanText(req.query.agent ?? req.headers['x-buyer-agent'] ?? req.headers['x-agent-slug'], 64) || 'external-agent'
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

    const bridge = await createDepositAddress(polymarketWallet, network)
    const requestId = `a2mcp-${randomUUID()}`
    const checkoutUrl = buildPolymarketFundingCheckout({
      amount,
      network,
      depositAddress: bridge.depositAddress,
      polymarketWallet,
      requestId,
      fundingLabel,
    })

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
        url: checkoutUrl,
        requestId,
        depositAddress: bridge.depositAddress,
        addressType: bridge.addressType,
        expires: 'Use promptly; bridge status is checked by the hosted checkout.',
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
