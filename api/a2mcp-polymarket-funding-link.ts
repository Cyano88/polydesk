import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { isAddress } from 'viem'
import { cleanNetwork, type BridgeNetwork } from './polymarket-bridge.js'
import { createHashPayLinkPolymarketFundingCheckout } from './hashpaylink-polymarket-funding.js'
import { checkPolymarketAccountReadiness } from './polymarket-account-readiness.js'

type FundingDependencies = {
  readiness: typeof checkPolymarketAccountReadiness
  createCheckout: typeof createHashPayLinkPolymarketFundingCheckout
}

const defaultDependencies: FundingDependencies = {
  readiness: checkPolymarketAccountReadiness,
  createCheckout: createHashPayLinkPolymarketFundingCheckout,
}

type FundingReadiness = Awaited<ReturnType<typeof checkPolymarketAccountReadiness>>

export type PolymarketFundingPreflight =
  | { proceed: false; status: number; body: Record<string, unknown> }
  | {
      proceed: true
      ownerAddress: string
      amount: string
      requiredBalanceUsdc: string
      network: BridgeNetwork
      buyerAgent: string
      readiness: Extract<FundingReadiness, { ok: true }>
      checkoutAmount: string
    }

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

export async function preflightA2mcpPolymarketFundingLink(
  req: Request,
  dependencies: Pick<FundingDependencies, 'readiness'> = defaultDependencies,
): Promise<PolymarketFundingPreflight> {
  const ownerAddress = cleanText(requestValue(req, 'ownerAddress', 'owner', 'eoa'), 64)
  const polymarketWallet = cleanText(requestValue(req, 'wallet', 'polymarketWallet', 'pmw'), 64)
  const amount = cleanAmount(requestValue(req, 'amount', 'a'))
  const requiredBalanceUsdc = cleanAmount(requestValue(req, 'requiredBalanceUsdc', 'requiredUsdc', 'maxSpendUsdc'))
  const network = cleanNetwork(requestValue(req, 'network', 'n'))
  const buyerAgent = cleanText(requestValue(req, 'agent') ?? req.headers['x-buyer-agent'] ?? req.headers['x-agent-slug'], 64) || 'external-agent'

  if (!isAddress(ownerAddress)) {
    return { proceed: false, status: 400, body: { ok: false, error: 'Provide the owner EOA that controls the Polymarket account.' } }
  }
  if (polymarketWallet && !isAddress(polymarketWallet)) {
    return { proceed: false, status: 400, body: { ok: false, error: 'polymarketWallet must be a valid 0x address when supplied.' } }
  }
  if (!amount && !requiredBalanceUsdc) {
    return {
      proceed: false,
      status: 400,
      body: { ok: false, error: 'Provide amount for a direct top-up or requiredBalanceUsdc for a buy-readiness top-up.' },
    }
  }
  if (network !== 'base' && network !== 'arbitrum') {
    return { proceed: false, status: 400, body: { ok: false, error: 'Hash PayLink Polymarket funding supports Base or Arbitrum.' } }
  }

  const readiness = await dependencies.readiness({
    ownerAddress,
    ...(polymarketWallet ? { polymarketWallet } : {}),
    requiredBalanceUsdc: requiredBalanceUsdc || '0',
    sourceNetwork: network,
    sourceToken: 'USDC',
  })
  if (!readiness.ok) {
    const { status, ...body } = readiness
    return { proceed: false, status, body }
  }
  const account = readiness.data.polymarketAccount
  const funding = readiness.data.funding
  if (!account.deployedOnPolygon) {
    return {
      proceed: false,
      status: 409,
      body: {
        ...readiness.data,
        error: 'Activate the derived Polymarket Deposit Wallet before creating a funding checkout.',
      },
    }
  }
  if (!funding.supportedAssetVerified || !funding.minimumUsdc) {
    return {
      proceed: false,
      status: 503,
      body: {
        ...readiness.data,
        error: 'Polymarket did not return a verified USDC funding route. No checkout was created.',
      },
    }
  }
  if (requiredBalanceUsdc && !funding.needed) {
    return {
      proceed: false,
      status: 200,
      body: {
        ...readiness.data,
        service: 'PolyDesk Polymarket Ready-to-Buy',
        buyerAgent,
        checkout: null,
        nextAction: 'PREPARE_BUY',
        message: 'The verified Polymarket Deposit Wallet already has the required pUSD balance.',
      },
    }
  }

  const liveMinimum = Number(funding.minimumUsdc)
  const upstreamMinimum = 3
  const minimumUsdc = Math.max(liveMinimum, upstreamMinimum)
  const checkoutAmount = requiredBalanceUsdc
    ? String(Math.max(Number(funding.suggestedAmountUsdc), minimumUsdc))
    : amount
  if (!checkoutAmount || !Number.isFinite(Number(checkoutAmount)) || Number(checkoutAmount) < minimumUsdc) {
    return {
      proceed: false,
      status: 400,
      body: {
        ok: false,
        error: `Provide at least ${minimumUsdc} USDC for this hosted checkout.`,
        minimumUsdc,
        providerMinimumUsdc: funding.minimumUsdc,
      },
    }
  }
  return {
    proceed: true,
    ownerAddress,
    amount,
    requiredBalanceUsdc,
    network,
    buyerAgent,
    readiness,
    checkoutAmount,
  }
}

