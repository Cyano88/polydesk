import { formatUnits, parseUnits } from 'viem'

// Match the installed executor's V2 collateral reserve, not a presumed charged fee.
// All spend/cap comparisons use integer collateral units and round reserves up.
export function tradeBudget(input: { maxTotal: string; price: string; reserveBps: number; feeRate: number }) {
  if (!/^\d+(\.\d{1,6})?$/.test(input.maxTotal) || !/^0\.\d{1,6}$/.test(input.price)) throw new Error('Invalid budget or limit price.')
  if (!Number.isSafeInteger(input.reserveBps) || input.reserveBps < 0 || input.reserveBps > 10_000) throw new Error('Unverified executor reserve.')
  if (!Number.isFinite(input.feeRate) || input.feeRate < 0 || input.feeRate > 1) throw new Error('Unverified market fee rate.')
  const cap = parseUnits(input.maxTotal, 6), price = parseUnits(input.price, 6)
  if (cap <= 0n || price <= 0n || price >= 1_000_000n) throw new Error('Budget and price must be positive; price must be below one.')
  const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d
  const gcd = (a: bigint, b: bigint): bigint => b === 0n ? a : gcd(b, a % b)
  // Maker precision is cents; taker precision is 0.00001 shares.
  const step = 10_000n * (price / gcd(price, 1_000_000_000n))
  // Reserve at least the published fee's maximum as a fraction of notional.
  const feeBpsCeil = Math.ceil(input.feeRate * 10_000)
  const reserveBps = Math.max(input.reserveBps, feeBpsCeil)
  const order = (cap * 10_000n / BigInt(10_000 + reserveBps)) / step * step
  if (order <= 0n) throw new Error('Budget is below the executable size at this price.')
  const reserve = ceil(order * BigInt(reserveBps), 10_000n)
  const shares = order * 1_000_000n / price
  const rate = BigInt(Math.round(input.feeRate * 1_000_000))
  const estimate = ceil(order * rate * (1_000_000n - price), 1_000_000_000_000n)
  return { maxTotal: formatUnits(cap, 6), orderAmount: formatUnits(order, 6), shares: formatUnits(shares, 6),
    limitPrice: input.price, estimatedMarketFee: formatUnits(estimate, 6), executorReserveBps: input.reserveBps,
    collateralReserve: formatUnits(reserve, 6), requiredBalance: formatUnits(order + reserve, 6),
    remainingBudget: formatUnits(cap - order - reserve, 6) }
}
