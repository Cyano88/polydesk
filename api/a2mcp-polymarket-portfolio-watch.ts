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

function clean(value: unknown, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
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
    marketId: clean(position.conditionId || position.market || position.asset || '', 120) || null,
    size,
    currentValue,
    cashPnl,
    percentPnl,
    currentPrice: currentPrice ? Math.round(currentPrice * 10000) / 10000 : null,
    avgPrice: avgPrice ? Math.round(avgPrice * 10000) / 10000 : null,
    redeemable: Boolean(position.redeemable),
    endDate: clean(position.endDate || '', 48) || null,
  }
}

export default async function a2mcpPolymarketPortfolioWatchHandler(req: Request, res: Response) {
  try {
    const wallet = clean(req.query.wallet || req.query.address, 64)
    if (!isAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'Provide a valid public Polymarket 0x wallet address.' })
    }

    const agent = clean(req.query.agent || req.headers['x-buyer-agent'] || req.headers['x-agent-slug'] || 'external-agent', 80)
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50) || 50))
    const [valueData, positionData] = await Promise.all([
      dataApiFetch<unknown>(`/value?user=${encodeURIComponent(wallet)}`),
      dataApiFetch<unknown>(`/positions?user=${encodeURIComponent(wallet)}&sizeThreshold=0&limit=${limit}`),
    ])

    const positions = Array.isArray(positionData) ? positionData.map(item => summarizePosition(item as PolymarketPosition)) : []
    const openPositions = positions.filter(position => position.currentValue > 0 || position.size > 0)
    const claimable = positions.filter(position => position.redeemable)
    const totalValue = roundUsd(asNumber(valueData))
    const totalPnl = roundUsd(openPositions.reduce((sum, position) => sum + position.cashPnl, 0))
    const topPositions = [...openPositions]
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 10)

    res.json({
      ok: true,
      service: 'PolyDesk Polymarket Portfolio Watch',
      protocol: 'A2MCP portfolio intelligence',
      buyerAgent: agent,
      payment: { required: false, model: 'free' },
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
      source: {
        provider: 'Polymarket Data API',
        endpoints: ['/value', '/positions'],
        checkedAt: new Date().toISOString(),
      },
      artifacts: {
        portfolioUrl: `${publicOrigin(req)}/?service=poly-portfolio`,
      },
      safety: [
        'Read-only wallet monitoring; PolyDesk does not custody funds or place trades for buyer agents.',
        'Portfolio values and PnL are live-data estimates and should be rechecked before acting.',
        'Claimable status should be confirmed on Polymarket before redemption.',
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Polymarket portfolio watch failed.'
    res.status(502).json({ ok: false, error: message })
  }
}
