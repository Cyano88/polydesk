import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, ExternalLink, Gift, LineChart, WalletCards } from 'lucide-react'
import {
  okxMarketplaceServices,
  okxMarketplaceServiceUrl,
  okxTradingAgentService,
} from '../lib/okxMarketplaceServices'

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
    submittedInstantClaims: number
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
  message?: string
  claimId?: string
  proof?: {
    serviceName: string
    payer: string
    deliveredAt?: string
    claimState: string
    reward: string | null
  }
}

const directServicePrices: Record<number, string> = {
  33342: '0.3 USDT',
  33343: '0.1 USDT',
  33344: '0.1 USDT',
  33345: '0.1 USDT',
  33346: '0.1 USDT',
}

const missionSteps = [
  ['Choose a signal', 'Provide a watched Polymarket wallet or one exact public BUY.'],
  ['Set the limits', 'Write the maximum spend, maximum price, and expiry.'],
  ['Resolve readiness', 'PolyDesk verifies the account and returns funding or collateral approval only when required.'],
  ['Execute and prove', 'The buyer’s Agentic Wallet executes the bounded order and PolyDesk returns public PnL evidence.'],
] as const

function dateLabel(value: string | null) {
  if (!value) return 'Dates to be announced'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
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
      setVerification({ ok: false, error: 'Reward submission is temporarily unavailable.' })
    } finally {
      setClaiming(false)
    }
  }

  const campaignInfo = campaign?.campaign
  const directRewardsActive = campaignInfo?.status === 'active'
  const paidRewards = campaignInfo?.paidInstantClaims ?? 0
  const rewardLimit = campaignInfo?.instantRewardLimit ?? 50

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white dark:border-white/10 dark:bg-[#18181b]">
        <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">PolyDesk on OKX.AI</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-gray-950 dark:text-white sm:text-6xl">
              One agent. One bounded Polymarket trade.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-gray-500 dark:text-gray-400 sm:text-base">
              Start from a public signal. PolyDesk checks account readiness, applies your spend and price limits, prepares one BUY for execution through your Agentic Wallet, and returns public PnL evidence.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={okxMarketplaceServiceUrl(okxTradingAgentService)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-950"
              >
                Start a trading mission <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#mission-flow"
                className="inline-flex h-12 items-center justify-center rounded-full border border-gray-200 px-6 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.05]"
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="rounded-[24px] bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-55">Trading Agent</p>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{okxTradingAgentService.subscriptionUsdtMonthly} USDT / month</p>
            <p className="mt-1 text-sm opacity-65">{okxTradingAgentService.freeTrialDays}-day free trial</p>
            <div className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm dark:border-black/10">
              {['Buyer-controlled execution', 'Funding and approval next actions', 'Public, recomputable PnL receipt'].map(item => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="mission-flow" className="mt-6 rounded-[24px] border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">One clear mission</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">From public signal to verifiable outcome</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {missionSteps.map(([title, body], index) => (
            <article key={title} className="rounded-2xl bg-gray-50 p-5 dark:bg-white/[0.04]">
              <span className="text-xs font-semibold text-gray-400">0{index + 1}</span>
              <h3 className="mt-4 text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-[24px] border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Built-in tools</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">Use the complete agent or call one tool</h2>
          </div>
          <p className="max-w-md text-xs leading-5 text-gray-500 dark:text-gray-400">The Trading Agent coordinates these services. Builders can still buy each API directly when they need only one result.</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {okxMarketplaceServices.map(service => (
            <a
              key={service.serviceId}
              href={okxMarketplaceServiceUrl(service)}
              target="_blank"
              rel="noreferrer"
              className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 p-4 transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]"
            >
              <span>
                <span className="block text-sm font-semibold text-gray-950 dark:text-white">{service.name}</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{service.summary}</span>
                <span className="mt-3 block text-[11px] font-semibold text-gray-400">{directServicePrices[service.serviceId]} / call</span>
              </span>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            </a>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_.9fr]">
        <div className="rounded-[24px] border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Gift className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Verified tester program</p>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">Direct API rewards remain separate</h2>
          <p className="mt-3 text-sm leading-7 text-gray-500 dark:text-gray-400">
            The independently funded 50-USDT0 pilot verifies delivered pay-per-call services and pays only the recovered X Layer payer. A2A subscription missions will join only after their accepted-job and PnL proofs are recorded end to end.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
              <p className="text-xs text-gray-400">Rewards paid</p>
              <p className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{paidRewards} / {rewardLimit}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
              <p className="text-xs text-gray-400">Campaign window</p>
              <p className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{dateLabel(campaignInfo?.startsAt ?? null)} – {dateLabel(campaignInfo?.endsAt ?? null)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-gray-400">
            {directRewardsActive
              ? 'Public direct-API claims are open.'
              : 'Proof recording is active; public claims remain closed until the launch gate is enabled.'}
          </p>
        </div>

        <div className="rounded-[24px] border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
          {directRewardsActive ? (
            <>
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <WalletCards className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em]">Claim a direct API reward</p>
              </div>
              <label className="mt-5 block text-sm font-semibold text-gray-800 dark:text-gray-100" htmlFor="receipt-reference">
                X Layer payment transaction
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
                className="mt-3 h-12 w-full rounded-full bg-gray-950 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950"
              >
                {checking ? 'Verifying…' : 'Verify delivered call'}
              </button>

              {verification && (
                <div className={`mt-4 rounded-2xl p-4 text-sm ${verification.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-200'}`}>
                  {verification.ok && verification.proof ? (
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <p className="font-semibold">{verification.proof.serviceName}</p>
                        <p className="mt-1 text-xs opacity-75">Payer {verification.proof.payer}</p>
                        <p className="mt-2 text-xs font-semibold">{verification.message ?? verification.proof.reward ?? `Status: ${verification.proof.claimState}`}</p>
                      </div>
                    </div>
                  ) : verification.error}
                </div>
              )}

              {verification?.ok && verification.proof?.reward && (
                <button
                  type="button"
                  disabled={claiming}
                  onClick={() => void claimReward()}
                  className="mt-3 h-12 w-full rounded-full bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {claiming ? 'Submitting…' : 'Submit for review'}
                </button>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-64 flex-col justify-between rounded-2xl bg-gray-50 p-5 dark:bg-white/[0.04]">
              <div>
                <LineChart className="h-5 w-5 text-gray-500" />
                <h2 className="mt-5 text-xl font-semibold text-gray-950 dark:text-white">A2A proof comes first</h2>
                <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">The public tester claim opens after one approved subscription mission completes the full accepted-task, trade, and PnL-receipt flow.</p>
              </div>
              <a
                href={okxMarketplaceServiceUrl(okxTradingAgentService)}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white"
              >
                View the Trading Agent <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </section>

      <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-gray-400">
        PolyDesk never requests wallet secrets. Trading remains subject to the buyer’s written limits and Agentic Wallet authorization. Rewards are independently funded by PolyDesk, not OKX.
      </p>
    </main>
  )
}
