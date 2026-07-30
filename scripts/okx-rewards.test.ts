import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import { okxRewardCampaignStatus, reserveInstantReward, verifyRewardReference } from '../api/okx-rewards.js'

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

test('instant reward reservation is deterministic and one-per-payer', () => {
  const initial = {
    proofs: {
      [receiptHash]: {
        receiptHash,
        transactionHash,
        payer: '0x1111111111111111111111111111111111111111',
        serviceId: 33343,
        serviceName: 'Football Match Live Data',
        servicePath: '/api/a2mcp/worldcup-live-scores' as const,
        amountAtomic: '100000',
        deliveredAt: '2026-08-01T12:00:00.000Z',
        claimState: 'unclaimed' as const,
      },
    },
  }
  const first = reserveInstantReward(transactionHash, initial, new Date('2026-08-01T12:01:00Z'))
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.match(first.claimId, /^okxr_[a-f0-9]{24}$/)
  assert.equal(first.payoutAddress, '0x1111111111111111111111111111111111111111')
  assert.equal(first.state.proofs[receiptHash].claimState, 'reserved')
  const duplicate = reserveInstantReward(transactionHash, first.state)
  assert.equal(duplicate.ok, false)
  if (duplicate.ok) return
  assert.equal(duplicate.status, 409)
})

test('a second delivered call cannot create a second instant reward for the same payer', () => {
  const secondTransaction = `0x${'cd'.repeat(32)}`
  const secondReceiptHash = crypto.createHash('sha256').update(secondTransaction).digest('hex')
  const state = {
    proofs: {
      [receiptHash]: {
        receiptHash,
        transactionHash,
        payer: '0x1111111111111111111111111111111111111111',
        serviceId: 33343,
        serviceName: 'Football Match Live Data',
        servicePath: '/api/a2mcp/worldcup-live-scores' as const,
        amountAtomic: '100000',
        deliveredAt: '2026-08-01T12:00:00.000Z',
        claimState: 'reserved' as const,
        claimId: 'okxr_existing',
        reservedAt: '2026-08-01T12:01:00.000Z',
      },
      [secondReceiptHash]: {
        receiptHash: secondReceiptHash,
        transactionHash: secondTransaction,
        payer: '0x1111111111111111111111111111111111111111',
        serviceId: 33346,
        serviceName: 'Football News Brief',
        servicePath: '/api/a2mcp/worldcup-market-news' as const,
        amountAtomic: '100000',
        deliveredAt: '2026-08-02T12:00:00.000Z',
        claimState: 'unclaimed' as const,
      },
    },
  }
  const result = reserveInstantReward(secondTransaction, state)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /one-time instant reward/)
})

test('the instant pool stops after 50 reserved or paid claims', () => {
  const proofs: Record<string, any> = {}
  for (let index = 0; index < 50; index += 1) {
    const tx = `0x${index.toString(16).padStart(64, '0')}`
    const hash = crypto.createHash('sha256').update(tx).digest('hex')
    proofs[hash] = {
      receiptHash: hash,
      transactionHash: tx,
      payer: `0x${(index + 1).toString(16).padStart(40, '0')}`,
      serviceId: 33343,
      serviceName: 'Football Match Live Data',
      servicePath: '/api/a2mcp/worldcup-live-scores',
      amountAtomic: '100000',
      deliveredAt: '2026-08-01T12:00:00.000Z',
      claimState: index % 2 === 0 ? 'reserved' : 'paid',
    }
  }
  const candidateTransaction = `0x${'ef'.repeat(32)}`
  const candidateHash = crypto.createHash('sha256').update(candidateTransaction).digest('hex')
  proofs[candidateHash] = {
    receiptHash: candidateHash,
    transactionHash: candidateTransaction,
    payer: '0xffffffffffffffffffffffffffffffffffffffff',
    serviceId: 33346,
    serviceName: 'Football News Brief',
    servicePath: '/api/a2mcp/worldcup-market-news',
    amountAtomic: '100000',
    deliveredAt: '2026-08-02T12:00:00.000Z',
    claimState: 'unclaimed',
  }
  const result = reserveInstantReward(candidateTransaction, { proofs })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 410)
})
