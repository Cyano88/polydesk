export function estimateTwoSidedRewardCapitalUsdc(
  minShares: number | undefined,
  yesPrice: number | undefined,
  noPrice: number | undefined,
) {
  if (
    typeof minShares !== 'number'
    || !Number.isFinite(minShares)
    || minShares <= 0
    || typeof yesPrice !== 'number'
    || !Number.isFinite(yesPrice)
    || yesPrice <= 0
    || yesPrice >= 1
    || typeof noPrice !== 'number'
    || !Number.isFinite(noPrice)
    || noPrice <= 0
    || noPrice >= 1
  ) return undefined
  return Number((minShares * (yesPrice + noPrice)).toFixed(2))
}
