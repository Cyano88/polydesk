import type { NextFunction, Request, Response } from 'express'
import crypto from 'node:crypto'
import { formatUnits } from 'viem'
import { appendAgentActivity, normalizeActivitySlug } from './agent-activity.js'
import { getPolyStreamFeed } from './poly-stream.js'
import { getPolyWorldcupNewsFeed } from './poly-worldcup-news.js'
import { buildLiveScout } from './x402-polymarket-scout.js'

type PaidRequest = Request & {
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

const SELLER_ADDRESS = process.env.X402_SELLER_ADDRESS ?? process.env.TREASURY_ADDRESS
const PRICE = process.env.X402_WORLDCUP_BUNDLE_PRICE ?? '$0.015'
const ARC_TESTNET_CAIP2 = 'eip155:5042002'
const DEFAULT_TESTNET_FACILITATOR_URL = 'https://gateway-api-testnet.circle.com'
const RAW_ACCEPT_NETWORKS = process.env.X402_WORLDCUP_BUNDLE_ACCEPT_NETWORKS?.trim()
  || process.env.X402_ACCEPT_NETWORKS?.trim()
  || ARC_TESTNET_CAIP2
const ACCEPT_NETWORKS = RAW_ACCEPT_NETWORKS.split(',').map(normalizeX402Network).filter(Boolean)
const RAW_FACILITATOR_URL = process.env.X402_WORLDCUP_BUNDLE_FACILITATOR_URL?.trim()
  || process.env.X402_FACILITATOR_URL?.trim()
  || ''
const ACCEPTS_ARC_TESTNET = ACCEPT_NETWORKS.includes(ARC_TESTNET_CAIP2)
const FACILITATOR_URL = ACCEPTS_ARC_TESTNET && (!RAW_FACILITATOR_URL || /gateway-api\.circle\.com\/?$/i.test(RAW_FACILITATOR_URL))
  ? DEFAULT_TESTNET_FACILITATOR_URL
  : RAW_FACILITATOR_URL || DEFAULT_TESTNET_FACILITATOR_URL

let gatewayMiddleware: ((req: Request, res: Response, next: NextFunction) => void) | undefined

function normalizeX402Network(network: string) {
  const clean = network.trim()
  const key = clean.toLowerCase().replace(/[_\s]/g, '-')
  if (!clean) return ''
  if (key === 'arc' || key === 'arc-testnet' || key === 'arctestnet' || key === '5042002') return ARC_TESTNET_CAIP2
  return clean
}

function cleanHeader(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '').trim() : String(value ?? '').trim()
}

function cleanText(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '').trim() : String(value ?? '').trim()
}

function selectedDate(req: Request) {
  const text = cleanText(req.query.date)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return new Date().toISOString().slice(0, 10)
}

function serviceUrl(req: Request) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item ?? ''))
    } else if (value !== undefined) {
      query.set(key, String(value))
    }
  }
  const suffix = query.toString()
  return `/api/a2mcp/worldcup-intelligence-bundle${suffix ? `?${suffix}` : ''}`
}

async function getGatewayMiddleware() {
  if (!SELLER_ADDRESS) throw new Error('X402_SELLER_ADDRESS or TREASURY_ADDRESS is required')
  if (!gatewayMiddleware) {
    const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server')
    const gateway = createGatewayMiddleware({
      sellerAddress: SELLER_ADDRESS,
      ...(FACILITATOR_URL ? { facilitatorUrl: FACILITATOR_URL } : {}),
      ...(ACCEPT_NETWORKS.length ? { networks: ACCEPT_NETWORKS } : {}),
      description: 'PolyDesk World Cup Intelligence Bundle x402 API',
    })
    gatewayMiddleware = gateway.require(PRICE)
  }
  return gatewayMiddleware
}

