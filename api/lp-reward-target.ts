export const DEFAULT_LP_CAPITAL_USDC = 50
export const DEFAULT_LP_DAILY_TARGET_USDC = 1

function positiveNumber(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(maximum, parsed) : fallback
}

export function normalizeLpCapitalUsdc(value: unknown) {
  return positiveNumber(value, DEFAULT_LP_CAPITAL_USDC, 1_000_000)
}

export function normalizeLpDailyTargetUsdc(value: unknown) {
  return positiveNumber(value, DEFAULT_LP_DAILY_TARGET_USDC, 10_000)
}

export function lpRewardTargetMetrics({ dailyPoolUsdc, minimumSetupUsdc, capitalUsdc, dailyTargetUsdc }: {
  dailyPoolUsdc?: number
  minimumSetupUsdc?: number
  capitalUsdc: number
  dailyTargetUsdc: number
}) {
  const pool = typeof dailyPoolUsdc === 'number' && Number.isFinite(dailyPoolUsdc) && dailyPoolUsdc > 0 ? dailyPoolUsdc : undefined
  const setup = typeof minimumSetupUsdc === 'number' && Number.isFinite(minimumSetupUsdc) && minimumSetupUsdc > 0 ? minimumSetupUsdc : undefined
  const requiredRewardSharePercentage = pool ? dailyTargetUsdc / pool * 100 : undefined
  const capitalToMinimumRatio = setup ? capitalUsdc / setup : undefined
  const minimumSetupCovered = typeof capitalToMinimumRatio === 'number' ? capitalToMinimumRatio >= 1 : undefined
  const poolPerMinimumSetup = pool && setup ? pool / setup : 0
  const targetScore = Math.min(90, Math.log1p(poolPerMinimumSetup) * 24)
    + Math.min(24, Math.max(0, capitalToMinimumRatio ?? 0) * 8)
    - Math.min(70, Math.max(0, requiredRewardSharePercentage ?? 10) * 8)
    - (minimumSetupCovered === false ? 90 : 0)
  return { capitalUsdc, dailyTargetUsdc, requiredRewardSharePercentage, capitalToMinimumRatio, minimumSetupCovered, targetScore }
}
