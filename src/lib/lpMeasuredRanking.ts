import type { LpProbeSample } from './lpProbeOptimization'

export type LpMeasuredSummary = {
  marketId: string
  samples: LpProbeSample[]
}

export type LpMeasuredOpportunity = {
  conditionId?: string
  score?: number
  targetScore?: number
  measuredDailyAtCapitalUsdc?: number
  measurementObservedAt?: number
}

const MAX_MEASUREMENT_AGE_MS = 30 * 60_000

export function stableLpMeasurement(summary: LpMeasuredSummary, capitalUsdc: number, now = Date.now()) {
  const samples = summary.samples
    .filter(sample => (
      Number.isFinite(sample.estimatedDailyUsdc)
      && sample.estimatedDailyUsdc >= 0
      && Number.isFinite(sample.restingCapitalUsdc)
      && Number(sample.restingCapitalUsdc) > 0
      && Number.isFinite(sample.observedAt)
    ))
    .sort((a, b) => a.observedAt - b.observedAt)
  const latest = samples.at(-1)
  const previous = samples.at(-2)
  if (!latest || !previous || now - latest.observedAt > MAX_MEASUREMENT_AGE_MS) return null
  const sampleGap = latest.observedAt - previous.observedAt
  const variation = Math.abs(latest.estimatedDailyUsdc - previous.estimatedDailyUsdc)
    / Math.max(latest.estimatedDailyUsdc, previous.estimatedDailyUsdc, 0.01)
  if (sampleGap < 55_000 || variation > 0.15) return null
  return {
    estimatedDailyAtCapitalUsdc: latest.estimatedDailyUsdc / Number(latest.restingCapitalUsdc) * Math.max(0, capitalUsdc),
    observedAt: latest.observedAt,
  }
}

export function rankLpOpportunitiesByMeasurements<T extends LpMeasuredOpportunity>(
  opportunities: T[],
  summaries: LpMeasuredSummary[],
  capitalUsdc: number,
  dailyTargetUsdc: number,
  now = Date.now(),
) {
  const measurements = new Map(summaries.map(summary => [summary.marketId.toLowerCase(), stableLpMeasurement(summary, capitalUsdc, now)]))
  const target = Math.max(0.01, dailyTargetUsdc)
  return opportunities
    .map((opportunity, index) => {
      const measurement = measurements.get(String(opportunity.conditionId ?? '').toLowerCase()) ?? null
      const measuredDaily = measurement?.estimatedDailyAtCapitalUsdc
      const measuredClass = measuredDaily === undefined
        ? 1
        : measuredDaily >= target ? 3 : measuredDaily >= target * 0.6 ? 2 : 0
      return {
        opportunity: measurement ? {
          ...opportunity,
          measuredDailyAtCapitalUsdc: measuredDaily,
          measurementObservedAt: measurement.observedAt,
        } : opportunity,
        index,
        measuredClass,
        measuredDaily: measuredDaily ?? 0,
      }
    })
    .sort((a, b) => (
      b.measuredClass - a.measuredClass
      || (a.measuredClass === 0 || a.measuredClass >= 2 ? b.measuredDaily - a.measuredDaily : 0)
      || a.index - b.index
    ))
    .map(item => item.opportunity as T & LpMeasuredOpportunity)
}
