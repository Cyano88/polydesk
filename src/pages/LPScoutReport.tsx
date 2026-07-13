import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Copy, Download, ExternalLink, FileText, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'

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
      spread?: unknown
      depth?: unknown
      daysLeft?: unknown
      yesQuote?: unknown
      noQuote?: unknown
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
    report.archive?.status === 'failed' ? `0G archive status: ${report.archive.lastStage || 'failed'} - ${report.archive.lastError || 'needs retry'}` : '',
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
  const [copied, setCopied] = useState('')

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
  const archiveFailed = archiveStatus === 'failed'
  const displayProofUrl = proofUrl || archiveUrl
  const copyText = useMemo(() => report ? reportText(report) : '', [report])

  async function copy(value: string, label: string) {
    await navigator.clipboard?.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1400)
  }

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
          <section className="flex flex-1 items-center justify-center rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-3 text-sm font-semibold text-gray-500 dark:text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading LP Scout report
            </div>
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
                    {report.marketLinks.slice(0, 3).map((market, index) => {
                      const reward = metricLabel(market.rewardDaily, 'USDC/day')
                      const spread = metricLabel(market.spread, 'spread')
                      const depth = metricLabel(market.depth, 'depth within 2c')
                      const days = metricLabel(market.daysLeft, 'days left')
                      const yesQuote = clean(market.yesQuote)
                      const noQuote = clean(market.noQuote)
                      return (
                      <a
                        key={`${market.url}-${index}`}
                        href={market.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group block rounded-xl border border-gray-100 p-3.5 transition hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase text-gray-400">Market {index + 1}</p>
                            <p className="mt-1 text-sm font-semibold leading-5 text-gray-900 dark:text-white">{market.label}</p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-950 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-white dark:text-gray-950">
                            Open <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                          {reward && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{reward}</span>}
                          {spread && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{spread}</span>}
                          {depth && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{depth}</span>}
                          {days && <span className="rounded bg-gray-100 px-2 py-1 dark:bg-white/10">{days}</span>}
                        </div>
                        {(yesQuote || noQuote) && (
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            {yesQuote && <div className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">YES quote near {yesQuote}</div>}
                            {noQuote && <div className="rounded-lg bg-gray-100 px-3 py-2 font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200">NO quote near {noQuote}</div>}
                          </div>
                        )}
                      </a>
                    )})}
                  </div>
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
              <div className="flex gap-2">
                <button type="button" onClick={() => copy(window.location.href, 'link')} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/10">
                  <Copy className="h-3.5 w-3.5" /> {copied === 'link' ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" onClick={downloadTxt} className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              </div>
            </footer>
          </article>
        )}
      </div>
    </main>
  )
}
