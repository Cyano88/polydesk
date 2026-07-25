import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Download, ExternalLink, FileText, Loader2, Share2, ShieldCheck, TriangleAlert } from 'lucide-react'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'
import { PolymarketLimitOrderTicket } from '../components/PolymarketLimitOrderTicket'
import { downloadLpOpportunityPng, renderLpOpportunityPng } from '../lib/lpOpportunityShareImage'

type ReportResponse = {
  ok?: boolean
  error?: string
  report?: {
    id: string
    title: string
    createdAt: number
    status: 'verified' | 'finalizing' | 'needs_retry' | string
    summary?: string
    signals?: string[]
    recommendedActions?: string[]
    riskFlags?: string[]
    safetyBoundaries?: string[]
    marketLinks?: Array<{
      label: string
      url: string
      rewardDaily?: unknown
      estimatedRewardCapitalUsdc?: unknown
      rewardMinShares?: unknown
      spread?: unknown
      depth?: unknown
      daysLeft?: unknown
      yesQuote?: unknown
      noQuote?: unknown
      contextSignals?: Array<{
        kind: string
        label: string
        source: string
        title: string
      }>
    }>
    proof?: Record<string, unknown> & { url?: string }
    archive?: {
      status?: 'archiving' | 'archived' | 'failed' | string
      url?: string
      lastError?: string
      lastStage?: string
      retryable?: boolean
      attempts?: number
      lastAttemptAt?: number
      proof?: Record<string, unknown>
    }
    x402?: {
      id: string
      amount?: string
      asset?: string
      receiptUrl?: string
      proof?: Record<string, unknown>
    }
  }
}

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function ageText(value?: number) {
  if (!value) return 'Saved report'
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60000))
  if (minutes < 1) return 'Saved just now'
  if (minutes < 60) return `Saved ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `Saved ${hours} hr${hours === 1 ? '' : 's'} ago`
}

function shortHash(value: unknown) {
  const text = clean(value)
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-6)}` : text
}

function metricLabel(value: unknown, suffix: string) {
  const text = clean(value)
  return text ? `${text} ${suffix}` : ''
}

