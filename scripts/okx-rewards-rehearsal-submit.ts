const baseUrl = String(process.env.POLYDESK_OKX_REWARDS_URL ?? 'https://polydesk.trade').replace(/\/+$/, '')
const operatorKey = String(process.env.POLYDESK_OKX_REWARDS_OPERATOR_KEY ?? '').trim()
const receiptReference = String(process.argv[2] ?? '').trim().toLowerCase()

if (operatorKey.length < 32) {
  throw new Error('POLYDESK_OKX_REWARDS_OPERATOR_KEY must be at least 32 characters.')
}
if (!/^0x[a-f0-9]{64}$/.test(receiptReference)) {
  throw new Error('Provide the X Layer transaction hash from one eligible delivered PolyDesk call.')
}

const response = await fetch(`${baseUrl}/api/okx-rewards`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-okx-rewards-operator-key': operatorKey,
  },
  body: JSON.stringify({ action: 'submit-rehearsal-claim', receiptReference }),
})
const body = await response.json() as {
  ok?: boolean
  error?: string
  claimId?: string
  proof?: unknown
  message?: string
}
if (!response.ok || !body.ok) {
  throw new Error(body.error || `Reward rehearsal submission failed with HTTP ${response.status}.`)
}
console.log(JSON.stringify({
  ok: true,
  mutation: 'submitted-one-verified-claim-for-review',
  claimId: body.claimId,
  proof: body.proof,
  message: body.message,
  next: 'Review this claim before preparing a payout.',
}, null, 2))
