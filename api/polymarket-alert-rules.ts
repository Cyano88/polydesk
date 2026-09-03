export type PolymarketAlertPosition = {
  asset?: string
  conditionId?: string
  title?: string
  slug?: string
  eventSlug?: string
  outcome?: string
  size?: number
  avgPrice?: number
  currentValue?: number
  percentPnl?: number
  redeemable?: boolean
}

export type PolymarketResolutionEvent = {
  market: string
  winningAssetId: string
  winningOutcome: string
  question?: string
  slug?: string
}

export type PositionAlertTransition =
  | {
      type: 'loss-threshold'
      percentPnl: number
      thresholdPercent: number
    }
  | {
      type: 'claimable'
      winningOutcome: string
    }
  | {
      type: 'resolved-loss'
      winningOutcome: string
    }

export type PolymarketLpOrderLifecycle = 'live' | 'partial' | 'filled' | 'cancelled' | 'expired' | 'closed'

export function normalizeLpOrderLifecycle(input: {
  status?: unknown
  originalSize?: unknown
  matchedSize?: unknown
}): PolymarketLpOrderLifecycle {
  const status = String(input.status ?? '').trim().toLowerCase()
  const originalSize = Number(input.originalSize)
  const matchedSize = Number(input.matchedSize)

  if (/(cancelled|canceled)/.test(status)) return 'cancelled'
  if (/(expired)/.test(status)) return 'expired'
  if (/(closed|unavailable|not[_ -]?found)/.test(status)) return 'closed'
  if (
    (Number.isFinite(originalSize) && originalSize > 0 && Number.isFinite(matchedSize) && matchedSize >= originalSize)
    || /^(matched|filled|complete|completed)$/.test(status)
  ) {
    return 'filled'
  }
  if (Number.isFinite(matchedSize) && matchedSize > 0) return 'partial'
  return 'live'
}

export function isMissingPolymarketOrderError(input: { status?: unknown; message?: unknown }) {
  const status = Number(input.status)
  const message = String(input.message ?? '').trim().toLowerCase()
  return status === 404 && /(?:order[^\n]*(?:not found|can't be found|cannot be found)|already (?:cancelled|canceled|matched))/.test(message)
}

export function shouldCloseMissingLpOrder(input: {
  missingChecks: unknown
  createdAt: unknown
  now?: number
  minimumChecks?: number
  minimumAgeMs?: number
}) {
  const missingChecks = Number(input.missingChecks)
  const createdAt = input.createdAt instanceof Date
    ? input.createdAt.getTime()
    : new Date(String(input.createdAt ?? '')).getTime()
  const now = input.now ?? Date.now()
  const minimumChecks = input.minimumChecks ?? 2
  const minimumAgeMs = input.minimumAgeMs ?? 60_000
  return Number.isFinite(missingChecks)
    && missingChecks >= minimumChecks
    && Number.isFinite(createdAt)
    && now - createdAt >= minimumAgeMs
}

export function normalizedPercentPnl(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function crossedLossThreshold(input: {
  percentPnl: unknown
  thresholdPercent: number
  wasBelowThreshold: boolean
}) {
  const percentPnl = normalizedPercentPnl(input.percentPnl)
  const thresholdPercent = Math.abs(input.thresholdPercent)
  if (percentPnl === null || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
    return { belowThreshold: false, shouldAlert: false, percentPnl }
  }
  const belowThreshold = percentPnl <= -thresholdPercent
  return {
    belowThreshold,
    shouldAlert: belowThreshold && !input.wasBelowThreshold,
    percentPnl,
  }
}

export function crossedProfitThreshold(input: {
  percentPnl: unknown
  thresholdPercent: number
  wasAboveThreshold: boolean
}) {
  const percentPnl = normalizedPercentPnl(input.percentPnl)
  const thresholdPercent = Math.abs(input.thresholdPercent)
  if (percentPnl === null || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
    return { aboveThreshold: false, shouldAlert: false, percentPnl }
  }
  const aboveThreshold = percentPnl >= thresholdPercent
  return {
    aboveThreshold,
    shouldAlert: aboveThreshold && !input.wasAboveThreshold,
    percentPnl,
  }
}

export function confirmedFundingDelivery(input: {
  providerStatus: unknown
  readinessState: unknown
  pusdBalance: unknown
}) {
  const balance = Number(input.pusdBalance)
  return String(input.providerStatus) === 'funded'
    && String(input.readinessState) === 'ready_to_buy'
    && Number.isFinite(balance)
    && balance > 0
}

export function shouldAlertNewPosition(input: {
  enabled: boolean
  positionsInitialized: boolean
  positionAlreadyKnown: boolean
  size: unknown
}) {
  const size = typeof input.size === 'number' ? input.size : Number(input.size)
  return input.enabled
    && input.positionsInitialized
    && !input.positionAlreadyKnown
    && Number.isFinite(size)
    && size > 0
}

export function resolutionTransition(
  position: PolymarketAlertPosition,
  event: PolymarketResolutionEvent,
): PositionAlertTransition | null {
  const market = String(position.conditionId ?? '').toLowerCase()
  const resolvedMarket = event.market.toLowerCase()
  const asset = String(position.asset ?? '').toLowerCase()
  const winningAsset = event.winningAssetId.toLowerCase()
  if (!market || market !== resolvedMarket || !asset || !winningAsset) return null
  return asset === winningAsset
    ? { type: 'claimable', winningOutcome: event.winningOutcome }
    : { type: 'resolved-loss', winningOutcome: event.winningOutcome }
}

export function polymarketPositionUrl(position: PolymarketAlertPosition) {
  const slug = String(position.eventSlug || position.slug || '').trim()
  return slug
    ? `https://polymarket.com/event/${encodeURIComponent(slug)}`
    : 'https://polymarket.com/portfolio'
}
