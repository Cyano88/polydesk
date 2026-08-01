import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { mutateDurableJson, readDurableJson } from './render-durable-store.js'
import {
  OKX_REWARD_CHAIN_ID,
  OKX_REWARD_INSTANT_ATOMIC,
  OKX_REWARD_NETWORK,
  OKX_REWARD_USDT0,
  verifyOkxRewardPayout,
} from './okx-reward-payout-verifier.js'

const STORE_KEY = 'polydesk:okx-rewards:v1'
const INSTANT_REWARD_LIMIT = 50
const MAX_PENDING_REVIEWS = 100
const TOTAL_INSTANT_REWARD_ATOMIC = OKX_REWARD_INSTANT_ATOMIC * BigInt(INSTANT_REWARD_LIMIT)
const MAX_DAILY_PAYOUT_ATOMIC = 5_000_000n
const LEADERBOARD_PRIZES = [200, 150, 100, 50] as const

const SERVICE_BY_PATH = {
  '/api/a2mcp/okx/polymarket-lp-scout': { id: 33342, name: 'Polymarket LP Scout', amountAtomic: '300000' },
  '/api/a2mcp/worldcup-live-scores': { id: 33343, name: 'Football Match Live Data', amountAtomic: '100000' },
  '/api/a2mcp/football-live-data': { id: 33343, name: 'Football Match Live Data', amountAtomic: '100000' },
  '/api/a2mcp/polymarket-funding-link': { id: 33344, name: 'Verified Polymarket Funding', amountAtomic: '100000' },
  '/api/a2mcp/polymarket-portfolio-watch': { id: 33345, name: 'Governed Polymarket Trader', amountAtomic: '100000' },
  '/api/a2mcp/polymarket-agent-flow': { id: 33345, name: 'Governed Polymarket Trader', amountAtomic: '100000' },
  '/api/a2mcp/worldcup-market-news': { id: 33346, name: 'Football News Brief', amountAtomic: '100000' },
  '/api/a2mcp/football-news-brief': { id: 33346, name: 'Football News Brief', amountAtomic: '100000' },
} as const

type EligibleServicePath = keyof typeof SERVICE_BY_PATH

type RewardProof = {
  receiptHash: string
  transactionHash: string
  payer: string
  serviceId: number
  serviceName: string
  servicePath: EligibleServicePath
  amountAtomic: string
  deliveredAt: string
  claimState: 'unclaimed' | 'submitted' | 'reserved' | 'processing' | 'paid' | 'rejected'
  claimId?: string
  submittedAt?: string
  reservedAt?: string
  reviewedAt?: string
  reviewReason?: string
  rehearsalPayoutAuthorizedAt?: string
  payoutAttempt?: number
  payoutLeaseId?: string
  payoutLeaseOwner?: string
  payoutLeaseStartedAt?: string
  payoutLeaseExpiresAt?: string
  payoutTransactionHash?: string
  payoutPaidAt?: string
  payoutBlockNumber?: string
}

type RewardState = {
  proofs: Record<string, RewardProof>
}

export function authorizePrivateRehearsalPayout(
  current: RewardState | undefined,
  input: { claimId: unknown },
  now = new Date(),
) {
  const state = current ?? { proofs: {} }
  const claimId = validClaimId(input.claimId)
  if (!claimId) return { ok: false as const, status: 400, error: 'A valid reward claim ID is required.' }
  const proof = Object.values(state.proofs).find(item => item.claimId === claimId)
  if (!proof) return { ok: false as const, status: 404, error: 'Reward claim was not found.' }
  if (proof.rehearsalPayoutAuthorizedAt) {
    return { ok: true as const, duplicate: true as const, state, proof }
  }
  if (proof.claimState !== 'reserved') {
    return { ok: false as const, status: 409, error: 'Only a reviewed and reserved claim can be authorized for rehearsal.' }
  }
  const priorRehearsal = Object.values(state.proofs).some(item =>
    item.claimId !== claimId && Boolean(item.rehearsalPayoutAuthorizedAt))
  if (priorRehearsal) {
    return { ok: false as const, status: 409, error: 'A private payout rehearsal has already been authorized.' }
  }
  const authorizedProof: RewardProof = {
    ...proof,
    rehearsalPayoutAuthorizedAt: now.toISOString(),
  }
  return {
    ok: true as const,
    duplicate: false as const,
    state: {
      proofs: {
        ...state.proofs,
        [proof.receiptHash]: authorizedProof,
      },
    },
    proof: authorizedProof,
  }
}

