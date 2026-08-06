export type LpCapitalOrder = {
  status?: string | null
  side?: string | null
  price?: number | string | null
  originalSize?: number | string | null
  matchedSize?: number | string | null
}

const ACTIVE_ORDER_STATUSES = new Set(['live', 'open', 'partial'])

function finiteNonNegative(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

export function reservedLpCapitalUsdc(orders: LpCapitalOrder[]) {
  return orders
    .filter(order => ACTIVE_ORDER_STATUSES.has(String(order.status ?? '').toLowerCase()))
    .filter(order => !order.side || String(order.side).toUpperCase() === 'BUY')
    .reduce((total, order) => {
      const openShares = Math.max(0, finiteNonNegative(order.originalSize) - finiteNonNegative(order.matchedSize))
      return total + openShares * finiteNonNegative(order.price)
    }, 0)
}

export function lpCapitalReadiness({
  balanceUsdc,
  orders,
  requestedUsdc,
  twoSidedSetupUsdc,
}: {
  balanceUsdc: number | null
  orders: LpCapitalOrder[]
  requestedUsdc: number
  twoSidedSetupUsdc?: number | null
}) {
  const reservedUsdc = reservedLpCapitalUsdc(orders)
  const balance = balanceUsdc !== null && Number.isFinite(balanceUsdc) ? Math.max(0, balanceUsdc) : null
  const availableUsdc = balance === null ? null : Math.max(0, balance - reservedUsdc)
  const requested = finiteNonNegative(requestedUsdc)
  const setup = finiteNonNegative(twoSidedSetupUsdc)
  const orderShortfallUsdc = availableUsdc === null ? null : Math.max(0, requested - availableUsdc)
  const setupShortfallUsdc = availableUsdc === null || setup <= 0 ? null : Math.max(0, setup - availableUsdc)
  return {
    balanceUsdc: balance,
    reservedUsdc,
    availableUsdc,
    orderShortfallUsdc,
    setupShortfallUsdc,
    canSubmitOrder: orderShortfallUsdc === null || orderShortfallUsdc <= 0,
  }
}

export function ceilUsdcCents(value: number) {
  return Math.ceil(Math.max(0, finiteNonNegative(value)) * 100) / 100
}

export function readablePolymarketCapitalError(message: string) {
  const match = message.match(
    /balance:\s*(\d+).*sum of active orders:\s*(\d+).*sum of matched orders:\s*(\d+).*order amount \(inc\. fees\):\s*(\d+)/i,
  )
  if (!match) return message
  const [, balanceRaw, activeRaw, matchedRaw, orderRaw] = match
  const balanceUsdc = Number(balanceRaw) / 1_000_000
  const reservedUsdc = (Number(activeRaw) + Number(matchedRaw)) / 1_000_000
  const availableUsdc = Math.max(0, balanceUsdc - reservedUsdc)
  const requestedUsdc = Number(orderRaw) / 1_000_000
  const shortfallUsdc = Math.max(0, requestedUsdc - availableUsdc)
  return availableUsdc.toFixed(2) + ' USDC is available after open orders. This quote needs '
    + requestedUsdc.toFixed(2) + ' USDC. Fund ' + ceilUsdcCents(shortfallUsdc).toFixed(2)
    + ' USDC more or cancel an existing quote.'
}
