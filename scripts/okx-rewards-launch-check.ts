const value = (name: string) => String(process.env[name] ?? '').trim()
const flag = (name: string) => value(name).toLowerCase() === 'true'
const address = (name: string) => /^0x[a-fA-F0-9]{40}$/.test(value(name)) ? value(name).toLowerCase() : ''

const checks: Array<{ name: string; ok: boolean; detail: string }> = []
const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail })

const startsAt = new Date(value('POLYDESK_OKX_REWARDS_STARTS_AT'))
const endsAt = new Date(value('POLYDESK_OKX_REWARDS_ENDS_AT'))
const datesValid = !Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime()) && endsAt > startsAt
const durationDays = datesValid ? (endsAt.getTime() - startsAt.getTime()) / 86_400_000 : 0
const payoutAddress = address('POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS')
const sellerAddresses = [
  address('OKX_X402_PAY_TO'),
  address('OKX_X402_SELLER_ADDRESS'),
  address('TREASURY_ADDRESS'),
].filter(Boolean)
const exclusions = value('POLYDESK_OKX_REWARD_EXCLUDED_WALLETS')
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(item => /^0x[a-f0-9]{40}$/.test(item))
const dailyLimit = /^\d+$/.test(value('POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC'))
  ? BigInt(value('POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC'))
  : 0n

add('campaign approval recorded', flag('POLYDESK_OKX_REWARDS_APPROVED'), 'POLYDESK_OKX_REWARDS_APPROVED must be true')
add('delivery recording enabled', flag('POLYDESK_OKX_REWARDS_RECORDING'), 'Recording must start with the published campaign window')
add('three-week window valid', datesValid && durationDays > 0 && durationDays <= 21, datesValid ? `${durationDays.toFixed(2)} day(s)` : 'Start or end timestamp is invalid')
add('dedicated payout address configured', Boolean(payoutAddress), payoutAddress ? `${payoutAddress.slice(0, 6)}...${payoutAddress.slice(-4)}` : 'Missing or invalid address')
add('payout wallet is separate', Boolean(payoutAddress) && !sellerAddresses.includes(payoutAddress), 'Payout wallet must differ from seller and treasury wallets')
add('daily payout ceiling safe', dailyLimit > 0n && dailyLimit <= 5_000_000n, `${dailyLimit.toString()} atomic units; maximum is 5000000`)
add('operator key configured', value('POLYDESK_OKX_REWARDS_OPERATOR_KEY').length >= 32, 'Secret is checked by length and never printed')
add('durable database configured', Boolean(value('DATABASE_URL') || value('POSTGRES_URL')), 'A Postgres URL is required for atomic claims')
add('X Layer RPC configured', /^https:\/\//i.test(value('POLYDESK_OKX_REWARDS_XLAYER_RPC_URL')), 'An HTTPS X Layer RPC URL is required')
add('test wallets excluded', exclusions.length > 0, `${exclusions.length} explicit excluded wallet(s)`)
add('leaderboard remains disabled', !flag('POLYDESK_OKX_REWARDS_LEADERBOARD_ENABLED'), 'Phase 1 contains only the 50-USDT0 instant pilot')

const ok = checks.every(check => check.ok)
console.log(JSON.stringify({
  ok,
  mode: 'launch-readiness',
  broadcast: false,
  publicFlags: {
    claimsEnabled: flag('POLYDESK_OKX_REWARDS_CLAIMS_ENABLED'),
    payoutsEnabled: flag('POLYDESK_OKX_REWARDS_PAYOUTS_ENABLED'),
  },
  checks,
  next: ok
    ? 'Run one private claim, review, 1-USDT0 payout and confirmation rehearsal before enabling public claims.'
    : 'Fix every failed check. No campaign funds should move yet.',
}, null, 2))
if (!ok) process.exitCode = 1
