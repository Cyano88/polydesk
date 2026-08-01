import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Gift, Trophy } from 'lucide-react'
import { okxMarketplaceServices, okxMarketplaceServiceUrl } from '../lib/okxMarketplaceServices'

type CampaignResponse = {
  ok: boolean
  campaign: {
    status: 'preview' | 'recording' | 'active'
    approved: boolean
    startsAt: string | null
    endsAt: string | null
    instantPoolUsdt: number
    instantRewardUsdt: number
    instantRewardLimit: number
    leaderboardEnabled: boolean
    leaderboardPoolUsdt: number
    prizesUsdt: readonly number[]
    paidInstantClaims: number
    reservedInstantClaims: number
    token: string
    network: string
  }
  leaderboard: Array<{
    rank: number
    wallet: string
    points: number
    servicesUsed: number
    prizeUsdt: number | null
  }>
}

type Verification = {
  ok: boolean
  error?: string
  proof?: {
    serviceName: string
    payer: string
    deliveredAt: string
    claimState: string
    reward: string | null
  }
}

export default function OkxRewards() {
  const [campaign, setCampaign] = useState<CampaignResponse | null>(null)
  const [receiptReference, setReceiptReference] = useState('')
  const [verification, setVerification] = useState<Verification | null>(null)
  const [checking, setChecking] = useState(false)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    fetch('/api/okx-rewards')
      .then(response => response.json())
      .then(body => setCampaign(body))
      .catch(() => setCampaign(null))
  }, [])

  async function verifyReceipt() {
    setChecking(true)
    setVerification(null)
    try {
      const response = await fetch('/api/okx-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', receiptReference }),
      })
      setVerification(await response.json())
    } catch {
      setVerification({ ok: false, error: 'Receipt verification is temporarily unavailable.' })
    } finally {
      setChecking(false)
    }
  }

  async function claimReward() {
    setClaiming(true)
    try {
      const response = await fetch('/api/okx-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', receiptReference }),
      })
      setVerification(await response.json())
    } catch {
      setVerification({ ok: false, error: 'Reward reservation is temporarily unavailable.' })
    } finally {
      setClaiming(false)
    }
  }

  const active = campaign?.campaign.status === 'active'
  const approved = campaign?.campaign.approved === true
  const leaderboardEnabled = campaign?.campaign.leaderboardEnabled === true

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white dark:border-white/10 dark:bg-[#18181b]">
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-700 dark:bg-white/[0.07] dark:text-gray-200">
              <Gift className="h-3.5 w-3.5" />
              {active ? 'Verified-use pilot is live' : approved ? 'Approved pilot — launch pending' : 'Campaign preview'}
            </div>
            <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white sm:text-5xl">
              Use PolyDesk on OKX.AI. Earn from verified calls.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-gray-500 dark:text-gray-400">
              Complete a paid PolyDesk service call on OKX.AI, then paste its X Layer transaction reference here. PolyDesk verifies the payer and successful delivery without connecting your wallet.
            </p>
          </div>

          <div className={`grid gap-3 self-start ${leaderboardEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="rounded-2xl bg-gray-950 p-5 text-white dark:bg-white dark:text-gray-950">
              <p className="text-xs font-semibold opacity-60">Instant pool</p>
              <p className="mt-2 text-2xl font-semibold">50 USDT0</p>
              <p className="mt-1 text-xs opacity-60">1 each for 50 users</p>
            </div>
            {leaderboardEnabled && (
              <div className="rounded-2xl bg-gray-100 p-5 text-gray-950 dark:bg-white/[0.07] dark:text-white">
                <p className="text-xs font-semibold text-gray-500">Leaderboard</p>
                <p className="mt-2 text-2xl font-semibold">500 USDT0</p>
                <p className="mt-1 text-xs text-gray-500">Top four users</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-[24px] border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b]">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">1. Complete one call</p>
          <div className="mt-4 space-y-2">
            {okxMarketplaceServices.map(service => (
              <a
                key={service.serviceId}
                href={okxMarketplaceServiceUrl(service)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.05]"
              >
                <span>
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">{service.name}</span>
                  <span className="mt-0.5 block text-xs text-gray-400">Service #{service.serviceId}</span>
                </span>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b]">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">2. Verify your receipt</p>
          <label className="mt-4 block text-sm font-semibold text-gray-800 dark:text-gray-100" htmlFor="receipt-reference">
            X Layer transaction reference
          </label>
          <input
            id="receipt-reference"
            value={receiptReference}
            onChange={event => setReceiptReference(event.target.value)}
            placeholder="0x..."
            className="mt-2 h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 font-mono text-xs text-gray-900 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-[#111113] dark:text-white"
          />
          <button
            type="button"
            disabled={checking || !receiptReference.trim()}
            onClick={() => void verifyReceipt()}
            className="mt-3 h-12 w-full rounded-2xl bg-gray-950 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950"
          >
            {checking ? 'Verifying...' : 'Verify receipt'}
          </button>

          {verification && (
            <div className={`mt-4 rounded-2xl p-4 text-sm ${verification.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-200'}`}>
              {verification.ok && verification.proof ? (
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">{verification.proof.serviceName}</p>
                    <p className="mt-1 text-xs opacity-75">Payer {verification.proof.payer}</p>
                    <p className="mt-2 font-semibold">{verification.proof.reward ?? 'Claim already submitted'}</p>
                  </div>
                </div>
              ) : verification.error}
            </div>
          )}

          {active && verification?.ok && verification.proof?.reward && (
            <button
              type="button"
              disabled={claiming}
              onClick={() => void claimReward()}
              className="mt-3 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {claiming ? 'Submitting claim...' : 'Submit claim for review'}
            </button>
          )}

          {!active && (
            <p className="mt-4 text-xs leading-5 text-gray-400">
              {approved
                ? 'The pilot is approved. Claims remain disabled while the reward pool is funded and the private payout rehearsal is completed.'
                : 'Verification preview only. Claims remain disabled until campaign approval and the public start time are confirmed.'}
            </p>
          )}
        </div>
      </section>

      {leaderboardEnabled && <section className="mt-6 rounded-[24px] border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b]">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Leaderboard rules</h2>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-gray-500 sm:grid-cols-3 dark:text-gray-400">
          <p className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">One point per service, per wallet, per day.</p>
          <p className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">Use at least two different services to qualify.</p>
          <p className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">Failed, refunded, test and duplicate calls do not count.</p>
        </div>
      </section>}

      <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-gray-400">
        One claim per paying wallet. Claims are reviewed before payout. Coordinated, operator, test, refunded, duplicate or undelivered activity is not eligible.
      </p>
    </main>
  )
}
