const baseUrl = String(process.env.POLYDESK_OKX_REWARDS_URL ?? 'https://polydesk.trade').replace(/\/+$/, '')
const operatorKey = String(process.env.POLYDESK_OKX_REWARDS_OPERATOR_KEY ?? '').trim()

if (operatorKey.length < 32) {
  throw new Error('POLYDESK_OKX_REWARDS_OPERATOR_KEY must be at least 32 characters.')
}

const response = await fetch(`${baseUrl}/api/okx-rewards?view=payout-queue`, {
  headers: {
    'x-okx-rewards-operator-key': operatorKey,
    accept: 'application/json',
  },
})
const body = await response.json() as {
  ok?: boolean
  error?: string
  payoutConfigured?: boolean
  payouts?: Array<{
    claimId: string
    payer: string
    amountAtomic: string
    asset: string
    network: string
    sourceTransactionHash: string
    serviceId: number
    reservedAt: string
    submittedAt: string | null
    state: string
    attempt: number
    leaseExpiresAt: string | null
  }>
}
if (!response.ok || !body.ok) {
  throw new Error(body.error || `Reward payout queue failed with HTTP ${response.status}.`)
}

const payouts = body.payouts ?? []
const submitted = payouts.filter(payout => payout.state === 'submitted')
const payable = payouts.filter(payout => payout.state === 'reserved' || payout.state === 'processing')
console.log(JSON.stringify({
  ok: true,
  mode: 'dry-run',
  broadcast: false,
  payoutConfigured: body.payoutConfigured ?? false,
  awaitingReview: submitted.length,
  payable: payable.length,
  payableTotalAtomic: payable.reduce((sum, payout) => sum + BigInt(payout.amountAtomic), 0n).toString(),
  submitted,
  payouts: payable,
  next: submitted.length
    ? 'Review submitted claims before preparing any payout.'
    : payable.length
      ? 'Review this payout queue. No transaction was signed or broadcast.'
      : 'No reward claims currently require action.',
}, null, 2))
