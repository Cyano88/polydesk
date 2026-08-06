import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Radio, Share2 } from '../components/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'
import { rankLpOpportunitiesByMeasurements, type LpMeasuredSummary } from '../lib/lpMeasuredRanking'

const PolymarketLimitOrderTicket = lazy(() => import('../components/PolymarketLimitOrderTicket').then(module => ({ default: module.PolymarketLimitOrderTicket })))

type PulseOpportunity = {
  title?: string
  conditionId?: string
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
  capitalUsdc?: number
  dailyTargetUsdc?: number
  requiredRewardSharePercentage?: number
  capitalToMinimumRatio?: number
  minimumSetupCovered?: boolean
  targetScore?: number
  daysToResolve?: number
  lpExecutionRisk?: string
  score?: number
  measuredDailyAtCapitalUsdc?: number
  measurementObservedAt?: number
  scoutReason?: string
  executionPlan?: string[]
  contextSignals?: Array<{
    kind: 'news' | 'football'
    label: string
    source: string
    title: string
    url?: string
    publishedAt?: string
  }>
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
  rank: 1 | 2 | 3
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
  target?: {
    capitalUsdc: number
    dailyTargetUsdc: number
  }
  providers?: Record<string, 'live' | 'unavailable'>
}

let pulseSnapshot: PulseFeed | null = null
const PULSE_SESSION_KEY = 'polydesk:pulse:v1'
const PULSE_SESSION_MAX_AGE_MS = 10 * 60_000

function initialPulseSnapshot() {
  if (pulseSnapshot) return pulseSnapshot
  if (typeof window === 'undefined') return null
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(PULSE_SESSION_KEY) || '') as {
      savedAt?: number
      feed?: PulseFeed
    }
    if (
      saved.feed?.ok
      && Number(saved.savedAt) > Date.now() - PULSE_SESSION_MAX_AGE_MS
      && Array.isArray(saved.feed.highlights)
      && Array.isArray(saved.feed.markets)
    ) {
      pulseSnapshot = saved.feed
      return saved.feed
    }
  } catch {
    // A malformed or unavailable session cache should never block the live feed.
  }
  return null
}

function rememberPulseSnapshot(feed: PulseFeed) {
  pulseSnapshot = feed
  try {
    window.sessionStorage.setItem(PULSE_SESSION_KEY, JSON.stringify({
      savedAt: Date.now(),
      feed,
    }))
  } catch {
    // Browsers may disable session storage; the in-memory snapshot still works.
  }
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
  if (value === 'low') return 'Lower risk'
  if (value === 'medium') return 'Moderate risk'
  return 'Higher risk'
}

