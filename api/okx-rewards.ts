import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { mutateDurableJson, readDurableJson } from './render-durable-store.js'

const STORE_KEY = 'polydesk:okx-rewards:v1'
const INSTANT_REWARD_ATOMIC = 1_000_000
const INSTANT_REWARD_LIMIT = 50
const LEADERBOARD_PRIZES = [200, 150, 100, 50] as const

const SERVICE_BY_PATH = {
  '/api/a2mcp/okx/polymarket-lp-scout': { id: 33342, name: 'Polymarket LP Scout' },
  '/api/a2mcp/worldcup-live-scores': { id: 33343, name: 'Football Match Live Data' },
  '/api/a2mcp/polymarket-funding-link': { id: 33344, name: 'Verified Polymarket Funding' },
  '/api/a2mcp/polymarket-portfolio-watch': { id: 33345, name: 'Governed Polymarket Trader' },
  '/api/a2mcp/polymarket-agent-flow': { id: 33345, name: 'Governed Polymarket Trader' },
  '/api/a2mcp/worldcup-market-news': { id: 33346, name: 'Football News Brief' },
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
  claimState: 'unclaimed' | 'reserved' | 'paid'
  claimId?: string
  reservedAt?: string
  payoutTransactionHash?: string
}

type RewardState = {
  proofs: Record<string, RewardProof>
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
  const startsAt = campaignDate('POLYDESK_OKX_REWARDS_STARTS_AT')
  const endsAt = campaignDate('POLYDESK_OKX_REWARDS_ENDS_AT')
  const inWindow = Boolean(startsAt && endsAt && now >= startsAt! && now <= endsAt!)
  const campaignRunning = approved && recording && inWindow
  return {
    status: campaignRunning
      ? claimsEnabled ? 'active' as const : 'recording' as const
      : 'preview' as const,
    approved,
    recording,
    claimsEnabled,
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

  const service = SERVICE_BY_PATH[input.servicePath as EligibleServicePath]
  const payer = payerAddress(input.payer)
  const transaction = transactionHash(input.transaction)
  if (!service || !payer || !transaction) return { recorded: false, reason: 'invalid_proof' as const }
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
          amountAtomic: clean(input.amountAtomic),
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
      reward: proof.claimState === 'unclaimed' ? '1 USDT0' : null,
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
  if (proof.claimState !== 'unclaimed') {
    return {
      ok: false as const,
      status: 409,
      error: proof.claimState === 'paid' ? 'This payer already received the instant reward.' : 'This reward is already reserved for payout.',
    }
  }
  const payerAlreadyClaimed = Object.values(state.proofs).some(item =>
    item.payer === proof.payer && item.claimState !== 'unclaimed')
  if (payerAlreadyClaimed) {
    return { ok: false as const, status: 409, error: 'This payer has already used the one-time instant reward.' }
  }
  const reserved = Object.values(state.proofs).filter(item => item.claimState !== 'unclaimed').length
  if (reserved >= INSTANT_REWARD_LIMIT) {
    return { ok: false as const, status: 410, error: 'The 50-user instant reward pool is fully reserved.' }
  }

  const claimId = `okxr_${crypto.createHash('sha256').update(`${receiptHash}:${proof.payer}`).digest('hex').slice(0, 24)}`
  const nextProof: RewardProof = {
    ...proof,
    claimState: 'reserved',
    claimId,
    reservedAt: now.toISOString(),
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
      reward: '1 USDT0',
      claimState: 'reserved' as const,
    },
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
        payouts: proofs
          .filter(proof => proof.claimState === 'reserved')
          .map(proof => ({
            claimId: proof.claimId,
            payer: proof.payer,
            amountAtomic: String(INSTANT_REWARD_ATOMIC),
            asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
            network: 'eip155:196',
            sourceTransactionHash: proof.transactionHash,
            serviceId: proof.serviceId,
            reservedAt: proof.reservedAt,
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
        leaderboardPoolUsdt: 500,
        prizesUsdt: LEADERBOARD_PRIZES,
        token: 'USDT0',
        network: 'X Layer',
        paidInstantClaims: proofs.filter(proof => proof.claimState === 'paid').length,
        reservedInstantClaims: proofs.filter(proof => proof.claimState === 'reserved').length,
      },
      leaderboard: leaderboard(proofs),
    })
  }

  if (req.method === 'POST') {
    const action = clean(req.body?.action)
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
        message: 'Reward reserved. The payout can only be sent to the verified payer address.',
      })
    }
    return res.status(400).json({ ok: false, error: 'Unsupported action.' })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

export const OKX_REWARD_INSTANT_ATOMIC = INSTANT_REWARD_ATOMIC
