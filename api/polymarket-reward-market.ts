type UnknownRecord = Record<string, unknown>

const DAILY_POOL_KEYS = [
  'total_daily_rate',
  'native_daily_rate',
  'daily_reward',
  'dailyRewards',
  'rewards_daily_rate',
  'rate_per_day',
  'reward',
] as const

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function mergeVerifiedRewardMarket(source: UnknownRecord, verified: UnknownRecord) {
  const merged = { ...source, ...verified }
  for (const key of DAILY_POOL_KEYS) {
    if (!(key in verified)) delete merged[key]
  }
  return merged
}

export function verifiedDailyRewardPool(market: UnknownRecord) {
  for (const key of DAILY_POOL_KEYS) {
    const value = finiteNumber(market[key])
    if (value !== undefined && value > 0) return value
  }
  const configs = Array.isArray(market.rewards_config) ? market.rewards_config : []
  const configured = configs.reduce((total, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return total
    const record = item as UnknownRecord
    return total + Math.max(0, finiteNumber(record.rate_per_day ?? record.ratePerDay) ?? 0)
  }, 0)
  return configured > 0 ? configured : undefined
}
