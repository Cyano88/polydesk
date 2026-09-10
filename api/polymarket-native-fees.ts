import { formatUnits, parseUnits } from 'viem'

export type VerifiedFees = { marketRate: number; exponent: number; takerOnly: boolean; makerBps: number; takerBps: number }
export async function readTradeFees(fetchJson: (url: string) => Promise<unknown>, condition: string, token: string, code: string): Promise<VerifiedFees> {
  const [market, builder] = await Promise.all([
    fetchJson(`https://clob.polymarket.com/clob-markets/${condition}`),
    fetchJson(`https://clob.polymarket.com/fees/builder-fees/${code}`),
  ]) as any[]
  if (!Array.isArray(market?.t) || !market.t.some((t: any) => t?.t === token)) throw new Error('Fee metadata token mismatch.')
  if (builder?.code?.toLowerCase() !== code.toLowerCase() || builder.enabled !== true) throw new Error('Builder attribution is disabled or unverified.')
  const fees = { marketRate: market.fd?.r, exponent: market.fd?.e, takerOnly: market.fd?.to,
    makerBps: builder.builder_maker_fee_rate_bps, takerBps: builder.builder_taker_fee_rate_bps }
  validateFees(fees)
  return fees
}
function validateFees(fees: VerifiedFees) {
  if (typeof fees.marketRate !== 'number' || !Number.isFinite(fees.marketRate) || fees.marketRate < 0 || fees.marketRate > 1
    || typeof fees.exponent !== 'number' || !Number.isFinite(fees.exponent) || fees.exponent < 0 || fees.exponent > 10
    || (fees.marketRate > 0 && fees.exponent < 1) || typeof fees.takerOnly !== 'boolean'
    || !Number.isSafeInteger(fees.makerBps) || fees.makerBps < 0 || fees.makerBps > 50
    || !Number.isSafeInteger(fees.takerBps) || fees.takerBps < 0 || fees.takerBps > 100) throw new Error('Missing or unsupported verified fee schedule.')
}
export function feeInclusiveBudget(maximum: string, fees: VerifiedFees, maker: boolean) {
  validateFees(fees)
  const cap = parseUnits(maximum, 6)
  const marketRate = maker && fees.takerOnly ? 0 : fees.marketRate
  // For exponent >= 1, fee/notional = rate * p^(e-1) * (1-p)^e <= rate.
  // Reserve independently rounded platform and builder fees at every fill price.
  const marketPpm = BigInt(Math.ceil(marketRate * 1_000_000))
  const builderPpm = BigInt(maker ? fees.makerBps : fees.takerBps) * 100n
  const roundedFees = marketPpm + builderPpm > 0n ? 2n : 0n
  const order = ((cap - roundedFees) * 1_000_000n / (1_000_000n + marketPpm + builderPpm)) / 10_000n * 10_000n
  if (order <= 0n) throw new Error('Budget is below executable precision after reserving fees.')
  const ceil = (n: bigint) => (n + 999_999n) / 1_000_000n
  const marketReserve = ceil(order * marketPpm), builderReserve = ceil(order * builderPpm)
  const required = order + marketReserve + builderReserve
  if (required > cap) throw new Error('Fee-inclusive amount exceeds buyer cap.')
  return { maximumTotal: formatUnits(cap, 6), orderAmount: formatUnits(order, 6),
    marketFeeReserve: formatUnits(marketReserve, 6), builderFeeReserve: formatUnits(builderReserve, 6),
    requiredBalance: formatUnits(required, 6), unallocated: formatUnits(cap - required, 6),
    builderRateBps: maker ? fees.makerBps : fees.takerBps,
    marketRate, exponent: fees.exponent, feeAmountsAre: 'conservative-reserves-not-settled-charges' }
}