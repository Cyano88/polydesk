import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowUpRight, CircleDollarSign, History, Loader2, Radar, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { readSavedLpScoutActivity, type SavedLpScoutActivity } from '../lib/polydeskTradeActivity'

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
  const [marketActivity, setMarketActivity] = useState<PolymarketActivity[]>([])
  const [scoutReports, setScoutReports] = useState<ScoutReport[]>([])
  const [tradingAddress, setTradingAddress] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (manual = false) => {
    if (!ready || !authenticated) return
    manual ? setRefreshing(true) : setLoading(true)
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
      setLoading(false)
      setRefreshing(false)
    }
  }, [authenticated, getAccessToken, ready])

  useEffect(() => {
    void load()
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
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Trade</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Activity</h1>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="polydesk-icon-button shrink-0 disabled:opacity-50"
          aria-label="Refresh activity"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">{error}</div>
      )}

      {loading ? (
        <section className="polydesk-card mt-6 px-5 py-12 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
          <p className="mt-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Loading your activity…</p>
        </section>
      ) : rows.length > 0 ? (
        <section className="polydesk-card mt-6 overflow-hidden" aria-label="Recent activity">
          <div className="divide-y divide-gray-100 dark:divide-white/10">
            {rows.map(row => {
              const Icon = row.kind === 'scout' ? Radar : CircleDollarSign
              const content = (
                <>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${row.kind === 'scout' ? 'bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300'}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-gray-950 dark:text-white">{row.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{row.detail}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {row.amount && <span className="block text-xs font-black text-gray-950 dark:text-white">{row.amount}</span>}
                        <span className="mt-0.5 block text-[10px] text-gray-400">{relativeTime(row.createdAt)}</span>
                      </span>
                    </span>
                  </span>
                  {row.href && <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300" />}
                </>
              )
              return row.href ? (
                <a key={row.id} href={row.href} target={row.external ? '_blank' : undefined} rel={row.external ? 'noreferrer' : undefined} className="flex items-center gap-3 px-5 py-4 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">{content}</a>
              ) : (
                <div key={row.id} className="flex items-center gap-3 px-5 py-4">{content}</div>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="polydesk-card mt-6 px-5 py-12 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300"><History className="h-5 w-5" /></span>
          <h2 className="mt-4 text-sm font-black text-gray-950 dark:text-white">No recent activity</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">Your completed market actions and LP Scout requests will appear here.</p>
          {!tradingAddress && (
            <Link to="/polydesk?service=portfolio&portfolio=trading&wallet=balance" className="polydesk-primary-cta mt-4">Set up Account</Link>
          )}
        </section>
      )}
    </div>
  )
}
