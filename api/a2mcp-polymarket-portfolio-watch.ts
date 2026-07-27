import type { Request, Response } from 'express'
import { isAddress } from 'viem'

const DATA_API_ORIGIN = 'https://data-api.polymarket.com'
const REQUEST_TIMEOUT_MS = 10_000

type PolymarketPosition = {
  conditionId?: string
  asset?: string
  market?: string
  eventSlug?: string
  slug?: string
  title?: string
  outcome?: string
  size?: number | string
  avgPrice?: number | string
  currentValue?: number | string
  cashPnl?: number | string
  percentPnl?: number | string
  redeemable?: boolean
  endDate?: string
  curPrice?: number | string
}

type PolymarketActivity = {
  proxyWallet?: string
  timestamp?: number | string
  conditionId?: string
  type?: string
  size?: number | string
  usdcSize?: number | string
  transactionHash?: string
  price?: number | string
  asset?: string
  side?: string
  title?: string
  slug?: string
  eventSlug?: string
  outcome?: string
}

function clean(value: unknown, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
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

function publicOrigin(req: Request) {
  const configured = clean(process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '', 180)
  if (configured) return configured.replace(/\/+$/, '')
  const proto = clean(req.headers['x-forwarded-proto'] || req.protocol || 'https', 16).split(',')[0] || 'https'
  const host = clean(req.headers['x-forwarded-host'] || req.headers.host || 'polydesk-i96m.onrender.com', 120).split(',')[0]
  return `${proto}://${host}`.replace(/\/+$/, '')
}

function asNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function roundUsd(value: number) {
  return Math.round(value * 100) / 100
}

async function dataApiFetch<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${DATA_API_ORIGIN}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: unknown }).error)
        : text.slice(0, 160)
      throw new Error(message || `Polymarket data-api HTTP ${response.status}`)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

function summarizePosition(position: PolymarketPosition) {
  const title = clean(position.title || position.slug || position.market || 'Polymarket position', 180)
  const conditionId = clean(position.conditionId || position.market || '', 120)
  const tokenId = clean(position.asset || '', 96)
  const eventSlug = clean(position.eventSlug || '', 180)
  const currentValue = roundUsd(asNumber(position.currentValue))
  const cashPnl = roundUsd(asNumber(position.cashPnl))
  const percentPnl = roundUsd(asNumber(position.percentPnl))
  const size = roundUsd(asNumber(position.size))
  const currentPrice = asNumber(position.curPrice)
  const avgPrice = asNumber(position.avgPrice)
  return {
    title,
    outcome: clean(position.outcome || 'Position', 80),
    slug: clean(position.slug || position.eventSlug || '', 180) || null,
    eventSlug: eventSlug || null,
    marketId: conditionId || null,
    conditionId: /^0x[a-fA-F0-9]{64}$/.test(conditionId) ? conditionId : null,
    tokenId: /^\d+$/.test(tokenId) ? tokenId : null,
    size,
    currentValue,
    cashPnl,
    percentPnl,
    currentPrice: currentPrice ? Math.round(currentPrice * 10000) / 10000 : null,
    avgPrice: avgPrice ? Math.round(avgPrice * 10000) / 10000 : null,
    redeemable: Boolean(position.redeemable),
    endDate: clean(position.endDate || '', 48) || null,
    copyIntent: (
      /^0x[a-fA-F0-9]{64}$/.test(conditionId)
      && /^\d+$/.test(tokenId)
      && eventSlug
      && position.redeemable !== true
    ) ? {
        selectionMode: 'POSITION',
        conditionId,
        tokenId,
      } : null,
  }
}

function summarizeBuySignal(activity: PolymarketActivity) {
  const transactionHash = clean(activity.transactionHash, 80)
  const tokenId = clean(activity.asset, 96)
  const eventSlug = clean(activity.eventSlug, 180)
  const timestamp = Number(activity.timestamp)
  return {
    signalId: transactionHash && tokenId ? `${transactionHash}:${tokenId}` : null,
    watchedWallet: clean(activity.proxyWallet, 64) || null,
    transactionHash: /^0x[a-fA-F0-9]{64}$/.test(transactionHash) ? transactionHash : null,
    detectedAt: Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp * 1000).toISOString()
      : null,
    market: {
      title: clean(activity.title || activity.slug || 'Polymarket market', 180),
      url: eventSlug ? `https://polymarket.com/event/${encodeURIComponent(eventSlug)}` : null,
      conditionId: clean(activity.conditionId, 96) || null,
      tokenId: /^\d+$/.test(tokenId) ? tokenId : null,
      outcome: clean(activity.outcome, 80) || null,
    },
    sourceExecution: {
      side: clean(activity.side, 12).toUpperCase(),
      size: roundUsd(asNumber(activity.size)),
      usdcSize: roundUsd(asNumber(activity.usdcSize)),
      price: Math.round(asNumber(activity.price) * 10000) / 10000,
    },
    nextAction: 'Call POST /api/polymarket-copy/prepare with this transactionHash, tokenId, the watched wallet, and the buyer owner EOA.',
  }
}