export function createA2mcpPolymarketFundingLinkHandler(dependencies: FundingDependencies = defaultDependencies) {
  return async function a2mcpPolymarketFundingLinkHandler(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    try {
      const preflight = await preflightA2mcpPolymarketFundingLink(req, dependencies)
      if (!preflight.proceed) return res.status(preflight.status).json(preflight.body)
      const { readiness, network, buyerAgent, checkoutAmount } = preflight
      const account = readiness.data.polymarketAccount
      const funding = readiness.data.funding

      const requestId = `a2mcp-${randomUUID()}`
      const returnUrl = `${polydeskOrigin()}/polydesk?service=portfolio&notice=polymarket-funding-complete&portfolio=external`
      const checkout = await dependencies.createCheckout({
        polymarketWallet: account.wallet,
        amount: checkoutAmount,
        networks: [network],
        requestId,
        returnUrl,
      })
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
        service: 'PolyDesk Verified Polymarket Funding',
        protocol: 'A2MCP funding handoff',
        buyerAgent,
        owner: readiness.data.owner,
        payment: {
          asset: 'USDC',
          network: networkLabel(network),
          amount: checkoutAmount,
          providerMinimumUsdc: funding.minimumUsdc,
        },
        polymarket: {
          wallet: account.wallet,
          walletType: account.walletType,
          signatureType: account.signatureType,
          derivedFromOwner: account.derivedFromOwner,
          deployedOnPolygon: account.deployedOnPolygon,
          bridge: 'polymarket',
          currentPusdBalance: account.collateral.balance,
          requiredPusdBalance: account.collateral.required,
        },
        checkout: {
          url: checkoutData.checkoutUrl,
          requestId: checkoutData.fundingRequestId,
          statusUrl: `/api/hashpaylink/polymarket-funding?id=${encodeURIComponent(checkoutData.fundingRequestId ?? '')}`,
          expires: 'Use promptly; delivery is final only when funding status is funded.',
        },
        nextAction: 'PAY_CHECKOUT_THEN_POLL_STATUS',
        safety: [
          'The checkout target was derived from the owner EOA and verified as a deployed Polymarket Deposit Wallet.',
          'Funding is not complete until bridge status is funded and the pUSD balance is refreshed.',
          'This endpoint creates a funding handoff only; PolyDesk does not custody funds for buyer agents.',
        ],
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not prepare Polymarket funding checkout.'
      return res.status(502).json({ ok: false, error: message })
    }
  }
}

export default createA2mcpPolymarketFundingLinkHandler()
