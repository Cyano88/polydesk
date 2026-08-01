import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import {
  authorizePrivateRehearsalPayout,
  leaseInstantRewardPayout,
  markInstantRewardPaid,
  okxRewardCampaignStatus,
  reserveInstantReward,
  rewardServiceForPaidCall,
  reviewInstantRewardClaim,
  verifyRewardReference,
} from '../api/okx-rewards.js'
import {
  OKX_REWARD_USDT0,
  verifyOkxRewardPayout,
} from '../api/okx-reward-payout-verifier.js'

const transactionHash = `0x${'ab'.repeat(32)}`
const receiptHash = crypto.createHash('sha256').update(transactionHash).digest('hex')
const payoutWallet = '0x2222222222222222222222222222222222222222'
const payerWallet = '0x1111111111111111111111111111111111111111'

function withPayoutEnv<T>(run: () => T) {
  const oldAddress = process.env.POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS
  const oldDaily = process.env.POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC
  process.env.POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS = payoutWallet
  process.env.POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC = '5000000'
  try {
    return run()
  } finally {
    if (oldAddress === undefined) delete process.env.POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS
    else process.env.POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS = oldAddress
    if (oldDaily === undefined) delete process.env.POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC
    else process.env.POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC = oldDaily
  }
}

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

test('campaign accepts only the exact paid amount on registered and migration routes', () => {
  assert.equal(rewardServiceForPaidCall('/api/a2mcp/worldcup-live-scores', '100000')?.id, 33343)
  assert.equal(rewardServiceForPaidCall('/api/a2mcp/football-live-data', '100000')?.id, 33343)
  assert.equal(rewardServiceForPaidCall('/api/a2mcp/football-news-brief', '100000')?.id, 33346)
  assert.equal(rewardServiceForPaidCall('/api/a2mcp/okx/polymarket-lp-scout', '300000')?.id, 33342)
  assert.equal(rewardServiceForPaidCall('/api/a2mcp/worldcup-live-scores', '0'), null)
  assert.equal(rewardServiceForPaidCall('/api/a2mcp/worldcup-live-scores', '99999'), null)
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
  assert.equal(result.proof.reward, '1 USDT0 after review')
  assert.equal('transactionHash' in result.proof, false)
})