function isPrivateRehearsalPayout(proof: RewardProof | undefined) {
  return Boolean(proof?.rehearsalPayoutAuthorizedAt)
}

export function rewardServiceForPaidCall(servicePath: string, amountAtomic: unknown) {
  const service = SERVICE_BY_PATH[servicePath as EligibleServicePath]
  return service && clean(amountAtomic) === service.amountAtomic ? service : null
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function envFlag(name: string) {
  return clean(process.env[name]).toLowerCase() === 'true'
}

function transactionHash(value: unknown) {
  const normalized = clean(value).toLowerCase()
  return /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : ''
}

function payerAddress(value: unknown) {
  const normalized = clean(value).toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : ''
}

function hashReceipt(value: string) {
  return crypto.createHash('sha256').update(value.toLowerCase()).digest('hex')
}

function maskedAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function campaignDate(name: string) {
  const value = clean(process.env[name])
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function positiveAtomic(name: string, maximum: bigint) {
  const value = clean(process.env[name])
  if (!/^[1-9]\d*$/.test(value)) return null
  const parsed = BigInt(value)
  return parsed <= maximum ? parsed : null
}

function payoutConfiguration() {
  const address = payerAddress(process.env.POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS)
  const dailyLimitAtomic = positiveAtomic(
    'POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC',
    MAX_DAILY_PAYOUT_ATOMIC,
  )
  const minimumConfirmations = Math.max(
    3,
    Math.min(20, Number(process.env.POLYDESK_OKX_REWARDS_MIN_CONFIRMATIONS ?? 3) || 3),
  )
  return {
    address,
    dailyLimitAtomic,
    minimumConfirmations,
    configured: Boolean(address && dailyLimitAtomic),
  }
}

function excludedWallets() {
  return new Set([
    ...clean(process.env.POLYDESK_OKX_REWARD_EXCLUDED_WALLETS)
      .split(',')
      .map(value => payerAddress(value))
      .filter(Boolean),
    payerAddress(process.env.OKX_X402_PAY_TO),
    payerAddress(process.env.OKX_X402_SELLER_ADDRESS),
    payerAddress(process.env.TREASURY_ADDRESS),
    payerAddress(process.env.POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS),
  ].filter(Boolean))
}

export function okxRewardCampaignStatus(now = new Date()) {
  const approved = envFlag('POLYDESK_OKX_REWARDS_APPROVED')
  const recording = envFlag('POLYDESK_OKX_REWARDS_RECORDING')
  const claimsEnabled = envFlag('POLYDESK_OKX_REWARDS_CLAIMS_ENABLED')
  const leaderboardEnabled = envFlag('POLYDESK_OKX_REWARDS_LEADERBOARD_ENABLED')
  const payoutFlag = envFlag('POLYDESK_OKX_REWARDS_PAYOUTS_ENABLED')
  const startsAt = campaignDate('POLYDESK_OKX_REWARDS_STARTS_AT')
  const endsAt = campaignDate('POLYDESK_OKX_REWARDS_ENDS_AT')
  const inWindow = Boolean(startsAt && endsAt && now >= startsAt! && now <= endsAt!)
  const campaignRunning = approved && recording && inWindow
  const payout = payoutConfiguration()
  // Claims stop at the campaign deadline, but already-reserved rewards may
  // settle afterward. Payouts therefore have a separate explicit gate.
  const payoutsEnabled = approved && payoutFlag && payout.configured
  return {
    status: campaignRunning
      ? claimsEnabled ? 'active' as const : 'recording' as const
      : 'preview' as const,
    approved,
    recording,
    claimsEnabled,
    leaderboardEnabled,
    payoutsEnabled,
    payoutConfigured: payout.configured,
    startsAt: startsAt?.toISOString() ?? null,
    endsAt: endsAt?.toISOString() ?? null,
  }
}

export async function recordDeliveredOkxCall(input: {
  payer: unknown
  transaction: unknown
  amountAtomic: unknown
  servicePath: string
  deliveredAt?: Date
}) {
  const campaign = okxRewardCampaignStatus(input.deliveredAt)
  if (campaign.status === 'preview') return { recorded: false, reason: 'campaign_inactive' as const }

  const service = rewardServiceForPaidCall(input.servicePath, input.amountAtomic)
  const payer = payerAddress(input.payer)
  const transaction = transactionHash(input.transaction)
  const amountAtomic = clean(input.amountAtomic)
  if (!service || !payer || !transaction) {
    return { recorded: false, reason: 'invalid_proof' as const }
  }
  if (excludedWallets().has(payer)) return { recorded: false, reason: 'excluded_wallet' as const }

  const receiptHash = hashReceipt(transaction)
  let inserted = false
  await mutateDurableJson<RewardState>(STORE_KEY, current => {
    const state = current ?? { proofs: {} }
    if (state.proofs[receiptHash]) return state
    inserted = true
    return {
      proofs: {
        ...state.proofs,
        [receiptHash]: {
          receiptHash,
          transactionHash: transaction,
          payer,
          serviceId: service.id,
          serviceName: service.name,
          servicePath: input.servicePath as EligibleServicePath,
          amountAtomic,
          deliveredAt: (input.deliveredAt ?? new Date()).toISOString(),
          claimState: 'unclaimed',
        },
      },
    }
  })
  return { recorded: inserted, reason: inserted ? 'recorded' as const : 'duplicate' as const }
}

function leaderboard(proofs: RewardProof[]) {
  const points = new Map<string, { payer: string; points: number; services: Set<number> }>()
  const seen = new Set<string>()
  for (const proof of proofs) {
    const day = proof.deliveredAt.slice(0, 10)
    const pointKey = `${proof.payer}:${proof.serviceId}:${day}`
    if (seen.has(pointKey)) continue
    seen.add(pointKey)
    const entry = points.get(proof.payer) ?? { payer: proof.payer, points: 0, services: new Set<number>() }
    entry.points += 1
    entry.services.add(proof.serviceId)
    points.set(proof.payer, entry)
  }
  return [...points.values()]
    .filter(entry => entry.services.size >= 2)
    .sort((left, right) => right.points - left.points || left.payer.localeCompare(right.payer))
    .slice(0, 20)
    .map((entry, index) => ({
      rank: index + 1,
      wallet: maskedAddress(entry.payer),
      points: entry.points,
      servicesUsed: entry.services.size,
      prizeUsdt: LEADERBOARD_PRIZES[index] ?? null,
    }))
}

export function verifyRewardReference(reference: unknown, state: RewardState | undefined) {
  const transaction = transactionHash(reference)
  if (!transaction) return { ok: false as const, status: 400, error: 'Enter a full X Layer transaction hash.' }
  const proof = state?.proofs?.[hashReceipt(transaction)]
  if (!proof) return {
    ok: false as const,
    status: 404,
    error: 'No eligible delivered PolyDesk call matches this reference.',
  }
  return {
    ok: true as const,
    proof: {
      serviceId: proof.serviceId,
      serviceName: proof.serviceName,
      payer: maskedAddress(proof.payer),
      deliveredAt: proof.deliveredAt,
      claimState: proof.claimState,
      reward: proof.claimState === 'unclaimed' ? '1 USDT0 after review' : null,
      claimId: proof.claimId ?? null,
    },
  }
}

export function reserveInstantReward(reference: unknown, current: RewardState | undefined, now = new Date()) {
  const transaction = transactionHash(reference)
  if (!transaction) return { ok: false as const, status: 400, error: 'Enter a full X Layer transaction hash.' }
  const receiptHash = hashReceipt(transaction)
  const state = current ?? { proofs: {} }
  const proof = state.proofs[receiptHash]
  if (!proof) return { ok: false as const, status: 404, error: 'No eligible delivered PolyDesk call matches this reference.' }
  if (excludedWallets().has(proof.payer)) {
    return { ok: false as const, status: 403, error: 'This wallet is excluded from campaign rewards.' }
  }
  if (proof.claimState !== 'unclaimed') {
    return {
      ok: false as const,
      status: 409,
      error: proof.claimState === 'paid'
        ? 'This payer already received the instant reward.'
        : 'This payer already submitted an instant reward claim.',
    }
  }
  const payerAlreadyClaimed = Object.values(state.proofs).some(item =>
    item.payer === proof.payer && item.claimState !== 'unclaimed')
  if (payerAlreadyClaimed) {
    return { ok: false as const, status: 409, error: 'This payer has already used the one-time instant reward.' }
  }
  const pendingReviews = Object.values(state.proofs).filter(item => item.claimState === 'submitted').length
  if (pendingReviews >= MAX_PENDING_REVIEWS) {
    return { ok: false as const, status: 429, error: 'The claim review queue is temporarily full.' }
  }

  const claimId = `okxr_${crypto.createHash('sha256').update(`${receiptHash}:${proof.payer}`).digest('hex').slice(0, 24)}`
  const nextProof: RewardProof = {
    ...proof,
    claimState: 'submitted',
    claimId,
    submittedAt: now.toISOString(),
  }
  return {
    ok: true as const,
    claimId,
    payoutAddress: proof.payer,
    state: {
      proofs: {
        ...state.proofs,
        [receiptHash]: nextProof,
      },
    },
    proof: {
      serviceName: proof.serviceName,
      payer: maskedAddress(proof.payer),
      reward: '1 USDT0 after eligibility review',
      claimState: 'submitted' as const,
    },
  }
}

export function reviewInstantRewardClaim(
  current: RewardState | undefined,
  input: { claimId: unknown; decision: unknown; reason?: unknown },
  now = new Date(),
) {
  const state = current ?? { proofs: {} }
  const claimId = validClaimId(input.claimId)
  const decision = clean(input.decision).toLowerCase()
  if (!claimId || !['approve', 'reject'].includes(decision)) {
    return { ok: false as const, status: 400, error: 'A valid claim ID and review decision are required.' }
  }
  const proof = Object.values(state.proofs).find(item => item.claimId === claimId)
  if (!proof) return { ok: false as const, status: 404, error: 'Reward claim was not found.' }
  if (proof.claimState !== 'submitted') {
    return { ok: false as const, status: 409, error: 'Only submitted claims can be reviewed.' }
  }
  const reviewedAt = now.toISOString()
  if (decision === 'reject') {
    const rejectedProof: RewardProof = {
      ...proof,
      claimState: 'rejected',
      reviewedAt,
      reviewReason: clean(input.reason).slice(0, 160) || 'Not eligible under the published campaign rules.',
    }
    return {
      ok: true as const,
      decision: 'rejected' as const,
      state: { proofs: { ...state.proofs, [proof.receiptHash]: rejectedProof } },
      proof: rejectedProof,
    }
  }
  const committed = Object.values(state.proofs).filter(item =>
    item.claimState === 'reserved' || item.claimState === 'processing' || item.claimState === 'paid').length
  if (committed >= INSTANT_REWARD_LIMIT) {
    return { ok: false as const, status: 410, error: 'The 50-user instant reward pool is fully allocated.' }
  }
  const reservedProof: RewardProof = {
    ...proof,
    claimState: 'reserved',
    reviewedAt,
    reservedAt: reviewedAt,
  }
  return {
    ok: true as const,
    decision: 'approved' as const,
    state: { proofs: { ...state.proofs, [proof.receiptHash]: reservedProof } },
    proof: reservedProof,
  }
}

function validWorkerId(value: unknown) {
  const normalized = clean(value)
  return /^[a-zA-Z0-9:_-]{3,64}$/.test(normalized) ? normalized : ''
}

function validClaimId(value: unknown) {
  const normalized = clean(value)
  return /^okxr_[a-f0-9]{24}$/.test(normalized) ? normalized : ''
}

function payoutAtomicUsed(proofs: RewardProof[], now: Date) {
  const utcDay = now.toISOString().slice(0, 10)
  let total = 0n
  let today = 0n
  for (const proof of proofs) {
    // A processing claim remains committed even after its lease expires. It may
    // already have a broadcast transaction, so automatically leasing it again
    // could double-pay the same wallet.
    const committed = proof.claimState === 'paid' || proof.claimState === 'processing'
    if (!committed) continue
    total += OKX_REWARD_INSTANT_ATOMIC
    const committedAt = proof.payoutPaidAt ?? proof.payoutLeaseStartedAt
    if (committedAt?.slice(0, 10) === utcDay) today += OKX_REWARD_INSTANT_ATOMIC
  }
  return { total, today }
}

export function leaseInstantRewardPayout(
  current: RewardState | undefined,
  input: { workerId: unknown; claimId?: unknown; leaseSeconds?: unknown },
  now = new Date(),
) {
  const state = current ?? { proofs: {} }
  const workerId = validWorkerId(input.workerId)
  const requestedClaimId = input.claimId ? validClaimId(input.claimId) : ''
  if (!workerId) return { ok: false as const, status: 400, error: 'A valid payout worker ID is required.' }
  if (input.claimId && !requestedClaimId) {
    return { ok: false as const, status: 400, error: 'A valid reward claim ID is required.' }
  }

  const payout = payoutConfiguration()
  if (!payout.configured || !payout.address || !payout.dailyLimitAtomic) {
    return { ok: false as const, status: 503, error: 'The campaign payout wallet and daily limit are not configured.' }
  }

  const proofs = Object.values(state.proofs)
  const candidate = proofs
    .filter(proof => !requestedClaimId || proof.claimId === requestedClaimId)
    .find(proof => proof.claimState === 'reserved' && !excludedWallets().has(proof.payer))
  if (!candidate) return { ok: false as const, status: 404, error: 'No reservable reward payout is available.' }

  const used = payoutAtomicUsed(proofs, now)
  if (used.total + OKX_REWARD_INSTANT_ATOMIC > TOTAL_INSTANT_REWARD_ATOMIC) {
    return { ok: false as const, status: 410, error: 'The instant reward payout cap has been reached.' }
  }
  if (used.today + OKX_REWARD_INSTANT_ATOMIC > payout.dailyLimitAtomic) {
    return { ok: false as const, status: 429, error: 'The daily reward payout limit has been reached.' }
  }

  const leaseSeconds = Math.max(60, Math.min(900, Number(input.leaseSeconds ?? 300) || 300))
  const leaseStartedAt = now.toISOString()
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
  const leaseId = `okxl_${crypto.randomBytes(16).toString('hex')}`
  const nextProof: RewardProof = {
    ...candidate,
    claimState: 'processing',
    payoutAttempt: (candidate.payoutAttempt ?? 0) + 1,
    payoutLeaseId: leaseId,
    payoutLeaseOwner: workerId,
    payoutLeaseStartedAt: leaseStartedAt,
    payoutLeaseExpiresAt: leaseExpiresAt,
  }
  return {
    ok: true as const,
    state: {
      proofs: {
        ...state.proofs,
        [candidate.receiptHash]: nextProof,
      },
    },
    lease: {
      leaseId,
      claimId: candidate.claimId!,
      workerId,
      expiresAt: leaseExpiresAt,
      attempt: nextProof.payoutAttempt!,
      transfer: {
        chainId: OKX_REWARD_CHAIN_ID,
        network: OKX_REWARD_NETWORK,
        asset: OKX_REWARD_USDT0,
        from: payout.address,
        to: candidate.payer,
        amountAtomic: OKX_REWARD_INSTANT_ATOMIC.toString(),
      },
    },
  }
}

export function markInstantRewardPaid(
  current: RewardState | undefined,
  input: {
    claimId: unknown
    leaseId: unknown
    transactionHash: unknown
    blockNumber: string
    paidAt?: Date
  },
) {
  const state = current ?? { proofs: {} }
  const claimId = validClaimId(input.claimId)
  const leaseId = clean(input.leaseId)
  const transaction = transactionHash(input.transactionHash)
  if (!claimId || !/^okxl_[a-f0-9]{32}$/.test(leaseId) || !transaction) {
    return { ok: false as const, status: 400, error: 'Claim, lease or payout transaction is invalid.' }
  }
  const proof = Object.values(state.proofs).find(item => item.claimId === claimId)
  if (!proof) return { ok: false as const, status: 404, error: 'Reward claim was not found.' }
  if (proof.claimState === 'paid') {
    if (proof.payoutTransactionHash !== transaction) {
      return { ok: false as const, status: 409, error: 'Reward claim was already paid by a different transaction.' }
    }
    return { ok: true as const, duplicate: true as const, state, proof }
  }
  if (proof.claimState !== 'processing' || proof.payoutLeaseId !== leaseId) {
    return { ok: false as const, status: 409, error: 'Payout lease does not own this reward claim.' }
  }
  const transactionAlreadyUsed = Object.values(state.proofs).some(item =>
    item.claimId !== claimId && item.payoutTransactionHash === transaction)
  if (transactionAlreadyUsed) {
    return { ok: false as const, status: 409, error: 'Payout transaction is already attached to another reward claim.' }
  }

  const paidAt = (input.paidAt ?? new Date()).toISOString()
  const paidProof: RewardProof = {
    ...proof,
    claimState: 'paid',
    payoutTransactionHash: transaction,
    payoutPaidAt: paidAt,
    payoutBlockNumber: input.blockNumber,
    payoutLeaseExpiresAt: paidAt,
  }
  return {
    ok: true as const,
    duplicate: false as const,
    state: {
      proofs: {
        ...state.proofs,
        [proof.receiptHash]: paidProof,
      },
    },
    proof: paidProof,
  }
}

function operatorAuthorized(req: Request) {
  const expected = clean(process.env.POLYDESK_OKX_REWARDS_OPERATOR_KEY)
  const provided = clean(req.headers['x-okx-rewards-operator-key'])
  if (expected.length < 32 || provided.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

export default async function okxRewardsHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const campaign = okxRewardCampaignStatus()
  const state = await readDurableJson<RewardState>(STORE_KEY)
  const proofs = Object.values(state?.proofs ?? {})

  if (req.method === 'GET') {
    if (clean(req.query.view) === 'payout-queue') {
      if (!operatorAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
      return res.status(200).json({
        ok: true,
        payoutConfigured: payoutConfiguration().configured,
        payouts: proofs
          .filter(proof => proof.claimState === 'submitted' || proof.claimState === 'reserved' || proof.claimState === 'processing')
          .map(proof => ({
            claimId: proof.claimId,
            payer: proof.payer,
            amountAtomic: OKX_REWARD_INSTANT_ATOMIC.toString(),
            asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
            network: 'eip155:196',
            sourceTransactionHash: proof.transactionHash,
            serviceId: proof.serviceId,
            reservedAt: proof.reservedAt,
            state: proof.claimState,
            submittedAt: proof.submittedAt ?? null,
            attempt: proof.payoutAttempt ?? 0,
            leaseExpiresAt: proof.payoutLeaseExpiresAt ?? null,
          })),
      })
    }
    return res.status(200).json({
      ok: true,
      campaign: {
        ...campaign,
        instantPoolUsdt: 50,
        instantRewardUsdt: 1,
        instantRewardLimit: INSTANT_REWARD_LIMIT,
        leaderboardEnabled: campaign.leaderboardEnabled,
        leaderboardPoolUsdt: campaign.leaderboardEnabled ? 500 : 0,
        prizesUsdt: campaign.leaderboardEnabled ? LEADERBOARD_PRIZES : [],
        token: 'USDT0',
        network: 'X Layer',
        paidInstantClaims: proofs.filter(proof => proof.claimState === 'paid').length,
        reservedInstantClaims: proofs.filter(proof =>
          proof.claimState === 'reserved' || proof.claimState === 'processing').length,
        submittedInstantClaims: proofs.filter(proof => proof.claimState === 'submitted').length,
      },
      leaderboard: campaign.leaderboardEnabled ? leaderboard(proofs) : [],
    })
  }

  if (req.method === 'POST') {
    const action = clean(req.body?.action)
    if (action === 'submit-rehearsal-claim') {
      if (!operatorAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
      if (campaign.status !== 'recording' || campaign.claimsEnabled) {
        return res.status(409).json({ ok: false, error: 'Private rehearsal submission is not available.' })
      }
      let reservation: ReturnType<typeof reserveInstantReward> | undefined
      await mutateDurableJson<RewardState>(STORE_KEY, current => {
        reservation = reserveInstantReward(req.body?.receiptReference, current)
        return reservation.ok ? reservation.state : current ?? { proofs: {} }
      })
      if (!reservation) return res.status(500).json({ ok: false, error: 'Could not submit the rehearsal claim.' })
      if (!reservation.ok) return res.status(reservation.status).json(reservation)
      return res.status(200).json({
        ok: true,
        claimId: reservation.claimId,
        proof: reservation.proof,
        message: 'One verified claim was submitted for private rehearsal review. Public claims remain disabled.',
      })
    }
    if (action === 'review-claim') {
      if (!operatorAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
      let result: ReturnType<typeof reviewInstantRewardClaim> | undefined
      await mutateDurableJson<RewardState>(STORE_KEY, current => {
        result = reviewInstantRewardClaim(current, {
          claimId: req.body?.claimId,
          decision: req.body?.decision,
          reason: req.body?.reason,
        })
        return result.ok ? result.state : current ?? { proofs: {} }
      })
      if (!result) return res.status(500).json({ ok: false, error: 'Could not review this reward claim.' })
      return res.status(result.ok ? 200 : result.status).json(result.ok
        ? { ok: true, claimId: req.body?.claimId, decision: result.decision }
        : result)
    }
    if (action === 'authorize-rehearsal-payout') {
      if (!operatorAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
      if (campaign.status !== 'recording' || campaign.claimsEnabled || campaign.payoutsEnabled) {
        return res.status(409).json({ ok: false, error: 'Private rehearsal authorization is not available.' })
      }
      let result: ReturnType<typeof authorizePrivateRehearsalPayout> | undefined
      await mutateDurableJson<RewardState>(STORE_KEY, current => {
        result = authorizePrivateRehearsalPayout(current, { claimId: req.body?.claimId })
        return result.ok ? result.state : current ?? { proofs: {} }
      })
      if (!result) return res.status(500).json({ ok: false, error: 'Could not authorize the rehearsal payout.' })
      return res.status(result.ok ? 200 : result.status).json(result.ok
        ? {
            ok: true,
            duplicate: result.duplicate,
            claimId: result.proof.claimId,
            authorizedAt: result.proof.rehearsalPayoutAuthorizedAt,
            message: 'This claim alone may complete the private payout rehearsal. Public payouts remain disabled.',
          }
        : result)
    }
    if (action === 'lease-payout') {
      if (!operatorAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
      const requestedClaimId = validClaimId(req.body?.claimId)
      const requestedProof = proofs.find(proof => proof.claimId === requestedClaimId)
      if (!campaign.payoutsEnabled && !isPrivateRehearsalPayout(requestedProof)) {
        return res.status(409).json({ ok: false, error: 'Reward payouts are not active.' })
      }
      let result: ReturnType<typeof leaseInstantRewardPayout> | undefined
      await mutateDurableJson<RewardState>(STORE_KEY, current => {
        result = leaseInstantRewardPayout(current, {
          workerId: req.body?.workerId,
          claimId: req.body?.claimId,
          leaseSeconds: req.body?.leaseSeconds,
        })
        return result.ok ? result.state : current ?? { proofs: {} }
      })
      if (!result) return res.status(500).json({ ok: false, error: 'Could not lease a reward payout.' })
      return res.status(result.ok ? 200 : result.status).json(result.ok
        ? { ok: true, lease: result.lease }
        : result)
    }
    if (action === 'confirm-payout') {
      if (!operatorAuthorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
      if (!campaign.payoutsEnabled) {
        return res.status(409).json({ ok: false, error: 'Reward payouts are not active.' })
      }
      const claimId = validClaimId(req.body?.claimId)
      const leaseId = clean(req.body?.leaseId)
      const payoutTransaction = transactionHash(req.body?.transactionHash)
      const candidate = proofs.find(proof => proof.claimId === claimId)
      const payout = payoutConfiguration()
      if (!campaign.payoutsEnabled && !isPrivateRehearsalPayout(candidate)) {
        return res.status(409).json({ ok: false, error: 'Reward payouts are not active.' })
      }
      if (
        candidate?.claimState === 'paid'
        && payoutTransaction
        && candidate.payoutTransactionHash === payoutTransaction
      ) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          claimId,
          transactionHash: payoutTransaction,
          blockNumber: candidate.payoutBlockNumber,
          state: 'paid',
        })
      }
      if (!candidate || candidate.claimState !== 'processing' || candidate.payoutLeaseId !== leaseId) {
        return res.status(409).json({ ok: false, error: 'Payout lease does not own this reward claim.' })
      }
      if (!payoutTransaction || !payout.address) {
        return res.status(400).json({ ok: false, error: 'A valid payout transaction is required.' })
      }
      try {
        const verified = await verifyOkxRewardPayout({
          transactionHash: payoutTransaction as `0x${string}`,
          payoutAddress: payout.address as `0x${string}`,
          recipient: candidate.payer as `0x${string}`,
          minimumConfirmations: payout.minimumConfirmations,
          notBefore: new Date(candidate.payoutLeaseStartedAt ?? ''),
        })
        let result: ReturnType<typeof markInstantRewardPaid> | undefined
        await mutateDurableJson<RewardState>(STORE_KEY, current => {
          result = markInstantRewardPaid(current, {
            claimId,
            leaseId,
            transactionHash: payoutTransaction,
            blockNumber: verified.blockNumber,
          })
          return result.ok ? result.state : current ?? { proofs: {} }
        })
        if (!result) return res.status(500).json({ ok: false, error: 'Could not confirm the reward payout.' })
        return res.status(result.ok ? 200 : result.status).json(result.ok
          ? {
              ok: true,
              duplicate: result.duplicate,
              claimId,
              transactionHash: payoutTransaction,
              blockNumber: verified.blockNumber,
              confirmations: verified.confirmations,
              state: 'paid',
            }
          : result)
      } catch (error) {
        return res.status(409).json({
          ok: false,
          error: error instanceof Error ? error.message : 'Payout transaction could not be verified.',
        })
      }
    }
    if (action === 'verify') {
      const result = verifyRewardReference(req.body?.receiptReference, state)
      return res.status(result.ok ? 200 : result.status).json(result)
    }
    if (action === 'claim') {
      if (campaign.status !== 'active') {
        return res.status(409).json({ ok: false, error: 'Claims are not active yet.' })
      }
      let reservation: ReturnType<typeof reserveInstantReward> | undefined
      await mutateDurableJson<RewardState>(STORE_KEY, current => {
        reservation = reserveInstantReward(req.body?.receiptReference, current)
        return reservation.ok ? reservation.state : current ?? { proofs: {} }
      })
      if (!reservation) return res.status(500).json({ ok: false, error: 'Could not reserve this reward.' })
      if (!reservation.ok) return res.status(reservation.status).json(reservation)
      return res.status(200).json({
        ok: true,
        claimId: reservation.claimId,
        proof: reservation.proof,
        message: 'Claim submitted for eligibility review. Any approved payout can only be sent to the verified payer address.',
      })
    }
    return res.status(400).json({ ok: false, error: 'Unsupported action.' })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

export { OKX_REWARD_INSTANT_ATOMIC }