function proofForPayment(req: PaidRequest, amount: string) {
  const payment = req.payment
  if (!payment) return undefined
  const proof = {
    kind: 'circle_gateway_x402' as const,
    provider: 'Circle Gateway x402',
    service: 'worldcup-intelligence-bundle',
    buyerAgent: normalizeActivitySlug(cleanHeader(req.headers['x-buyer-agent']) || cleanHeader(req.headers['x-agent-slug']) || String(req.query.agent ?? '') || payment.payer || 'a2mcp-buyer'),
    sellerAgent: 'polydesk',
    payer: payment.payer,
    seller: SELLER_ADDRESS,
    amount,
    network: payment.network,
    transaction: payment.transaction,
    serviceUrl: serviceUrl(req),
    generatedAt: new Date().toISOString(),
  }
  const proofHash = crypto.createHash('sha256').update(JSON.stringify({
    kind: proof.kind,
    provider: proof.provider,
    service: proof.service,
    buyerAgent: proof.buyerAgent,
    sellerAgent: proof.sellerAgent,
    payer: proof.payer,
    seller: proof.seller,
    amount: proof.amount,
    network: proof.network,
    transaction: proof.transaction,
    serviceUrl: proof.serviceUrl,
  })).digest('hex')
  return { ...proof, proofHash }
}

async function recordBundlePayment(req: PaidRequest, amount: string, summary: string, bundle: Record<string, unknown>) {
  const proof = proofForPayment(req, amount)
  if (!proof) return undefined
  const agentSlug = proof.buyerAgent || 'a2mcp-buyer'
  const spend = await appendAgentActivity({
    agentSlug,
    type: 'x402_spent',
    title: 'Bought PolyDesk World Cup Intelligence Bundle',
    amount,
    asset: 'USDC',
    direction: 'out',
    network: 'Circle Gateway x402',
    wallet: proof.payer,
    serviceUrl: proof.serviceUrl,
    detail: 'Buyer agent paid PolyDesk for World Cup scores, market news, and LP Scout context.',
    proof,
  })
  const result = await appendAgentActivity({
    agentSlug,
    type: 'scout_returned',
    title: 'PolyDesk World Cup bundle returned',
    direction: 'result',
    network: 'PolyDesk A2MCP',
    wallet: proof.payer,
    serviceUrl: proof.serviceUrl,
    detail: summary,
    result: bundle,
    proof,
  })
  return {
    agentSlug,
    receiptActivityId: spend?.id,
    resultActivityId: result?.id,
    proofHash: proof.proofHash,
  }
}

async function bundleResponse(req: PaidRequest) {
  const payment = req.payment
  const amount = payment?.amount ? `${formatUnits(BigInt(payment.amount), 6)} USDC` : PRICE
  const date = selectedDate(req)
  const [scores, news, lpScout] = await Promise.all([
    getPolyStreamFeed(date),
    getPolyWorldcupNewsFeed(),
    buildLiveScout({
      mode: 'best',
      context: cleanText(req.query.context) || 'World Cup',
      budget: cleanText(req.query.budget),
    }),
  ])
  const summary = 'World Cup bundle returned live score context, market-moving news, and LP Scout context for buyer-agent resale or composition.'
  const bundle = {
    summary,
    date,
    scores,
    news,
    lpScout,
    generatedAt: new Date().toISOString(),
  }
  const activity = payment ? await recordBundlePayment(req, amount, summary, bundle) : undefined
  return {
    ok: true,
    service: 'PolyDesk World Cup Intelligence Bundle',
    paid: true,
    buyerAgent: activity?.agentSlug,
    payment: payment
      ? {
          payer: payment.payer,
          amount,
          network: payment.network,
          transaction: payment.transaction,
        }
      : undefined,
    bundle,
    receipt: {
      provider: 'Circle Gateway x402',
      price: PRICE,
      seller: SELLER_ADDRESS,
      generatedAt: new Date().toISOString(),
      activity,
    },
  }
}

export default async function a2mcpWorldcupBundleHandler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const middleware = await getGatewayMiddleware()
    return middleware(req, res, async () => res.json(await bundleResponse(req as PaidRequest)))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'World Cup bundle unavailable'
    const status = /X402_SELLER_ADDRESS|TREASURY_ADDRESS/i.test(message) ? 503 : 500
    return res.status(status).json({ ok: false, error: message })
  }
}