function numericMetric(value: unknown) {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function reportText(report: NonNullable<ReportResponse['report']>) {
  return [
    'PolyDesk LP Scout Report',
    '',
    clean(report.summary),
    '',
    report.recommendedActions?.length ? `Action checklist:\n${report.recommendedActions.map((item, index) => `${index + 1}. ${clean(item)}`).join('\n')}` : '',
    report.riskFlags?.length ? `Risk flags:\n${report.riskFlags.map((item, index) => `${index + 1}. ${clean(item)}`).join('\n')}` : '',
    report.proof?.url ? `ZeroScout proof: ${report.proof.url}` : '',
    report.archive?.url ? `0G archive: ${report.archive.url}` : '',
    !report.proof?.url && report.archive?.status === 'failed' ? `0G archive status: ${report.archive.lastStage || 'failed'} - ${report.archive.lastError || 'needs retry'}` : '',
    report.x402?.receiptUrl ? `x402 receipt: ${window.location.origin}${report.x402.receiptUrl}` : '',
    `Report URL: ${window.location.href}`,
  ].filter(Boolean).join('\n\n')
}

export default function LPScoutReport() {
  const { activityId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [data, setData] = useState<ReportResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareNotice, setShareNotice] = useState('')
  const [orderMarketIndex, setOrderMarketIndex] = useState<number | null>(null)
  const [showAllMarkets, setShowAllMarkets] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setBusy(true)
      try {
        const receipt = searchParams.get('receipt') || ''
        const url = `/api/lp-scout-report?id=${encodeURIComponent(activityId)}${receipt ? `&receipt=${encodeURIComponent(receipt)}` : ''}`
        const res = await fetch(url)
        const body = await res.json() as ReportResponse
        if (!cancelled) setData(body)
      } catch (error) {
        if (!cancelled) setData({ ok: false, error: error instanceof Error ? error.message : 'Could not load LP Scout report.' })
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [activityId, searchParams])

  const report = data?.report
  const status = clean(report?.status)
  const verified = status === 'verified'
  const proofUrl = clean(report?.proof?.url)
  const archiveUrl = clean(report?.archive?.url)
  const archiveStatus = clean(report?.archive?.status)
  const archiveFailed = archiveStatus === 'failed' && !proofUrl
  const displayProofUrl = proofUrl || archiveUrl
  const copyText = useMemo(() => report ? reportText(report) : '', [report])

  function downloadTxt() {
    if (!report) return
    const blob = new Blob([copyText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `polydesk-lp-scout-${report.id}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function shareInsight() {
    const market = report?.marketLinks?.[0]
    if (!verified) {
      setShareNotice('Sharing unlocks after ZeroScout verification.')
      return
    }
    if (!report || !market) {
      setShareNotice('This report does not contain a market to share.')
      return
    }
    setShareBusy(true)
    setShareNotice('')
    try {
      const safeLandingUrl = `${window.location.origin}/?service=lp-scout`
      const blob = await renderLpOpportunityPng({
        variant: 'report',
        slug: report.id,
        title: clean(market.label) || clean(report.title) || 'PolyDesk LP Scout brief',
        insight: clean(report.summary),
        footerUrl: 'polydesk.trade/?service=lp-scout',
        verificationLabel: 'ZeroScout verified LP brief',
        dailyReward: numericMetric(market.rewardDaily),
        estimatedRewardCapitalUsdc: numericMetric(market.estimatedRewardCapitalUsdc),
        liveSpread: numericMetric(market.spread),
        depthAtTwoCents: numericMetric(market.depth),
        daysToResolve: numericMetric(market.daysLeft),
        suggestedYesBid: numericMetric(market.yesQuote),
        suggestedNoBid: numericMetric(market.noQuote),
      })
      const file = new File([blob], `polydesk-lp-brief-${report.id}.png`, { type: 'image/png' })
      const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
      if (navigator.share && shareNavigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: clean(market.label) || 'PolyDesk LP Scout brief',
          text: 'A market-liquidity insight from PolyDesk LP Scout.',
          url: safeLandingUrl,
          files: [file],
        })
        setShareNotice('LP insight shared.')
        return
      }
      downloadLpOpportunityPng(blob, `brief-${report.id}`)
      await navigator.clipboard?.writeText(safeLandingUrl)
      setShareNotice('Image downloaded. LP Scout link copied.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareNotice(error instanceof Error ? error.message : 'The LP insight could not be shared.')
    } finally {
      setShareBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-5 text-gray-950 dark:bg-gray-950 dark:text-white">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-3xl flex-col">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {busy ? (
          <section className="flex flex-1 items-center justify-center">
            <PolyDeskLoadingState label="Opening LP Scout report" />
          </section>
        ) : !data?.ok || !report ? (
          <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm dark:border-red-900/40 dark:bg-white/[0.04]">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-semibold">Report not available</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{data?.error || 'This LP Scout report could not be found.'}</p>
              </div>
            </div>
          </section>
        ) : (
          <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <header className="border-b border-gray-100 px-5 py-5 dark:border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                    {verified || archiveUrl ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : archiveFailed ? <TriangleAlert className="h-3.5 w-3.5 text-amber-500" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />}
                    {verified ? 'ZeroScout verified' : archiveUrl ? '0G archived' : archiveFailed ? '0G archive needs attention' : '0G archiving in background'}
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight">PolyDesk LP Scout Report</h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{ageText(report.createdAt)} - x402-paid operator intelligence</p>
                </div>
                <FileText className="h-6 w-6 shrink-0 text-gray-300 dark:text-gray-600" />
              </div>
            </header>

            <section className="space-y-5 px-5 py-5">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20">
                <p className="text-xs font-semibold uppercase text-gray-400">Brief</p>
                <p className="mt-2 text-sm leading-6 text-gray-800 dark:text-gray-100">{clean(report.summary)}</p>
              </div>

              {!!report.marketLinks?.length && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Markets</p>
                  <div className="space-y-2">
                    {report.marketLinks.slice(0, showAllMarkets ? 10 : 3).map((market, index) => {
                      const reward = metricLabel(market.rewardDaily, 'USDC/day')
                      const rewardCapital = numericMetric(market.estimatedRewardCapitalUsdc)
                      const rewardShares = numericMetric(market.rewardMinShares)
                      const spread = metricLabel(market.spread, 'spread')
                      const depth = metricLabel(market.depth, 'depth within 2c')
                      const days = metricLabel(market.daysLeft, 'days left')
                      const yesQuote = clean(market.yesQuote)
                      const noQuote = clean(market.noQuote)
                      return (
                      <div
                        key={`${market.url}-${index}`}
                        className="rounded-xl border border-gray-100 p-3.5 dark:border-white/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase text-gray-400">Market {index + 1}</p>
                            <p className="mt-1 text-sm font-semibold leading-5 text-gray-900 dark:text-white">{market.label}</p>
                          </div>
                          <a href={market.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200">
                            Market <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                          {reward && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{reward}</span>}
                          {rewardCapital !== undefined && <span className="rounded bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">≈{rewardCapital.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC minimum setup</span>}
                          {spread && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{spread}</span>}
                          {depth && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{depth}</span>}
                          {days && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{days}</span>}
                        </div>
                        {rewardCapital !== undefined && (
                          <p className="mt-2 text-[10px] leading-4 text-gray-400">
                            Estimate uses {rewardShares?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 'the minimum'} reward-eligible shares across both suggested quotes. Qualifying does not guarantee a payout; Polymarket does not pay earned rewards below 1 USDC.
                          </p>
                        )}
                        {!!market.contextSignals?.length && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {market.contextSignals.slice(0, 2).map(signal => (
                              <span
                                key={`${signal.kind}:${signal.title}`}
                                title={signal.title}
                                className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                                  signal.kind === 'football'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                                    : 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200'
                                }`}
                              >
                                {signal.label}{signal.source ? ` · ${signal.source}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {(yesQuote || noQuote) && (
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            {yesQuote && <div className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">YES quote near {yesQuote}</div>}
                            {noQuote && <div className="rounded-lg bg-gray-100 px-3 py-2 font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200">NO quote near {noQuote}</div>}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setOrderMarketIndex(value => value === index ? null : index)}
                          className="mt-3 w-full rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-gray-950"
                        >
                          {orderMarketIndex === index ? 'Close order ticket' : 'Place limit order'}
                        </button>
                        {orderMarketIndex === index && (
                          <div className="mt-3">
                            <PolymarketLimitOrderTicket
                              marketTitle={market.label}
                              marketUrl={market.url}
                              yesQuote={market.yesQuote}
                              noQuote={market.noQuote}
                              rewardMinShares={market.rewardMinShares}
                              estimatedRewardCapitalUsdc={market.estimatedRewardCapitalUsdc}
                            />
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                  {report.marketLinks.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllMarkets(value => !value)}
                      className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]"
                    >
                      {showAllMarkets ? 'Show top 3' : `View ${Math.min(10, report.marketLinks.length) - 3} more opportunities`}
                    </button>
                  )}
                </div>
              )}

              {!!report.recommendedActions?.length && (
                <section>
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Action Checklist</p>
                  <ol className="space-y-2">
                    {report.recommendedActions.slice(0, 4).map((item, index) => (
                      <li key={index} className="grid grid-cols-[1.25rem_1fr] gap-3 text-sm text-gray-700 dark:text-gray-200">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-950 text-[11px] font-semibold leading-none text-white dark:bg-white dark:text-gray-950">{index + 1}</span>
                        <span className="leading-5">{clean(item)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {!!report.riskFlags?.length && (
                <section className="rounded-xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">Risk Flags</p>
                  <ul className="mt-2 space-y-2 text-sm text-amber-900 dark:text-amber-100">
                    {report.riskFlags.slice(0, 3).map((item, index) => (
                      <li key={index} className="grid grid-cols-[0.5rem_1fr] gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
                        <span className="leading-5">{clean(item)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="grid gap-2 rounded-xl border border-gray-100 p-3 text-xs dark:border-white/10 sm:grid-cols-3">
                <div>
                  <p className="font-semibold text-gray-400">Payment</p>
                  {report.x402?.receiptUrl ? <Link to={report.x402.receiptUrl} className="mt-1 inline-flex items-center gap-1 font-semibold text-gray-900 hover:underline dark:text-white">x402 receipt <ExternalLink className="h-3 w-3" /></Link> : <p className="mt-1 text-gray-500">Attached</p>}
                </div>
                <div>
                  <p className="font-semibold text-gray-400">0G Proof</p>
                  {displayProofUrl ? <a href={displayProofUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-gray-900 hover:underline dark:text-white">Open proof <ExternalLink className="h-3 w-3" /></a> : <p className="mt-1 text-gray-500">{archiveFailed ? 'Archive needs retry' : 'Archiving in background'}</p>}
                  {archiveFailed && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-amber-600 dark:text-amber-300">
                      {clean(report.archive?.lastStage)}{report.archive?.lastStage ? ': ' : ''}{clean(report.archive?.lastError || '0G archive failed before proof was stored.')}
                    </p>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-400">Proof Hash</p>
                  <p className="mt-1 truncate font-mono text-gray-700 dark:text-gray-200">{shortHash(report.proof?.proofHash || report.x402?.proof?.proofHash)}</p>
                </div>
              </section>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-4 dark:border-white/10">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <ShieldCheck className="h-4 w-4" />
                Human review required before quoting
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => void shareInsight()} disabled={shareBusy || !verified || !report.marketLinks?.length} className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  {shareBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                  {shareBusy ? 'Creating' : 'Share insight'}
                </button>
                <button type="button" onClick={downloadTxt} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/10">
                  <Download className="h-3.5 w-3.5" /> Export report
                </button>
              </div>
              {shareNotice && <p className="w-full text-right text-[11px] font-medium text-gray-500 dark:text-gray-400">{shareNotice}</p>}
            </footer>
          </article>
        )}
      </div>
    </main>
  )
}
