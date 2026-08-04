import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Download, ExternalLink, Loader2, Radar, Share2 } from '../components/icons'
import { Link, useParams } from 'react-router-dom'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'
import { downloadLpOpportunityPng, renderLpOpportunityPng } from '../lib/lpOpportunityShareImage'

type Opportunity = {
  title?: string
  marketSlug?: string
  marketUrl?: string
  image?: string
  description?: string
  dailyReward?: number
  liveSpread?: number
  depthAtTwoCents?: number
  suggestedYesBid?: number
  suggestedNoBid?: number
  tickSize?: string
  maxSpread?: number
  minSize?: number
  estimatedRewardCapitalUsdc?: number
  daysToResolve?: number
  lpExecutionRisk?: string
  scoutReason?: string
}

type OpportunityResponse = {
  ok?: boolean
  updatedAt?: string
  opportunity?: Opportunity
  error?: string
}

function number(value: unknown, maximumFractionDigits = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { maximumFractionDigits }) : 'N/A'
}

function quote(value: unknown, tickSize = '0.01') {
  const parsed = Number(value)
  const digits = tickSize.split('.')[1]?.length ?? 2
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : 'N/A'
}

function riskLabel(value: string | undefined) {
  if (value === 'low') return 'Steady setup'
  if (value === 'medium') return 'Watch the price'
  return 'Risky setup'
}