test('instant reward submission is deterministic and one-per-payer', () => {
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
  assert.equal(first.state.proofs[receiptHash].claimState, 'submitted')
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

test('operator review reserves eligible claims and can reject suspicious claims', () => {
  const first = reserveInstantReward(transactionHash, {
    proofs: {
      [receiptHash]: {
        receiptHash,
        transactionHash,
        payer: payerWallet,
        serviceId: 33343,
        serviceName: 'Football Match Live Data',
        servicePath: '/api/a2mcp/worldcup-live-scores',
        amountAtomic: '100000',
        deliveredAt: '2026-08-01T12:00:00.000Z',
        claimState: 'unclaimed',
      },
    },
  })
  assert.equal(first.ok, true)
  if (!first.ok) return
  const approved = reviewInstantRewardClaim(first.state, {
    claimId: first.claimId,
    decision: 'approve',
  })
  assert.equal(approved.ok, true)
  if (!approved.ok) return
  assert.equal(approved.proof.claimState, 'reserved')

  const suspiciousTransaction = `0x${'ef'.repeat(32)}`
  const suspiciousReceipt = crypto.createHash('sha256').update(suspiciousTransaction).digest('hex')
  const submitted = reserveInstantReward(suspiciousTransaction, {
    proofs: {
      [suspiciousReceipt]: {
        receiptHash: suspiciousReceipt,
        transactionHash: suspiciousTransaction,
        payer: '0xffffffffffffffffffffffffffffffffffffffff',
        serviceId: 33346,
        serviceName: 'Football News Brief',
        servicePath: '/api/a2mcp/worldcup-market-news',
        amountAtomic: '100000',
        deliveredAt: '2026-08-01T12:00:00.000Z',
        claimState: 'unclaimed',
      },
    },
  })
  assert.equal(submitted.ok, true)
  if (!submitted.ok) return
  const rejected = reviewInstantRewardClaim(submitted.state, {
    claimId: submitted.claimId,
    decision: 'reject',
    reason: 'Coordinated test activity.',
  })
  assert.equal(rejected.ok, true)
  if (rejected.ok) assert.equal(rejected.proof.claimState, 'rejected')
})

test('the instant pool stops after 50 approved or paid claims', () => {
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
  const claimId = 'okxr_ffffffffffffffffffffffff'
  proofs[candidateHash] = {
    receiptHash: candidateHash,
    transactionHash: candidateTransaction,
    payer: '0xffffffffffffffffffffffffffffffffffffffff',
    serviceId: 33346,
    serviceName: 'Football News Brief',
    servicePath: '/api/a2mcp/worldcup-market-news',
    amountAtomic: '100000',
    deliveredAt: '2026-08-02T12:00:00.000Z',
    claimState: 'submitted',
    claimId,
    submittedAt: '2026-08-02T12:01:00.000Z',
  }
  const result = reviewInstantRewardClaim({ proofs }, { claimId, decision: 'approve' })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 410)
})

test('payout leasing produces one exact bounded transfer plan and never re-leases processing work', () => {
  withPayoutEnv(() => {
    const reserved = {
      proofs: {
        [receiptHash]: {
          receiptHash,
          transactionHash,
          payer: payerWallet,
          serviceId: 33343,
          serviceName: 'Football Match Live Data',
          servicePath: '/api/a2mcp/worldcup-live-scores' as const,
          amountAtomic: '100000',
          deliveredAt: '2026-08-01T12:00:00.000Z',
          claimState: 'reserved' as const,
          claimId: 'okxr_111111111111111111111111',
          reservedAt: '2026-08-01T12:01:00.000Z',
        },
      },
    }
    const leased = leaseInstantRewardPayout(
      reserved,
      { workerId: 'polydesk-reward-worker-1' },
      new Date('2026-08-01T12:02:00.000Z'),
    )
    assert.equal(leased.ok, true)
    if (!leased.ok) return
    assert.deepEqual(leased.lease.transfer, {
      chainId: 196,
      network: 'eip155:196',
      asset: OKX_REWARD_USDT0,
      from: payoutWallet,
      to: payerWallet,
      amountAtomic: '1000000',
    })
    assert.equal(leased.state.proofs[receiptHash].claimState, 'processing')
    const retry = leaseInstantRewardPayout(
      leased.state,
      { workerId: 'polydesk-reward-worker-2' },
      new Date('2026-08-01T12:20:00.000Z'),
    )
    assert.equal(retry.ok, false)
    if (!retry.ok) assert.equal(retry.status, 404)
  })
})

test('private rehearsal authorization is exact, idempotent and limited to one reserved claim', () => {
  const claimId = 'okxr_111111111111111111111111'
  const secondClaimId = 'okxr_222222222222222222222222'
  const secondReceiptHash = crypto.createHash('sha256').update('second').digest('hex')
  const state = {
    proofs: {
      [receiptHash]: {
        receiptHash,
        transactionHash,
        payer: payerWallet,
        serviceId: 33343,
        serviceName: 'Football Match Live Data',
        servicePath: '/api/a2mcp/worldcup-live-scores' as const,
        amountAtomic: '100000',
        deliveredAt: '2026-08-01T12:00:00.000Z',
        claimState: 'reserved' as const,
        claimId,
        reservedAt: '2026-08-01T12:01:00.000Z',
      },
      [secondReceiptHash]: {
        receiptHash: secondReceiptHash,
        transactionHash: `0x${'cd'.repeat(32)}`,
        payer: '0x3333333333333333333333333333333333333333',
        serviceId: 33346,
        serviceName: 'Football News Brief',
        servicePath: '/api/a2mcp/worldcup-market-news' as const,
        amountAtomic: '100000',
        deliveredAt: '2026-08-01T12:00:00.000Z',
        claimState: 'reserved' as const,
        claimId: secondClaimId,
        reservedAt: '2026-08-01T12:01:00.000Z',
      },
    },
  }
  const authorized = authorizePrivateRehearsalPayout(
    state,
    { claimId },
    new Date('2026-08-01T12:02:00.000Z'),
  )
  assert.equal(authorized.ok, true)
  if (!authorized.ok) return
  assert.equal(authorized.proof.rehearsalPayoutAuthorizedAt, '2026-08-01T12:02:00.000Z')
  const duplicate = authorizePrivateRehearsalPayout(authorized.state, { claimId })
  assert.equal(duplicate.ok, true)
  if (duplicate.ok) assert.equal(duplicate.duplicate, true)
  const second = authorizePrivateRehearsalPayout(authorized.state, { claimId: secondClaimId })
  assert.equal(second.ok, false)
  if (!second.ok) assert.equal(second.status, 409)
})

test('paid transition is idempotent and rejects transaction reuse across claims', () => {
  withPayoutEnv(() => {
    const leased = leaseInstantRewardPayout({
      proofs: {
        [receiptHash]: {
          receiptHash,
          transactionHash,
          payer: payerWallet,
          serviceId: 33343,
          serviceName: 'Football Match Live Data',
          servicePath: '/api/a2mcp/worldcup-live-scores' as const,
          amountAtomic: '100000',
          deliveredAt: '2026-08-01T12:00:00.000Z',
          claimState: 'reserved' as const,
          claimId: 'okxr_111111111111111111111111',
          reservedAt: '2026-08-01T12:01:00.000Z',
        },
      },
    }, { workerId: 'polydesk-reward-worker-1' })
    assert.equal(leased.ok, true)
    if (!leased.ok) return
    const payoutTransaction = `0x${'12'.repeat(32)}`
    const paid = markInstantRewardPaid(leased.state, {
      claimId: leased.lease.claimId,
      leaseId: leased.lease.leaseId,
      transactionHash: payoutTransaction,
      blockNumber: '123',
      paidAt: new Date('2026-08-01T12:03:00.000Z'),
    })
    assert.equal(paid.ok, true)
    if (!paid.ok) return
    assert.equal(paid.state.proofs[receiptHash].claimState, 'paid')
    const duplicate = markInstantRewardPaid(paid.state, {
      claimId: leased.lease.claimId,
      leaseId: leased.lease.leaseId,
      transactionHash: payoutTransaction,
      blockNumber: '123',
    })
    assert.equal(duplicate.ok, true)
    if (duplicate.ok) assert.equal(duplicate.duplicate, true)
  })
})

test('on-chain verifier accepts only the exact confirmed USDT0 transfer', async () => {
  const payoutTransaction = `0x${'34'.repeat(32)}` as `0x${string}`
  const topics = encodeEventTopics({
    abi: [{
      type: 'event',
      name: 'Transfer',
      inputs: [
        { indexed: true, name: 'from', type: 'address' },
        { indexed: true, name: 'to', type: 'address' },
        { indexed: false, name: 'value', type: 'uint256' },
      ],
    }],
    eventName: 'Transfer',
    args: { from: payoutWallet, to: payerWallet },
  })
  const client = {
    getChainId: async () => 196,
    getTransaction: async () => ({
      from: payoutWallet,
      to: OKX_REWARD_USDT0,
      value: 0n,
    }),
    getTransactionReceipt: async () => ({
      status: 'success',
      from: payoutWallet,
      to: OKX_REWARD_USDT0,
      blockNumber: 100n,
      logs: [{
        address: OKX_REWARD_USDT0,
        topics,
        data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
      }],
    }),
    getBlockNumber: async () => 102n,
    getBlock: async () => ({
      timestamp: BigInt(Math.floor(Date.parse('2026-08-01T12:03:00.000Z') / 1000)),
    }),
  } as any
  const verified = await verifyOkxRewardPayout({
    transactionHash: payoutTransaction,
    payoutAddress: payoutWallet,
    recipient: payerWallet,
    notBefore: new Date('2026-08-01T12:02:00.000Z'),
  }, client)
  assert.equal(verified.ok, true)
  assert.equal(verified.confirmations, 3)
  assert.equal(verified.amountAtomic, '1000000')

  const wrongAmountClient = {
    ...client,
    getTransactionReceipt: async () => ({
      ...(await client.getTransactionReceipt()),
      logs: [{
        address: OKX_REWARD_USDT0,
        topics,
        data: encodeAbiParameters([{ type: 'uint256' }], [999_999n]),
      }],
    }),
  }
  await assert.rejects(
    verifyOkxRewardPayout({
      transactionHash: payoutTransaction,
      payoutAddress: payoutWallet,
      recipient: payerWallet,
      notBefore: new Date('2026-08-01T12:02:00.000Z'),
    }, wrongAmountClient as any),
    /does not exactly match/,
  )
  await assert.rejects(
    verifyOkxRewardPayout({
      transactionHash: payoutTransaction,
      payoutAddress: payoutWallet,
      recipient: payerWallet,
      notBefore: new Date('2026-08-01T12:04:00.000Z'),
    }, client),
    /predates/,
  )
})
