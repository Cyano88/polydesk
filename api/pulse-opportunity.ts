import type { Request, Response } from 'express'
import { getPulseFeed } from './pulse.js'
import { buildLiveScout } from './x402-polymarket-scout.js'

type Opportunity = {
  title?: string
  marketSlug?: string
  marketUrl?: string
  image?: string
  description?: string
  dailyReward?: number
  liveSpread?: number
  depthAtTwoCents?: number
  suggestedYesBid?: number
  suggestedNoBid?: number
  tickSize?: string
  maxSpread?: number
  minSize?: number
  estimatedRewardCapitalUsdc?: number
  daysToResolve?: number
  lpExecutionRisk?: string
  score?: number
  scoutReason?: string
}

const cache = new Map<string, { expiresAt: number; opportunity: Opportunity }>()
const CACHE_MS = 60_000

function validSlug(value: unknown) {
  const slug = String(value ?? '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{1,180}$/.test(slug) ? slug : ''
}

export async function getPulseOpportunity(rawSlug: unknown) {
  const slug = validSlug(rawSlug)
  if (!slug) return null
  const cached = cache.get(slug)
  if (cached && cached.expiresAt > Date.now()) return cached.opportunity

  const pulse = await getPulseFeed().catch(() => null)
  const current = pulse?.markets.find(item => item.marketUrl?.toLowerCase().endsWith(`/event/${slug}`))
  if (current?.title && current.marketUrl?.startsWith('https://polymarket.com/event/')) {
    cache.set(slug, { expiresAt: Date.now() + CACHE_MS, opportunity: current })
    return current
  }

  const result = await buildLiveScout({
    mode: 'market',
    context: `https://polymarket.com/event/${slug}`,
    candidateLimit: 1,
    opportunityLimit: 1,
  })
  const opportunity = Array.isArray(result.opportunities)
    ? result.opportunities.find(item => item && typeof item === 'object') as Opportunity | undefined
    : undefined
  if (!opportunity?.title || !opportunity.marketUrl?.startsWith('https://polymarket.com/event/')) return null
  cache.set(slug, { expiresAt: Date.now() + CACHE_MS, opportunity })
  return opportunity
}

export default async function pulseOpportunityHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  const opportunity = await getPulseOpportunity(req.params.slug)
  if (!opportunity) return res.status(404).json({ ok: false, error: 'This LP opportunity is no longer available.' })
  return res.json({
    ok: true,
    updatedAt: new Date().toISOString(),
    opportunity,
  })
}