export default function Opportunity() {
  const { slug = '' } = useParams()
  const [data, setData] = useState<OpportunityResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [shareNotice, setShareNotice] = useState('')
  const opportunity = data?.opportunity

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/pulse/opportunity/${encodeURIComponent(slug)}`)
      .then(async response => {
        const body = await response.json().catch(() => ({})) as OpportunityResponse
        if (!cancelled) setData(response.ok ? body : { ...body, ok: false })
      })
      .catch(() => {
        if (!cancelled) setData({ ok: false, error: 'This market reward opportunity could not be loaded.' })
      })
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (!opportunity?.title) return
    document.title = `${opportunity.title} · PolyDesk market rewards`
    const description = 'See the price gap, suggested prices and daily market reward pool in plain language.'
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.content = description
  }, [opportunity?.scoutReason, opportunity?.title])

  const makerPlan = useMemo(() => {
    if (!opportunity) return []
    return [
      'Choose Buy now or Earn market rewards.',
      'Choose YES or NO.',
      'Enter how much USDC you want to use.',
      'Review the action in plain language, then sign with your wallet.',
    ]
  }, [opportunity])

  async function buildShareImage() {
    if (!opportunity?.title) throw new Error('This opportunity is unavailable.')
    return renderLpOpportunityPng({
      slug,
      title: opportunity.title,
      dailyReward: opportunity.dailyReward,
      liveSpread: opportunity.liveSpread,
      depthAtTwoCents: opportunity.depthAtTwoCents,
      minSize: opportunity.minSize,
      estimatedRewardCapitalUsdc: opportunity.estimatedRewardCapitalUsdc,
      daysToResolve: opportunity.daysToResolve,
      suggestedYesBid: opportunity.suggestedYesBid,
      suggestedNoBid: opportunity.suggestedNoBid,
      tickSize: opportunity.tickSize,
      lpExecutionRisk: opportunity.lpExecutionRisk,
      updatedAt: data?.updatedAt,
    })
  }

  async function share() {
    const url = window.location.href
    const title = opportunity?.title || 'PolyDesk market reward opportunity'
    const text = opportunity?.dailyReward == null
      ? 'View this market reward opportunity on PolyDesk.'
      : `Daily market rewards: ${number(opportunity.dailyReward)} USDC shared by qualifying orders.`
    setImageBusy(true)
    setShareNotice('')
    try {
      const blob = await buildShareImage()
      const file = new File([blob], `polydesk-lp-${slug}.png`, { type: 'image/png' })
      const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
      if (navigator.share && shareNavigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text, url, files: [file] })
        setShareNotice('LP image shared.')
        return
      }
      downloadLpOpportunityPng(blob, slug)
      if (navigator.clipboard) await navigator.clipboard.writeText(url)
      setCopied(true)
      setShareNotice('Image downloaded. Link copied.')
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareNotice(error instanceof Error ? error.message : 'The LP image could not be shared.')
    } finally {
      setImageBusy(false)
    }
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#2f5bff]">
        <PolyDeskLoadingState fullScreen label="Opening market reward opportunity" />
      </main>
    )
  }

  if (!data.ok || !opportunity) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#2f5bff] px-5">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 text-center text-gray-950">
          <Radar className="mx-auto h-7 w-7 text-blue-600" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Opportunity unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">{data.error || 'The live market no longer meets the reward filter.'}</p>
          <Link to="/polydesk?service=pulse" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
            Open Pulse <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    )
  }

  const updated = data.updatedAt
    ? new Date(data.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Live'
  const canNativeShare = typeof (navigator as Navigator & { share?: unknown }).share === 'function'

  return (
    <main className="min-h-screen bg-[#2f5bff] text-gray-950">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5 text-white sm:px-6">
        <Link to="/polydesk?service=pulse" className="inline-flex items-center gap-2 text-sm font-bold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg !bg-white text-blue-600"><Radar className="h-4 w-4" /></span>
          PolyDesk
        </Link>
        <button type="button" onClick={() => void share()} disabled={imageBusy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/35 !bg-white px-3 text-xs font-semibold text-blue-700 disabled:opacity-60">
          {imageBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5" /> : canNativeShare ? <Share2 className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
          {imageBusy ? 'Creating' : copied ? 'Downloaded' : 'Share image'}
        </button>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-6">
        <article className="overflow-hidden rounded-[22px] !bg-white shadow-[0_24px_70px_rgba(14,30,90,0.24)]">
          <section className="p-5 sm:p-7">
            <div className="flex items-start gap-4">
              {opportunity.image ? (
                <img src={opportunity.image} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-gray-200 object-cover" />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Radar className="h-6 w-6" /></span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">PolyDesk Pulse</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <i className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live book
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold leading-[1.12] tracking-[-0.035em] sm:text-3xl">{opportunity.title}</h1>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-4">
              {[
                ['Price gap', Number.isFinite(Number(opportunity.liveSpread)) ? `${(Number(opportunity.liveSpread) * 100).toFixed(1)}c` : 'N/A'],
                ['Shares near price', number(opportunity.depthAtTwoCents)],
                ['Est. reward setup', opportunity.estimatedRewardCapitalUsdc == null ? 'N/A' : `≈${number(opportunity.estimatedRewardCapitalUsdc, 2)} USDC`],
                ['Ends in', opportunity.daysToResolve == null ? 'N/A' : `${number(opportunity.daysToResolve)} days`],
              ].map(([label, value]) => (
                <div key={label} className="!bg-white px-3 py-3">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-1 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {opportunity.estimatedRewardCapitalUsdc != null && (
              <p className="mt-3 text-[10px] leading-4 text-gray-500">
                Based on {number(opportunity.minSize, 2)} reward-eligible shares across both suggested quotes. Qualifying does not guarantee a payout; Polymarket does not pay earned rewards below 1 USDC.
              </p>
            )}

          </section>

          <section className="relative border-y border-dashed border-gray-200 px-5 py-5 sm:px-7">
            <span className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[#2f5bff]" aria-hidden="true" />
            <span className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[#2f5bff]" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Suggested prices</p>
              <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">{riskLabel(opportunity.lpExecutionRisk)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="border-l-4 border-blue-600 bg-blue-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">YES</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-blue-700">{quote(opportunity.suggestedYesBid, opportunity.tickSize)}</p>
              </div>
              <div className="border-l-4 border-red-600 bg-red-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">NO</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-red-700">{quote(opportunity.suggestedNoBid, opportunity.tickSize)}</p>
              </div>
            </div>
          </section>

          <section className="p-5 sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">What to do</p>
            <div className="mt-3 space-y-3">
              {makerPlan.map((item, index) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{index + 1}</span>
                  <p className="pt-0.5 text-sm leading-5 text-gray-700">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-end justify-between gap-4 border-t border-gray-200 pt-5">
              <div>
                <p className="text-sm font-semibold text-gray-700">Daily market rewards</p>
                <p className="mt-1 text-4xl font-semibold tracking-[-0.05em] text-blue-600">
                  {number(opportunity.dailyReward)} <span className="text-lg tracking-tight">USDC/day</span>
                </p>
              </div>
            </div>

            <Link to={`/polydesk?service=pulse&opportunity=${encodeURIComponent(slug)}`} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white">
              Open trading choices <ArrowRight className="h-4 w-4" />
            </Link>
            {shareNotice && <p className="mt-2 text-center text-[10px] font-medium text-gray-500">{shareNotice}</p>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
              <span>Updated {updated}</span>
              {opportunity.marketUrl && (
                <a href={opportunity.marketUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-gray-500">
                  Open on Polymarket <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-gray-400">This reward pool is shared by all qualifying orders. It is not a promise of personal earnings.</p>
          </section>
        </article>

        <p className="mt-5 text-center text-xs font-medium text-white/75">PolyDesk · Liquidity intelligence for Polymarket</p>
      </div>
    </main>
  )
}
