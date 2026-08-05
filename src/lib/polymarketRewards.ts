export type PolymarketLpRewardOrder = {
  orderId: string
  assetId?: string | null
  marketId?: string | null
}

export type PolymarketLpRewardSnapshot = {
  conditionId: string
  scoring: boolean | null
  earningPercentage: number | null
  earnedTodayUsdc: number | null
  estimatedDailyUsdc: number | null
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null
}

function finiteNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function conditionId(value: unknown) {
  return String(record(value)?.condition_id ?? '').toLowerCase()
}

function tokenIds(value: unknown) {
  const tokens = record(value)?.tokens
  if (!Array.isArray(tokens)) return []
  return tokens.map(token => String(record(token)?.token_id ?? '')).filter(Boolean)
}

function rewardAssetRates(value: unknown) {
  const earnings = record(value)?.earnings
  if (!Array.isArray(earnings)) return new Map<string, number>()
  return new Map(earnings.flatMap(item => {
    const row = record(item)
    const asset = String(row?.asset_address ?? '').toLowerCase()
    const rate = finiteNumber(row?.asset_rate)
    return asset && rate !== null && rate > 0 ? [[asset, rate] as const] : []
  }))
}

function earnedTodayUsdc(value: unknown) {
  const earnings = record(value)?.earnings
  if (!Array.isArray(earnings)) return null
  return earnings.reduce((total, item) => {
    const row = record(item)
    const earningsValue = finiteNumber(row?.earnings)
    const assetRate = finiteNumber(row?.asset_rate)
    return total + Math.max(0, earningsValue ?? 0) * Math.max(0, assetRate ?? 1)
  }, 0)
}

function dailyPoolUsdc(value: unknown, rates: Map<string, number>) {
  const configs = record(value)?.rewards_config
  if (!Array.isArray(configs)) return 0
  return configs.reduce((total, item) => {
    const row = record(item)
    const dailyRate = finiteNumber(row?.rate_per_day)
    const asset = String(row?.asset_address ?? '').toLowerCase()
    return total + Math.max(0, dailyRate ?? 0) * (rates.get(asset) ?? 1)
  }, 0)
}

export function buildPolymarketLpRewardSnapshots({
  orders,
  userMarkets,
  currentMarkets,
  percentages,
  scoring,
}: {
  orders: PolymarketLpRewardOrder[]
  userMarkets: unknown[]
  currentMarkets: unknown[]
  percentages: Record<string, unknown>
  scoring: Record<string, unknown>
}) {
  const userByCondition = new Map<string, unknown>(userMarkets.flatMap(item => conditionId(item) ? [[conditionId(item), item] as const] : []))
  const currentByCondition = new Map<string, unknown>(currentMarkets.flatMap(item => conditionId(item) ? [[conditionId(item), item] as const] : []))
  const allMarkets = [...userMarkets, ...currentMarkets]
  const result: Record<string, PolymarketLpRewardSnapshot> = {}

  for (const order of orders) {
    const requestedCondition = String(order.marketId ?? '').toLowerCase()
    const requestedAsset = String(order.assetId ?? '')
    const matched = allMarkets.find(item => (
      (requestedCondition && conditionId(item) === requestedCondition)
      || (requestedAsset && tokenIds(item).includes(requestedAsset))
    ))
    const matchedCondition = conditionId(matched)
    if (!matchedCondition) continue

    const userMarket = userByCondition.get(matchedCondition)
    const market = userMarket ?? currentByCondition.get(matchedCondition) ?? matched
    const rates = rewardAssetRates(userMarket)
    const explicitPercentage = finiteNumber(record(userMarket)?.earning_percentage)
    const percentageValue = explicitPercentage ?? finiteNumber(percentages[matchedCondition])
    const pool = dailyPoolUsdc(market, rates)
    result[order.orderId] = {
      conditionId: matchedCondition,
      scoring: typeof scoring[order.orderId] === 'boolean' ? scoring[order.orderId] as boolean : null,
      earningPercentage: percentageValue,
      earnedTodayUsdc: earnedTodayUsdc(userMarket),
      estimatedDailyUsdc: percentageValue !== null && pool > 0 ? pool * Math.max(0, percentageValue) / 100 : null,
    }
  }

  return result
}
