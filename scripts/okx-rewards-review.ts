const baseUrl = String(process.env.POLYDESK_OKX_REWARDS_URL ?? 'https://polydesk.trade').replace(/\/+$/, '')
const operatorKey = String(process.env.POLYDESK_OKX_REWARDS_OPERATOR_KEY ?? '').trim()
const [claimId = '', decision = '', ...reasonParts] = process.argv.slice(2)
const reason = reasonParts.join(' ').trim()

if (operatorKey.length < 32) {
  throw new Error('POLYDESK_OKX_REWARDS_OPERATOR_KEY must be at least 32 characters.')
}
if (!/^okxr_[a-f0-9]{24}$/.test(claimId)) {
  throw new Error('Provide a valid reward claim ID.')
}
if (!['approve', 'reject'].includes(decision)) {
  throw new Error('Decision must be approve or reject.')
}
if (decision === 'reject' && !reason) {
  throw new Error('A short rejection reason is required.')
}

const response = await fetch(`${baseUrl}/api/okx-rewards`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-okx-rewards-operator-key': operatorKey,
  },
  body: JSON.stringify({ action: 'review-claim', claimId, decision, reason }),
})
const body = await response.json() as { ok?: boolean; error?: string; claimId?: string; decision?: string }
if (!response.ok || !body.ok) {
  throw new Error(body.error || `Reward claim review failed with HTTP ${response.status}.`)
}
console.log(JSON.stringify({ ok: true, claimId: body.claimId, decision: body.decision }, null, 2))