export default async function a2mcpPolymarketPortfolioWatchHandler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const wallet = clean(requestValue(req, 'wallet', 'address'), 64)
    if (!isAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'Provide a valid public Polymarket 0x wallet address.' })
    }

    const agent = clean(requestValue(req, 'agent') || req.headers['x-buyer-agent'] || req.headers['x-agent-slug'] || 'external-agent', 80)
    const limit = Math.max(1, Math.min(100, Number(requestValue(req, 'limit') || 50) || 50))
    const [valueData, positionData, activityData] = await Promise.all([
      dataApiFetch<unknown>(`/value?user=${encodeURIComponent(wallet)}`),
      dataApiFetch<unknown>(`/positions?user=${encodeURIComponent(wallet)}&sizeThreshold=0&limit=${limit}`),
      dataApiFetch<unknown>(`/activity?user=${encodeURIComponent(wallet)}&type=TRADE&side=BUY&sortBy=TIMESTAMP&sortDirection=DESC&limit=${Math.min(limit, 50)}`)
        .catch(() => null),
    ])

    const positions = Array.isArray(positionData) ? positionData.map(item => summarizePosition(item as PolymarketPosition)) : []
    const openPositions = positions.filter(position => position.currentValue > 0 || position.size > 0)
    const claimable = positions.filter(position => position.redeemable)
    const totalValue = roundUsd(asNumber(valueData))
    const totalPnl = roundUsd(openPositions.reduce((sum, position) => sum + position.cashPnl, 0))
    const topPositions = [...openPositions]
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 10)
    const recentBuySignals = (Array.isArray(activityData) ? activityData : [])
      .map(item => item as PolymarketActivity)
      .filter(item => clean(item.type, 16).toUpperCase() === 'TRADE' && clean(item.side, 12).toUpperCase() === 'BUY')
      .map(summarizeBuySignal)
      .filter(signal => signal.transactionHash && signal.market.tokenId && signal.market.url)
      .slice(0, 10)

    res.json({
      ok: true,
      service: 'PolyDesk Polymarket Portfolio Watch',
      protocol: 'A2MCP portfolio intelligence',
      buyerAgent: agent,
      payment: (req as Request & { payment?: Record<string, unknown> }).payment || { required: true, model: 'x402-fixed' },
      polymarket: {
        wallet,
        totalValue,
        openPositionCount: openPositions.length,
        claimableCount: claimable.length,
        estimatedOpenPnl: totalPnl,
      },
      summary: openPositions.length
        ? `Wallet has ${openPositions.length} open Polymarket position${openPositions.length === 1 ? '' : 's'} with about ${totalValue} USDC in portfolio value.`
        : `Wallet has no open Polymarket positions above the current watch threshold.`,
      topPositions,
      claimablePositions: claimable.slice(0, 10),
      recentBuySignals,
      copyTrading: {
        mode: 'public-position-or-trade-to-buyer-signed-immediate-order',
        prepareEndpoint: `${publicOrigin(req)}/api/polymarket-copy/prepare`,
        selectionModes: ['POSITION', 'TRADE', 'AUTO_BEST_FIT'],
        supportedOrderTypes: ['FAK', 'FOK'],
        automaticSelectionMeaning: 'execution-quality ranking under a caller-supplied policy; not a profit forecast',
        watchedWalletCanSignForBuyer: false,
        requiresBuyerOwnerAndDerivedDepositWallet: true,
        autonomousExecutionRequiresPreauthorizedMandate: true,
      },
      source: {
        provider: 'Polymarket Data API',
        endpoints: ['/value', '/positions', '/activity?type=TRADE&side=BUY'],
        activityAvailable: Array.isArray(activityData),
        checkedAt: new Date().toISOString(),
      },
      artifacts: {
        portfolioUrl: `${publicOrigin(req)}/?service=poly-portfolio`,
      },
      safety: [
        'The watched wallet is a public signal source only and can never authorize a buyer trade.',
        'Copy candidates come from exact public BUY activity, not inferred position changes.',
        'PolyDesk does not custody buyer funds or receive buyer private keys.',
        'Portfolio values and PnL are live-data estimates and should be rechecked before acting.',
        'Claimable status should be confirmed on Polymarket before redemption.',
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Polymarket portfolio watch failed.'
    res.status(502).json({ ok: false, error: message })
  }
}
