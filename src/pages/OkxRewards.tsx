import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, ExternalLink, Gift } from '../components/icons'
import {
  okxMarketplaceServices,
  okxMarketplaceServiceUrl,
  okxTradingAgentService,
  okxTradingTaskService,
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
  ['Execute and prove', 'A compatible EVM signer places the bounded order and PolyDesk returns public PnL evidence.'],
] as const

function dateLabel(value: string | null) {
  if (!value) return 'Dates to be announced'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function campaignDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return 'Dates to be announced'
  return `${dateLabel(startsAt)} to ${dateLabel(endsAt)}`
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <section className="border-b border-gray-200 pb-8 dark:border-white/10 sm:pb-10">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-950 text-white dark:bg-white dark:text-gray-950">
            <Gift className="h-4 w-4" />
          </span>
          <p className="text-xs font-semibold">PolyDesk on OKX.AI</p>
        </div>
        <div className="mt-6 grid gap-7 md:grid-cols-[1fr_15rem] md:items-end">
          <div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white sm:text-5xl">
              Give PolyDesk one trade. Keep control of the wallet.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400 sm:text-base">
              Send a public Polymarket signal and your limits. PolyDesk checks readiness, returns the one action needed, prepares a bounded BUY, and records public PnL evidence.
            </p>
          </div>
          <dl className="border-l-2 border-gray-950 pl-4 dark:border-white">
            <dt className="text-xs font-medium text-gray-400">Governed trading</dt>
            <dd className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">{okxTradingTaskService.priceUsdt} USDT / task</dd>
            <dd className="mt-1 text-sm font-semibold text-gray-700 dark:text-gray-200">or {okxTradingAgentService.subscriptionUsdtMonthly} USDT / month</dd>
            <dd className="mt-1 text-xs text-gray-500 dark:text-gray-400">{okxTradingAgentService.freeTrialDays}-day membership trial</dd>
          </dl>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a href={okxMarketplaceServiceUrl(okxTradingTaskService)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-950">
            Buy one trading task <ArrowRight className="h-4 w-4" />
          </a>
          <a href={okxMarketplaceServiceUrl(okxTradingAgentService)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-950">
            Start membership <ArrowRight className="h-4 w-4" />
          </a>
          <a href="#how-it-works" className="inline-flex h-11 items-center justify-center rounded-full border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 dark:border-white/15 dark:text-gray-200">
            How it works
          </a>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-gray-200 py-8 dark:border-white/10">
        <div className="grid gap-6 sm:grid-cols-[13rem_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">One mission</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Four steps, one result</h2>
          </div>
          <ol className="divide-y divide-gray-200 border-y border-gray-200 dark:divide-white/10 dark:border-white/10">
            {missionSteps.map(([title, body], index) => (
              <li key={title} className="grid gap-1 py-3 sm:grid-cols-[2rem_9rem_1fr] sm:items-baseline">
                <span className="text-xs font-semibold text-gray-400">0{index + 1}</span>
                <strong className="text-sm font-semibold text-gray-950 dark:text-white">{title}</strong>
                <span className="text-xs leading-5 text-gray-500 dark:text-gray-400">{body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-gray-200 py-8 dark:border-white/10">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Direct tools</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Need one result instead?</h2>
          </div>
          <p className="max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">Buy one API call without starting a full trading mission.</p>
        </div>
        <div className="mt-5 divide-y divide-gray-200 border-y border-gray-200 dark:divide-white/10 dark:border-white/10">
          {okxMarketplaceServices.map(service => (
            <a key={service.serviceId} href={okxMarketplaceServiceUrl(service)} target="_blank" rel="noreferrer" className="grid gap-1 py-3 transition hover:opacity-65 sm:grid-cols-[1fr_7rem_1.5rem] sm:items-center">
              <span>
                <span className="block text-sm font-semibold text-gray-950 dark:text-white">{service.name}</span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">{service.summary}</span>
              </span>
              <span className="text-xs font-semibold text-gray-500 sm:text-right dark:text-gray-400">{directServicePrices[service.serviceId]} / call</span>
              <ExternalLink className="hidden h-4 w-4 justify-self-end text-gray-400 sm:block" />
            </a>
          ))}
        </div>
      </section>

      <section className="py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              <h2 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">Verified-use rewards</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
              PolyDesk has reserved 50 USDT0: 1 USDT0 for each of the first 50 unique wallets with a verified, delivered direct API call on X Layer. A2A rewards open only after the full trade and PnL proof is verified.
            </p>
            <p className="mt-3 text-xs font-medium text-gray-400">
              {paidRewards} of {rewardLimit} paid · {campaignDateRange(campaignInfo?.startsAt ?? null, campaignInfo?.endsAt ?? null)}
            </p>
          </div>
          <span className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${directRewardsActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'}`}>
            {directRewardsActive ? 'Claims open' : 'Opening soon'}
          </span>
        </div>

        {directRewardsActive && (
          <div className="mt-6 border-t border-gray-200 pt-6 dark:border-white/10">
            <label className="text-sm font-semibold text-gray-800 dark:text-gray-100" htmlFor="receipt-reference">X Layer payment transaction</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input id="receipt-reference" value={receiptReference} onChange={event => setReceiptReference(event.target.value)} placeholder="0x..." className="h-11 min-w-0 flex-1 rounded-xl border border-gray-300 bg-transparent px-4 font-mono text-xs text-gray-900 outline-none focus:border-gray-500 dark:border-white/15 dark:text-white" />
              <button type="button" disabled={checking || !receiptReference.trim()} onClick={() => void verifyReceipt()} className="h-11 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950">
                {checking ? 'Verifying…' : 'Verify call'}
              </button>
            </div>
            {verification && (
              <div className={`mt-3 flex gap-3 border-l-2 pl-3 text-sm ${verification.ok ? 'border-emerald-500 text-emerald-800 dark:text-emerald-300' : 'border-red-500 text-red-700 dark:text-red-300'}`}>
                {verification.ok && verification.proof ? <><CheckCircle2 className="h-5 w-5 shrink-0" /><span><strong>{verification.proof.serviceName}</strong> · {verification.message ?? verification.proof.reward ?? `Status: ${verification.proof.claimState}`}</span></> : verification.error}
              </div>
            )}
            {verification?.ok && verification.proof?.reward && (
              <button type="button" disabled={claiming} onClick={() => void claimReward()} className="mt-3 text-sm font-semibold text-emerald-700 disabled:opacity-50 dark:text-emerald-300">
                {claiming ? 'Submitting…' : 'Submit reward claim'}
              </button>
            )}
          </div>
        )}
      </section>

      <p className="border-t border-gray-200 pt-5 text-xs leading-5 text-gray-400 dark:border-white/10">
        PolyDesk never requests wallet secrets. The buyer’s written limits and Agentic Wallet authorization remain in control. Rewards are funded by PolyDesk, not OKX.
      </p>
    </main>
  )
}
