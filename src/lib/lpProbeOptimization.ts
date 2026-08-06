export type LpProbeSample = {
  estimatedDailyUsdc: number
  earningPercentage: number
  observedAt: number
  restingCapitalUsdc?: number
  dailyTargetUsdc?: number
  availableCapitalUsdc?: number | null
}

export type LpProbeOrder = {
  outcome?: string | null
  price?: number | null
  originalSize?: number | null
  matchedSize?: number | null
  status?: string | null
}

export type LpProbeRecommendation = 'measure' | 'hold' | 'increase' | 'rebalance' | 'exit'

export type LpProbeAssessment = {
  recommendation: LpProbeRecommendation
  stable: boolean
  twoSided: boolean
  asymmetricFill: boolean
  estimatedDailyUsdc: number | null
  dailyTargetUsdc: number
  targetMet: boolean | null
  restingCapitalUsdc: number | null
  efficiencyPer100Usdc: number | null
  roughCapitalForTargetUsdc: number | null
  availableCapitalUsdc: number | null
  capitalShortfallUsdc: number | null
  capitalSufficientForTarget: boolean | null
}

const ACTIVE_ORDER_STATUSES = new Set(['live', 'partial'])

function finiteNonNegative(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

export function assessLpProbe({
  orders,
  samples,
  scoring,
  dailyTargetUsdc = 1,
  availableCapitalUsdc,
}: {
  orders: LpProbeOrder[]
  samples: LpProbeSample[]
  scoring: boolean | null
  dailyTargetUsdc?: number
  availableCapitalUsdc?: number | null
}): LpProbeAssessment {
  const activeOrders = orders.filter(order => ACTIVE_ORDER_STATUSES.has(String(order.status ?? '').toLowerCase()))
  const sides = new Set(activeOrders.map(order => String(order.outcome ?? '').trim().toUpperCase()).filter(Boolean))
  const filledSides = new Set(activeOrders
    .filter(order => finiteNonNegative(order.matchedSize) > 0)
    .map(order => String(order.outcome ?? '').trim().toUpperCase())
    .filter(Boolean))
  const twoSided = sides.has('YES') && sides.has('NO')
  const asymmetricFill = twoSided && ((filledSides.has('YES') && !filledSides.has('NO')) || (filledSides.has('NO') && !filledSides.has('YES')))
  const hasCapitalInputs = activeOrders.length > 0 && activeOrders.every(order => (
    Number.isFinite(Number(order.originalSize))
    && Number.isFinite(Number(order.price))
    && Number(order.price) > 0
  ))
  const restingCapitalUsdc = hasCapitalInputs
    ? activeOrders.reduce((total, order) => {
      const openShares = Math.max(0, finiteNonNegative(order.originalSize) - finiteNonNegative(order.matchedSize))
      return total + openShares * finiteNonNegative(order.price)
    }, 0)
    : null
  const validSamples = samples
    .filter(sample => Number.isFinite(sample.estimatedDailyUsdc) && sample.estimatedDailyUsdc >= 0 && Number.isFinite(sample.observedAt))
    .sort((a, b) => a.observedAt - b.observedAt)
  const latest = validSamples.at(-1) ?? null
  const previous = validSamples.length > 1 ? validSamples.at(-2) ?? null : null
  const sampleGap = latest && previous ? latest.observedAt - previous.observedAt : 0
  const variation = latest && previous
    ? Math.abs(latest.estimatedDailyUsdc - previous.estimatedDailyUsdc) / Math.max(latest.estimatedDailyUsdc, previous.estimatedDailyUsdc, 0.01)
    : Number.POSITIVE_INFINITY
  const stable = Boolean(latest && previous && sampleGap >= 55_000 && variation <= 0.15)
  const estimatedDailyUsdc = latest?.estimatedDailyUsdc ?? null
  const efficiencyPer100Usdc = estimatedDailyUsdc !== null && restingCapitalUsdc !== null && restingCapitalUsdc > 0
    ? estimatedDailyUsdc / restingCapitalUsdc * 100
    : null
  const target = Math.max(0.01, finiteNonNegative(dailyTargetUsdc))
  const roughCapitalForTargetUsdc = estimatedDailyUsdc !== null && estimatedDailyUsdc > 0 && restingCapitalUsdc !== null && restingCapitalUsdc > 0
    ? restingCapitalUsdc * target / estimatedDailyUsdc
    : null
  const availableCapital = availableCapitalUsdc !== null && availableCapitalUsdc !== undefined && Number.isFinite(Number(availableCapitalUsdc))
    ? finiteNonNegative(availableCapitalUsdc)
    : null
  const targetMet = estimatedDailyUsdc === null ? null : estimatedDailyUsdc >= target
  const capitalShortfallUsdc = roughCapitalForTargetUsdc !== null && availableCapital !== null
    ? Math.max(0, roughCapitalForTargetUsdc - availableCapital)
    : null
  const capitalSufficientForTarget = roughCapitalForTargetUsdc !== null && availableCapital !== null
    ? availableCapital >= roughCapitalForTargetUsdc
    : null

  let recommendation: LpProbeRecommendation = 'measure'
  if (asymmetricFill) recommendation = 'rebalance'
  else if (scoring === false) recommendation = 'exit'
  else if (stable && estimatedDailyUsdc !== null && estimatedDailyUsdc >= target) recommendation = 'hold'
  else if (stable && restingCapitalUsdc === null) recommendation = 'measure'
  else if (stable && capitalSufficientForTarget === false) recommendation = 'exit'
  else if (stable && estimatedDailyUsdc !== null && estimatedDailyUsdc >= target * 0.6 && restingCapitalUsdc !== null && roughCapitalForTargetUsdc !== null && roughCapitalForTargetUsdc <= restingCapitalUsdc * 2) recommendation = 'increase'
  else if (stable) recommendation = 'exit'

  return {
    recommendation,
    stable,
    twoSided,
    asymmetricFill,
    estimatedDailyUsdc,
    dailyTargetUsdc: target,
    targetMet,
    restingCapitalUsdc,
    efficiencyPer100Usdc,
    roughCapitalForTargetUsdc,
    availableCapitalUsdc: availableCapital,
    capitalShortfallUsdc,
    capitalSufficientForTarget,
  }
}
