import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import { okxRewardCampaignStatus, verifyRewardReference } from '../api/okx-rewards.js'

const transactionHash = `0x${'ab'.repeat(32)}`
const receiptHash = crypto.createHash('sha256').update(transactionHash).digest('hex')

test('campaign remains in preview without explicit approval and recording flags', () => {
  const previousApproved = process.env.POLYDESK_OKX_REWARDS_APPROVED
  const previousRecording = process.env.POLYDESK_OKX_REWARDS_RECORDING
  delete process.env.POLYDESK_OKX_REWARDS_APPROVED
  delete process.env.POLYDESK_OKX_REWARDS_RECORDING
  assert.equal(okxRewardCampaignStatus(new Date('2026-08-01T12:00:00Z')).status, 'preview')
  if (previousApproved === undefined) delete process.env.POLYDESK_OKX_REWARDS_APPROVED
  else process.env.POLYDESK_OKX_REWARDS_APPROVED = previousApproved
  if (previousRecording === undefined) delete process.env.POLYDESK_OKX_REWARDS_RECORDING
  else process.env.POLYDESK_OKX_REWARDS_RECORDING = previousRecording
})

test('receipt verification rejects incomplete and unknown transaction hashes', () => {
  assert.equal(verifyRewardReference('pst_not_an_xlayer_transaction', undefined).status, 400)
  assert.equal(verifyRewardReference(transactionHash, undefined).status, 404)
})

test('receipt verification returns only masked payer and delivery metadata', () => {
  const result = verifyRewardReference(transactionHash, {
    proofs: {
      [receiptHash]: {
        receiptHash,
        transactionHash,
        payer: '0x1111111111111111111111111111111111111111',
        serviceId: 33343,
        serviceName: 'Football Match Live Data',
        servicePath: '/api/a2mcp/worldcup-live-scores',
        amountAtomic: '100000',
        deliveredAt: '2026-08-01T12:00:00.000Z',
        claimState: 'unclaimed',
      },
    },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.proof.payer, '0x1111...1111')
  assert.equal(result.proof.reward, '1 USDT0')
  assert.equal('transactionHash' in result.proof, false)
})
