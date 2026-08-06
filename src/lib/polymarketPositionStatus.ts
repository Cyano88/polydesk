export type PolymarketPositionLike = {
  size?: unknown
  currentValue?: unknown
  curPrice?: unknown
  redeemable?: boolean
  closed?: boolean
  archived?: boolean
  status?: unknown
  marketStatus?: unknown
  startDate?: unknown
  endDate?: unknown
}

export type PolymarketPositionStatus = 'not-started' | 'live' | 'ended'

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function timestamp(value: unknown) {
  const parsed = new Date(String(value ?? '')).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export function isClaimablePolymarketPosition(position: PolymarketPositionLike) {
  if (position.redeemable !== true) return false
  const value = numberOrNull(position.currentValue)
  if (value !== null) return value > 0
  const size = numberOrNull(position.size)
  return size === null ? true : size > 0
}

export function isEndedPolymarketPosition(position: PolymarketPositionLike, now = Date.now()) {
  if (position.redeemable === true || position.closed === true || position.archived === true) return true
  const status = `${position.status ?? ''} ${position.marketStatus ?? ''}`.toLowerCase()
  if (/(resolved|closed|settled|final|ended|archived)/.test(status)) return true
  const endedAt = timestamp(position.endDate)
  const curPrice = numberOrNull(position.curPrice)
  const currentValue = numberOrNull(position.currentValue)
  const size = numberOrNull(position.size)
  return endedAt !== null
    && endedAt <= now
    && (size ?? 0) > 0
    && (currentValue ?? 0) <= 0
    && curPrice !== null
    && curPrice <= 0
}

export function isActivePolymarketPosition(position: PolymarketPositionLike, now = Date.now()) {
  if (isEndedPolymarketPosition(position, now)) return false
  const currentValue = numberOrNull(position.currentValue)
  if ((currentValue ?? 0) > 0) return true
  const size = numberOrNull(position.size)
  if ((size ?? 0) <= 0) return false
  const curPrice = numberOrNull(position.curPrice)
  return curPrice === null || (curPrice > 0 && curPrice < 1)
}

export function polymarketPositionStatus(position: PolymarketPositionLike, now = Date.now()): PolymarketPositionStatus {
  if (isEndedPolymarketPosition(position, now)) return 'ended'
  const startedAt = timestamp(position.startDate)
  const status = `${position.status ?? ''} ${position.marketStatus ?? ''}`.toLowerCase()
  if (/(not started|upcoming|scheduled|pre.?market)/.test(status) || (startedAt !== null && startedAt > now)) return 'not-started'
  return isActivePolymarketPosition(position, now) ? 'live' : 'ended'
}
