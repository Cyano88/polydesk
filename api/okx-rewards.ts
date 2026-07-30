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
  return new Set(
    clean(process.env.POLYDESK_OKX_REWARD_EXCLUDED_WALLETS)
      .split(',')
      .map(value => payerAddress(value))
      .filter(Boolean),
  )
}

export function okxRewardCampaignStatus(now = new Date()) {
  const approved = envFlag('POLYDESK_OKX_REWARDS_APPROVED')
  const recording = envFlag('POLYDESK_OKX_REWARDS_RECORDING')
  const startsAt = campaignDate('POLYDESK_OKX_REWARDS_STARTS_AT')
  const endsAt = campaignDate('POLYDESK_OKX_REWARDS_ENDS_AT')
  const inWindow = Boolean(startsAt && endsAt && now >= startsAt! && now <= endsAt!)
  return {
    status: approved && recording && inWindow ? 'active' as const : 'preview' as const,
    approved,
    recording,
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
  if (campaign.status !== 'active') return { recorded: false, reason: 'campaign_inactive' as const }

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
    },
  }
}

export default async function okxRewardsHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const campaign = okxRewardCampaignStatus()
  const state = await readDurableJson<RewardState>(STORE_KEY)
  const proofs = Object.values(state?.proofs ?? {})

  if (req.method === 'GET') {
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
      },
      leaderboard: leaderboard(proofs),
    })
  }

  if (req.method === 'POST') {
    if (clean(req.body?.action) !== 'verify') {
      return res.status(400).json({ ok: false, error: 'Only verification is available before campaign approval.' })
    }
    const result = verifyRewardReference(req.body?.receiptReference, state)
    return res.status(result.ok ? 200 : result.status).json(result)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

export const OKX_REWARD_INSTANT_ATOMIC = INSTANT_REWARD_ATOMIC