function MarketMetrics({ opportunity, inverse = false, compact = false }: { opportunity: PulseOpportunity; inverse?: boolean; compact?: boolean }) {
  const items = [
    opportunity.dailyReward == null ? '' : `${compactNumber(opportunity.dailyReward)} USDC/day market pool`,
    opportunity.estimatedRewardCapitalUsdc == null
      ? ''
      : `≈${compactNumber(opportunity.estimatedRewardCapitalUsdc, 2)} USDC two-sided setup`,
    metric(Number(opportunity.liveSpread) * 100, 'c spread', 1),
    metric(opportunity.depthAtTwoCents, ' depth', 0),
    typeof opportunity.daysToResolve === 'number' ? `${opportunity.daysToResolve}d left` : '',
  ].filter(Boolean).slice(0, compact ? 3 : 5)
  return (
    <div className={`flex flex-wrap gap-x-2.5 gap-y-0.5 font-semibold ${compact ? 'text-[10px]' : 'text-[11px]'} ${inverse ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
      {items.map(item => <span key={item}>{item}</span>)}
    </div>
  )
}

function RewardTargetStatus({ opportunity, inverse = false }: { opportunity: PulseOpportunity; inverse?: boolean }) {
  const target = Number(opportunity.dailyTargetUsdc)
  const share = Number(opportunity.requiredRewardSharePercentage)
  if (!Number.isFinite(target) || !Number.isFinite(share)) return null
  const measuredDaily = Number(opportunity.measuredDailyAtCapitalUsdc)
  if (Number.isFinite(measuredDaily)) {
    const meetsTarget = measuredDaily >= target
    return (
      <p className={`text-[11px] font-semibold ${inverse ? 'text-white/80' : meetsTarget ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
        Live measurement: about ${compactNumber(measuredDaily, 2)}/day with this capital · {meetsTarget ? 'target met' : 'below target'}
      </p>
    )
  }
  const covered = opportunity.minimumSetupCovered !== false
  return (
    <p className={`text-[11px] font-semibold ${inverse ? 'text-white/80' : covered ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
      {covered
        ? `$${compactNumber(target, 2)}/day target needs ${compactNumber(share, 2)}% of this pool`
        : `Budget is below this market's two-sided setup`}
    </p>
  )
}

function ordinal(rank: number) {
  const remainder = rank % 100
  if (remainder >= 11 && remainder <= 13) return `${rank}th`
  if (rank % 10 === 1) return `${rank}st`
  if (rank % 10 === 2) return `${rank}nd`
  if (rank % 10 === 3) return `${rank}rd`
  return `${rank}th`
}

function rankMedal(rank: number) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return String(rank)
}

function ContextLabels({ opportunity, inverse = false, compact = false }: { opportunity: PulseOpportunity; inverse?: boolean; compact?: boolean }) {
  const signals = opportunity.contextSignals?.slice(0, compact ? 1 : 2) ?? []
  if (!signals.length) return null
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Market intelligence context">
      {signals.map(signal => (
        <span
          key={`${signal.kind}:${signal.title}`}
          title={signal.title}
          className={`inline-flex max-w-full items-center rounded-md px-2 text-[10px] font-semibold ${compact ? 'py-0.5' : 'py-1'} ${
            inverse
              ? 'bg-white/12 text-white/85 backdrop-blur'
              : signal.kind === 'football'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200'
          }`}
        >
          {signal.label}{signal.source ? ` · ${signal.source}` : ''}
        </span>
      ))}
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
        <img src={lead.image} alt="" loading="eager" decoding="async" fetchPriority="high" onError={onImageError} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.025] motion-reduce:transition-none" />
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
          <span className="rounded-lg !bg-white px-2.5 py-1 text-[10px] font-black uppercase !text-gray-950">{ordinal(lead.rank)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{lead.eyebrow}</span>
          {lead.source && <span className="truncate text-[10px] font-semibold text-white/60">{lead.source}</span>}
        </div>
        <p className="line-clamp-1 text-xs font-medium text-white/65">{lead.context}</p>
        <h2 className="mt-1 max-w-xl text-xl font-semibold leading-tight tracking-[-0.02em] text-white">{lead.opportunity.title}</h2>
        {available ? (
          <>
            <div className="mt-3"><MarketMetrics opportunity={lead.opportunity} inverse /></div>
            <div className="mt-1"><RewardTargetStatus opportunity={lead.opportunity} inverse /></div>
            <div className="mt-2"><ContextLabels opportunity={lead.opportunity} inverse /></div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white">
              View reward opportunity <ArrowRight className="h-3.5 w-3.5" />
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
  const { authenticated, getAccessToken } = usePrivy()
  const [searchParams] = useSearchParams()
  const initialSnapshot = useMemo(initialPulseSnapshot, [])
  const [feed, setFeed] = useState<PulseFeed | null>(initialSnapshot)
  const [loading, setLoading] = useState(!initialSnapshot)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const [selected, setSelected] = useState<PulseOpportunity | null>(null)
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({})
  const requestedCapital = searchParams.get('capital')?.trim() || '50'
  const requestedTarget = searchParams.get('target')?.trim() || '1'
  const [capitalInput, setCapitalInput] = useState(requestedCapital)
  const [targetInput, setTargetInput] = useState(requestedTarget)
  const [targetProfile, setTargetProfile] = useState({ capital: requestedCapital, daily: requestedTarget })
  const requestRef = useRef<{ key: string; promise: Promise<void> } | null>(null)

  const load = useCallback(() => {
    const requestKey = `${targetProfile.capital}:${targetProfile.daily}:${authenticated ? 'measured' : 'public'}`
    if (requestRef.current?.key === requestKey) return requestRef.current.promise
    const request = (async () => {
      try {
        const query = new URLSearchParams({ budget: targetProfile.capital, target: targetProfile.daily })
        const token = authenticated ? await getAccessToken().catch(() => null) : null
        const [response, measurementResponse] = await Promise.all([
          fetch(`/api/pulse?${query.toString()}`),
          token
            ? fetch('/api/polymarket-portfolio?action=lp-probe-summary', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
            : Promise.resolve(null),
        ])
        const data = await response.json().catch(() => null) as PulseFeed | null
        if (!response.ok || !data?.ok) throw new Error('Pulse is unavailable.')
        const measurementData = measurementResponse?.ok
          ? await measurementResponse.json().catch(() => null) as { summaries?: LpMeasuredSummary[] } | null
          : null
        const capital = Number(targetProfile.capital)
        const dailyTarget = Number(targetProfile.daily)
        if (Array.isArray(data.markets) && measurementData?.summaries?.length && Number.isFinite(capital) && Number.isFinite(dailyTarget)) {
          const rankedMarkets = rankLpOpportunitiesByMeasurements(data.markets, measurementData.summaries, capital, dailyTarget)
          const existingHighlights = new Map((data.highlights ?? []).map(item => [String(item.opportunity.conditionId ?? '').toLowerCase(), item]))
          data.markets = rankedMarkets
          data.highlights = rankedMarkets.slice(0, 3).map((opportunity, index) => {
            const existing = existingHighlights.get(String(opportunity.conditionId ?? '').toLowerCase())
            return {
              id: existing?.id ?? `lp:${opportunityKey(opportunity)}`,
              kind: 'lp',
              rank: (index + 1) as 1 | 2 | 3,
              eyebrow: index === 0 ? 'Strongest opportunity' : 'Ranked opportunity',
              context: existing?.context ?? opportunity.scoutReason ?? 'Strong live liquidity opportunity',
              source: existing?.source ?? 'Polymarket CLOB',
              image: existing?.image ?? opportunity.image,
              opportunity,
            }
          })
        }
        if (requestRef.current?.key !== requestKey) return
        rememberPulseSnapshot(data)
        setFeed(data)
        setError('')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Pulse is unavailable.')
      } finally {
        if (requestRef.current?.key === requestKey) {
          setLoading(false)
          requestRef.current = null
        }
      }
    })()
    requestRef.current = { key: requestKey, promise: request }
    return request
  }, [authenticated, getAccessToken, targetProfile.capital, targetProfile.daily])

  useEffect(() => {
    void load()
    const refreshMs = Math.max(30_000, Number(feed?.refreshAfterSeconds ?? 60) * 1_000)
    const refresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, refreshMs)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [feed?.refreshAfterSeconds, load])

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
    setActive(0)
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
      'Choose Buy now or Earn market rewards.',
      'Choose YES or NO.',
      'Enter the USDC amount you want to use.',
      spread && depth
        ? `For market rewards, PolyDesk suggests a price using the ${spread} gap and ${depth} nearby shares.`
        : 'For market rewards, review the suggested price before signing.',
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Market reward opportunity</p>
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
            <div className="mt-2"><RewardTargetStatus opportunity={selected} /></div>
            <div className="mt-2"><ContextLabels opportunity={selected} /></div>
            {selected.estimatedRewardCapitalUsdc != null && (
              <p className="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                Two-sided setup estimates the minimum across both suggested quotes and can improve scoring. Your exact estimate appears only after Polymarket scores the live quote against competing makers; rewards below 1 USDC are not paid.
              </p>
            )}
            {selected.description && <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{selected.description}</p>}
          </div>

          <div className="space-y-5 p-5">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-gray-100 pb-4 dark:border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Suggested quotes</p>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">YES <span className="ml-1 text-sm text-gray-950 dark:text-white">{selected.suggestedYesBid ?? 'N/A'}</span></p>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">NO <span className="ml-1 text-sm text-gray-950 dark:text-white">{selected.suggestedNoBid ?? 'N/A'}</span></p>
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
              <Suspense fallback={<PolyDeskLoadingState label="Opening order ticket" />}>
                <PolymarketLimitOrderTicket
                  marketTitle={selected.title || 'Polymarket market'}
                  marketUrl={selected.marketUrl}
                  marketSlug={selected.marketSlug}
                  yesQuote={selected.suggestedYesBid}
                  noQuote={selected.suggestedNoBid}
                  tickSize={selected.tickSize}
                  rewardMinShares={selected.minSize}
                  estimatedRewardCapitalUsdc={selected.estimatedRewardCapitalUsdc}
                />
              </Suspense>
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
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Lower-risk reward markets ranked for your capital and daily target. A stronger qualifying market replaces the weakest.</p>
      </div>

      <form
        className="polydesk-card grid grid-cols-[1fr_1fr_auto] items-end gap-2 p-3"
        onSubmit={event => {
          event.preventDefault()
          const capital = Math.max(1, Number(capitalInput) || 50).toString()
          const daily = Math.max(0.01, Number(targetInput) || 1).toString()
          setCapitalInput(capital)
          setTargetInput(daily)
          setLoading(true)
          setTargetProfile({ capital, daily })
        }}
      >
        <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Capital
          <span className="mt-1 flex h-9 items-center rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-950 dark:border-white/10 dark:text-white">
            $<input value={capitalInput} onChange={event => setCapitalInput(event.target.value)} inputMode="decimal" aria-label="LP capital in USDC" className="min-w-0 flex-1 bg-transparent pl-1 outline-none" />
          </span>
        </label>
        <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Daily target
          <span className="mt-1 flex h-9 items-center rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-950 dark:border-white/10 dark:text-white">
            $<input value={targetInput} onChange={event => setTargetInput(event.target.value)} inputMode="decimal" aria-label="Daily LP reward target in USDC" className="min-w-0 flex-1 bg-transparent pl-1 outline-none" />
          </span>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-gray-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Find</button>
      </form>

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
            <button key={item.id} type="button" onClick={() => setActive(index)} aria-label={`Show ${item.eyebrow}`} className={`h-1.5 rounded-full transition-[width,background-color] duration-150 ${index === active % highlights.length ? 'w-6 bg-gray-950 dark:bg-white' : 'w-1.5 bg-gray-300 dark:bg-white/20'}`} />
          ))}
        </div>
      )}

      {!!markets.length && (
        <div className="polydesk-card divide-y divide-gray-100 overflow-hidden dark:divide-white/10">
          {markets.slice(0, 5).map((market, index) => (
            <button key={opportunityKey(market)} type="button" onClick={() => setSelected(market)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center text-base font-semibold text-gray-400"
                aria-label={`${ordinal(index + 1)} ranked opportunity`}
              >
                {rankMedal(index + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <span className="line-clamp-1 text-[13px] font-semibold leading-5 text-gray-950 dark:text-white">{market.title}</span>
                <div className="mt-0.5"><MarketMetrics opportunity={market} compact /></div>
                <div className="mt-1"><ContextLabels opportunity={market} compact /></div>
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-gray-400">{riskText(market.lpExecutionRisk)}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
