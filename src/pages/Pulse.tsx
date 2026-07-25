import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Radio, Share2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PolymarketLimitOrderTicket } from '../components/PolymarketLimitOrderTicket'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'

type PulseOpportunity = {
  title?: string
  marketUrl?: string
  image?: string
  description?: string
  dailyReward?: number
  liveSpread?: number
  depthAtTwoCents?: number
  suggestedYesBid?: number
  suggestedNoBid?: number
  maxSpread?: number
  minSize?: number
  daysToResolve?: number
  lpExecutionRisk?: string
  score?: number
  scoutReason?: string
  executionPlan?: string[]
  footballContext?: {
    fixture?: string
    status?: string
    kickoffAt?: string
    goalScorers?: string[]
    stats?: string[]
    sourceUrl?: string
    provider?: string
  }
}

type PulseHighlight = {
  id: string
  kind: 'news' | 'football' | 'lp'
  eyebrow: string
  context: string
  source?: string
  image?: string
  opportunity: PulseOpportunity
}

type PulseFeed = {
  ok: boolean
  updatedAt?: string
  refreshAfterSeconds?: number
  highlights?: PulseHighlight[]
  markets?: PulseOpportunity[]
  providers?: Record<string, 'live' | 'unavailable'>
}

function metric(value: unknown, suffix: string, digits = 2) {
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(digits)}${suffix}` : ''
}

function compactNumber(value: unknown, maximumFractionDigits = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits }) : ''
}

function opportunityKey(opportunity: PulseOpportunity) {
  return `${opportunity.marketUrl || ''}|${opportunity.title || ''}`
}

function marketSlug(opportunity: PulseOpportunity) {
  try {
    return new URL(opportunity.marketUrl || '').pathname.split('/').filter(Boolean).at(-1) || ''
  } catch {
    return ''
  }
}

function riskText(value: string | undefined) {
  if (value === 'low') return 'Lower execution risk'
  if (value === 'medium') return 'Moderate execution risk'
  return 'High execution risk'
}

function MarketMetrics({ opportunity, inverse = false }: { opportunity: PulseOpportunity; inverse?: boolean }) {
  const items = [
    opportunity.dailyReward == null ? '' : `${compactNumber(opportunity.dailyReward)} USDC/day`,
    metric(Number(opportunity.liveSpread) * 100, 'c spread', 1),
    metric(opportunity.depthAtTwoCents, ' depth', 0),
    typeof opportunity.daysToResolve === 'number' ? `${opportunity.daysToResolve}d left` : '',
  ].filter(Boolean)
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold ${inverse ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
      {items.map(item => <span key={item}>{item}</span>)}
    </div>
  )
}

function PulseHeroCard({
  lead,
  imageBroken,
  onOpen,
  onImageError,
}: {
  lead: PulseHighlight
  imageBroken: boolean
  onOpen: () => void
  onImageError: () => void
}) {
  const available = Boolean(lead.opportunity.marketUrl?.startsWith('https://polymarket.com/event/'))
  const footballPending = lead.kind === 'football' && !available
  return (
    <button
      type="button"
      disabled={!available}
      onClick={onOpen}
      className="polydesk-card group relative block h-[280px] w-full overflow-hidden !border-gray-800 !bg-gray-950 text-left shadow-[0_20px_50px_rgba(15,23,42,0.18)] disabled:cursor-default dark:!border-white/10"
    >
      {lead.image && !imageBroken ? (
        <img src={lead.image} alt="" onError={onImageError} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]" />
      ) : (
        <div className="absolute inset-0 overflow-hidden bg-[#111216]">
          <span className={`absolute -left-16 top-8 h-44 w-44 rounded-full blur-3xl ${footballPending ? 'bg-emerald-400/20' : 'bg-blue-400/15'}`} />
          <span className="absolute -right-10 bottom-0 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <span className="absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent blur-[1px]" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/15" />
      <div className="relative flex h-full flex-col justify-end p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-lg !bg-white px-2.5 py-1 text-[10px] font-black uppercase !text-gray-950">{lead.eyebrow}</span>
          {lead.source && <span className="truncate text-[10px] font-semibold text-white/60">{lead.source}</span>}
        </div>
        <p className="line-clamp-1 text-xs font-medium text-white/65">{lead.context}</p>
        <h2 className="mt-1 max-w-xl text-xl font-semibold leading-tight tracking-[-0.02em] text-white">{lead.opportunity.title}</h2>
        {available ? (
          <>
            <div className="mt-3"><MarketMetrics opportunity={lead.opportunity} inverse /></div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white">
              View LP opportunity <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </>
        ) : (
          <p className="mt-2 max-w-md text-xs leading-5 text-white/60">{lead.opportunity.description}</p>
        )}
      </div>
    </button>
  )
}

export default function Pulse() {
  const [searchParams] = useSearchParams()
  const [feed, setFeed] = useState<PulseFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const [selected, setSelected] = useState<PulseOpportunity | null>(null)
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({})

  async function load() {
    try {
      const response = await fetch('/api/pulse')
      const data = await response.json() as PulseFeed
      if (!response.ok || !data.ok) throw new Error('Pulse is unavailable.')
      setFeed(data)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pulse is unavailable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const refresh = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(refresh)
  }, [])

  const highlights = feed?.highlights ?? []
  const markets = feed?.markets ?? []
  const lead = highlights.length ? highlights[active % highlights.length] : undefined

  useEffect(() => {
    const requested = searchParams.get('opportunity')?.trim().toLowerCase()
    if (!requested || !markets.length) return
    const match = markets.find(item => marketSlug(item).toLowerCase() === requested)
    if (match) setSelected(match)
  }, [markets, searchParams])

  useEffect(() => {
    if (!highlights.length) return
    setActive(Math.floor(Math.random() * highlights.length))
  }, [feed?.updatedAt, highlights.length])

  useEffect(() => {
    if (highlights.length <= 1) return
    const timer = window.setInterval(() => {
      setActive(value => (value + 1) % highlights.length)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [highlights.length])

  const makerGuidance = useMemo(() => {
    if (!selected) return []
    const spread = metric(Number(selected.liveSpread) * 100, 'c', 1)
    const depth = compactNumber(selected.depthAtTwoCents)
    return [
      'Choose YES or NO.',
      'Enter the USDC amount you want to use.',
      spread && depth
        ? `PolyDesk has suggested a price using the ${spread} gap and ${depth} nearby shares. Review it before signing.`
        : 'PolyDesk has filled in a suggested price. Review it before signing.',
    ]
  }, [selected])

  if (selected) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Pulse
        </button>

        <div className="polydesk-card overflow-hidden">
          <div className="border-b border-gray-100 p-5 dark:border-white/10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">LP opportunity</p>
                <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.03em] text-gray-950 dark:text-white">{selected.title}</h1>
              </div>
              {selected.marketUrl && (
                <div className="flex shrink-0 items-center gap-3">
                  <Link to={`/opportunity/${encodeURIComponent(marketSlug(selected))}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Share <Share2 className="h-3.5 w-3.5" />
                  </Link>
                  <a href={selected.marketUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
                    Market <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
            <div className="mt-3"><MarketMetrics opportunity={selected} /></div>
            {selected.description && <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{selected.description}</p>}
          </div>

          <div className="space-y-5 p-5">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-gray-100 pb-4 dark:border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Suggested quotes</p>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">YES <span className="ml-1 text-sm text-gray-950 dark:text-white">{selected.suggestedYesBid ?? '—'}</span></p>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">NO <span className="ml-1 text-sm text-gray-950 dark:text-white">{selected.suggestedNoBid ?? '—'}</span></p>
            </div>

            <div className="space-y-2">
              {makerGuidance.map((item, index) => (
                <div key={item} className="flex gap-3 text-xs leading-5 text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-gray-400">{String(index + 1).padStart(2, '0')}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {selected.marketUrl && (
              <PolymarketLimitOrderTicket
                marketTitle={selected.title || 'Polymarket market'}
                marketUrl={selected.marketUrl}
                yesQuote={selected.suggestedYesBid}
                noQuote={selected.suggestedNoBid}
              />
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Live intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">Pulse</h1>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Verified signals matched to live Polymarket liquidity.</p>
      </div>

      {loading ? (
        <div className="min-h-[260px]"><PolyDeskLoadingState label="Loading Pulse" /></div>
      ) : lead ? (
        <PulseHeroCard
          lead={lead}
          imageBroken={Boolean(brokenImages[lead.id])}
          onOpen={() => setSelected(lead.opportunity)}
          onImageError={() => setBrokenImages(value => ({ ...value, [lead.id]: true }))}
        />
      ) : (
        <div className="polydesk-card p-5">
          <Radio className="h-5 w-5 text-gray-400" />
          <p className="mt-3 text-sm font-semibold text-gray-950 dark:text-white">No verified Pulse signal</p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{error || 'Pulse will publish only after live provider context and a qualifying Polymarket book both pass.'}</p>
        </div>
      )}

      {!!highlights.length && (
        <div className="flex justify-center gap-1.5" aria-label="Pulse rotation">
          {highlights.map((item, index) => (
            <button key={item.id} type="button" onClick={() => setActive(index)} aria-label={`Show ${item.eyebrow}`} className={`h-1.5 rounded-full transition-all ${index === active % highlights.length ? 'w-6 bg-gray-950 dark:bg-white' : 'w-1.5 bg-gray-300 dark:bg-white/20'}`} />
          ))}
        </div>
      )}

      {!!markets.length && (
        <div className="polydesk-card divide-y divide-gray-100 overflow-hidden dark:divide-white/10">
          {markets.map(market => (
            <button key={opportunityKey(market)} type="button" onClick={() => setSelected(market)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-semibold leading-5 text-gray-950 dark:text-white">{market.title}</span>
                <span className="mt-1 block"><MarketMetrics opportunity={market} /></span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold text-gray-400">{riskText(market.lpExecutionRisk)}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
