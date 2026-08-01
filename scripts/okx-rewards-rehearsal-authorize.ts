const baseUrl = String(process.env.POLYDESK_OKX_REWARDS_URL ?? 'https://polydesk.trade').replace(/\/+$/, '')
const operatorKey = String(process.env.POLYDESK_OKX_REWARDS_OPERATOR_KEY ?? '').trim()
const claimId = String(process.argv[2] ?? '').trim()

if (operatorKey.length < 32) throw new Error('POLYDESK_OKX_REWARDS_OPERATOR_KEY must be at least 32 characters.')
if (!/^okxr_[a-f0-9]{24}$/.test(claimId)) throw new Error('A valid reward claim ID is required.')

const response = await fetch(`${baseUrl}/api/okx-rewards`, {
  method: 'POST',
  headers: {
    'x-okx-rewards-operator-key': operatorKey,
    'content-type': 'application/json',
    accept: 'application/json',
  },
  body: JSON.stringify({ action: 'authorize-rehearsal-payout', claimId }),
})
const body = await response.json()
if (!response.ok) throw new Error((body as { error?: string }).error || `Authorization failed with HTTP ${response.status}.`)
console.log(JSON.stringify(body, null, 2))
