import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ChevronDown, CircleDollarSign, ExternalLink, History, Radar } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { readSavedLpScoutActivity, type SavedLpScoutActivity } from '../lib/polydeskTradeActivity'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'

type PolymarketActivity = {
  transactionHash?: string
  timestamp?: number
  type?: string
  side?: string
  size?: number
  usdcSize?: number
  price?: number
  title?: string
  slug?: string
  eventSlug?: string
  outcome?: string
}

type ProfileResponse = {
  ok?: boolean
  error?: string
  profile?: {
    polymarketAddress?: string | null
    watchedAddress?: string | null
    tradingAddress?: string | null
    depositWalletAddress?: string | null
  } | null
}

type ScoutReport = {
  id: string
  title?: string
  createdAt?: number
  status?: string
  summary?: string
  x402?: { amount?: string; asset?: string; receiptUrl?: string }
}

type ActivityRow = {
  id: string
  kind: 'market' | 'scout'
  createdAt: number
  title: string
  detail: string
  amount: string
  href?: string
  external?: boolean
}

function validAddress(value: unknown): value is string {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? ''))
}

function money(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return `$${number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function marketActionTitle(item: PolymarketActivity) {
  const type = String(item.type || 'Activity').toUpperCase()
  if (type === 'TRADE') return `${String(item.side).toUpperCase() === 'SELL' ? 'Sold' : 'Bought'} ${item.outcome || 'market position'}`
  const labels: Record<string, string> = {
    SPLIT: 'Split position',
    MERGE: 'Merged position',
    REDEEM: 'Redeemed winnings',
    REWARD: 'Market reward received',
    MAKER_REBATE: 'Maker rebate received',
    REFERRAL_REWARD: 'Referral reward received',
    CONVERSION: 'Converted position',
  }
  return labels[type] || 'Market activity'
}

function marketAmount(item: PolymarketActivity) {
  const cash = Number(item.usdcSize)
  if (Number.isFinite(cash)) return money(cash)
  const size = Number(item.size)
  return Number.isFinite(size) ? `${size.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares` : ''
}

function relativeTime(value: number) {
  const diff = Math.max(0, Date.now() - value)
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(value).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function fullTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return ''
  const timestamp = new Date(value)
  return `${timestamp.toLocaleDateString()} at ${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  return data as T
}

async function loadScoutReport(item: SavedLpScoutActivity): Promise<ScoutReport | null> {
  const receipt = item.receiptActivityId ? `&receipt=${encodeURIComponent(item.receiptActivityId)}` : ''
  const response = await fetch(`/api/lp-scout-report?id=${encodeURIComponent(item.resultActivityId)}${receipt}`)
  const body = await readJson<{ ok?: boolean; report?: ScoutReport }>(response)
  return response.ok && body.ok && body.report ? body.report : null
}

export default function TradeActivity() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [searchParams] = useSearchParams()
  const localPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const [marketActivity, setMarketActivity] = useState<PolymarketActivity[]>([])
  const [scoutReports, setScoutReports] = useState<ScoutReport[]>([])
  const [tradingAddress, setTradingAddress] = useState('')
  const [loading, setLoading] = useState(!localPreview)
  const [error, setError] = useState('')
  const [expandedActivityId, setExpandedActivityId] = useState('')
  const hasLoadedRef = useRef(localPreview)

  const load = useCallback(async () => {
    if (localPreview) {
      setLoading(false)
      return
    }
    if (!ready || !authenticated) return
    if (!hasLoadedRef.current) setLoading(true)
    setError('')
    try {
      const scoutPromise = Promise.all(readSavedLpScoutActivity().map(loadScoutReport))
      let ownTradingAddress = ''
      let profileLoadError = ''
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Sign in required.')
        const profileResponse = await fetch('/api/polymarket-portfolio?action=profile', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const profileBody = await readJson<ProfileResponse>(profileResponse)
        if (!profileResponse.ok || !profileBody.ok) throw new Error(profileBody.error || 'Could not load your trading account.')
        const profile = profileBody.profile
        ownTradingAddress = [profile?.depositWalletAddress, profile?.tradingAddress]
          .find(validAddress) || (!profile?.watchedAddress && validAddress(profile?.polymarketAddress) ? profile.polymarketAddress : '')
      } catch (cause) {
        profileLoadError = cause instanceof Error ? cause.message : 'Could not load your trading account.'
      }
      setTradingAddress(ownTradingAddress)

      const marketPromise = ownTradingAddress
        ? fetch(`/api/polymarket-portfolio?action=activity&address=${encodeURIComponent(ownTradingAddress)}&limit=50`)
            .then(async response => {
              const body = await readJson<{ ok?: boolean; activity?: PolymarketActivity[]; error?: string }>(response)
              if (!response.ok || !body.ok) throw new Error(body.error || 'Could not load market activity.')
              return Array.isArray(body.activity) ? body.activity : []
            })
        : Promise.resolve([])

      const [marketResult, scoutResult] = await Promise.allSettled([marketPromise, scoutPromise])
      if (marketResult.status === 'fulfilled') setMarketActivity(marketResult.value)
      if (scoutResult.status === 'fulfilled') setScoutReports(scoutResult.value.filter((item): item is ScoutReport => Boolean(item)))
      if (marketResult.status === 'rejected' && scoutResult.status === 'rejected') throw marketResult.reason
      const sourceErrors = [
        profileLoadError,
        marketResult.status === 'rejected' ? (marketResult.reason instanceof Error ? marketResult.reason.message : 'Market activity is temporarily unavailable.') : '',
        scoutResult.status === 'rejected' ? 'Some LP Scout reports could not be loaded.' : '',
      ].filter(Boolean)
      if (sourceErrors.length) setError(sourceErrors.join(' '))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load activity.')
    } finally {
      hasLoadedRef.current = true
      setLoading(false)
    }
  }, [authenticated, getAccessToken, localPreview, ready])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [load])

  const rows = useMemo<ActivityRow[]>(() => {
    const markets = marketActivity.map((item, index): ActivityRow => {
      const timestamp = Number(item.timestamp)
      const createdAt = Number.isFinite(timestamp) ? timestamp * 1000 : 0
      const marketSlug = item.eventSlug || item.slug
      return {
        id: item.transactionHash || `market-${createdAt}-${index}`,
        kind: 'market',
        createdAt,
        title: marketActionTitle(item),
        detail: item.title || 'Polymarket market',
        amount: marketAmount(item),
        href: marketSlug ? `https://polymarket.com/event/${encodeURIComponent(marketSlug)}` : undefined,
        external: true,
      }
    })
    const scouts = scoutReports.map((report): ActivityRow => ({
      id: `scout-${report.id}`,
      kind: 'scout',
      createdAt: Number(report.createdAt) || 0,
      title: 'LP Scout report completed',
      detail: report.summary || report.title || 'Your saved LP Scout report is ready.',
      amount: report.x402?.amount ? `${report.x402.amount} ${report.x402.asset || 'USDC'}` : '',
      href: `/report/lp-scout/${encodeURIComponent(report.id)}${report.x402?.receiptUrl ? `?receipt=${encodeURIComponent(report.x402.receiptUrl.split('/').pop() || '')}` : ''}`,
    }))
    return [...markets, ...scouts].sort((a, b) => b.createdAt - a.createdAt)
  }, [marketActivity, scoutReports])

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Overview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Activity</h1>
        {!loading && <p className="mt-1 text-xs text-gray-400">{rows.length} record{rows.length === 1 ? '' : 's'}</p>}
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">{error}</div>
      )}

      {loading ? (
        <section className="mt-6">
          <PolyDeskLoadingState label="Syncing activity" />
        </section>
      ) : rows.length > 0 ? (
        <section className="mt-6 space-y-2" aria-label="Recent activity">
          {rows.map(row => {
            const Icon = row.kind === 'scout' ? Radar : CircleDollarSign
            const expanded = expandedActivityId === row.id
            return (
              <article key={row.id} className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                  <button
                    type="button"
                    onClick={() => setExpandedActivityId(current => current === row.id ? '' : row.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${row.kind === 'scout' ? 'bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-gray-950 dark:text-white">{row.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-gray-500 dark:text-gray-400">{row.detail}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {row.amount && <span className="block text-xs font-black tabular-nums text-gray-950 dark:text-white">{row.amount}</span>}
                      <span className="mt-0.5 block text-[10px] text-gray-400">{relativeTime(row.createdAt)}</span>
                      <ChevronDown className={`ml-auto mt-1 h-3.5 w-3.5 text-gray-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  {expanded && (
                    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-white/10">
                      {fullTime(row.createdAt) && <p className="text-[10px] font-medium text-gray-400">{fullTime(row.createdAt)}</p>}
                      {row.href && (
                        row.external ? (
                          <a
                            href={row.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-950 dark:border-white/10 dark:text-gray-200 dark:hover:border-white/20 dark:hover:text-white"
                          >
                            Open on Polymarket <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <Link
                            to={row.href}
                            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-950 dark:border-white/10 dark:text-gray-200 dark:hover:border-white/20 dark:hover:text-white"
                          >
                            View report
                          </Link>
                        )
                      )}
                    </div>
                  )}
              </article>
            )
          })}
        </section>
      ) : (
        <section className="polydesk-card mt-6 px-5 py-12 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300"><History className="h-5 w-5" /></span>
          <h2 className="mt-4 text-sm font-black text-gray-950 dark:text-white">No recent activity</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">Your completed market actions and LP Scout requests will appear here.</p>
          {!tradingAddress && (
            <Link to={localPreview ? '/polydesk?preview=1&service=portfolio&portfolio=preview' : '/polydesk?service=portfolio&portfolio=trading&wallet=balance'} className="polydesk-primary-cta mt-4">Set up Account</Link>
          )}
        </section>
      )}
    </div>
  )
}
