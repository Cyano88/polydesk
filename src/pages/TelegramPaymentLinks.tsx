import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnectWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  LineChart,
  Loader2,
  LogOut,
  Newspaper,
  Radio,
  RefreshCw,
  Search,
  Trophy,
  Wallet,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { paylinkOrigin } from '../lib/config'

export type LpScoutPrefill = {
  market?: string
  question?: string
  url?: string
}

type BackProps = {
  onBack?: () => void
}

type RequestNetwork = 'base' | 'solana' | 'arbitrum'
type PolymarketBridgeNetwork = RequestNetwork
type PolymarketPositionStatus = 'not-started' | 'live' | 'ended'

type PolymarketProfile = {
  polymarketAddress: string
  watchedAddress?: string | null
  tradingAddress?: string | null
  depositWalletAddress?: string | null
  depositWalletStatus?: string | null
  depositWalletTxId?: string | null
  depositWalletTxHash?: string | null
  preferredFundingNetwork: string
  telegramOwner?: string | null
  telegramId?: string | null
  lastSyncedAt: string | null
}

type PolymarketAlertSettings = {
  lossThresholdPercent: number
  resolvedAlertsEnabled: boolean
  claimableAlertsEnabled: boolean
  movementAlertsEnabled: boolean
  alertEmail: string
}

type PolymarketFundingAttempt = {
  id: number
  requestId: string | null
  network: string
  amount: string
  status: string
  txHash: string | null
  depositAddress: string | null
  createdAt: string | null
}

type PolymarketPortfolioBundle = {
  profile: PolymarketProfile | null
  settings: PolymarketAlertSettings | null
  watchlist: Array<{ id: number; marketId: string; marketSlug: string | null; marketUrl: string | null; label: string | null }>
  fundingAttempts: PolymarketFundingAttempt[]
  alerts: Array<{ id: number; alertType: string; title: string; body: string | null; severity: string; readAt: string | null }>
}

type PolymarketPosition = {
  conditionId?: string
  market?: string
  asset?: string
  tokenId?: string
  title?: string
  slug?: string
  eventSlug?: string
  outcome?: string
  size?: number
  avgPrice?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
  redeemable?: boolean
  startDate?: string
  endDate?: string
  curPrice?: number
  icon?: string
  closed?: boolean
  archived?: boolean
  status?: string
  marketStatus?: string
}

const POLYDESK_API_ORIGIN = (import.meta.env.VITE_POLYDESK_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') ?? ''
const polymarketBridgeNetworks: Array<{ key: PolymarketBridgeNetwork; label: string }> = [
  { key: 'base', label: 'Base' },
  { key: 'solana', label: 'Solana' },
  { key: 'arbitrum', label: 'Arbitrum' },
]

function apiPath(path: string) {
  return `${POLYDESK_API_ORIGIN}${path}`
}

function shortHex(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function polymarketFundingRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `pmf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function readPolyDeskJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.toLowerCase().includes('application/json')) return await res.json() as T
  const text = await res.text().catch(() => '')
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error('PolyDesk portfolio service is not reachable from this page. Check the standalone API deployment.')
  }
  throw new Error(fallbackMessage)
}

function formatUsd(value: unknown, fallback = '--') {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  if (Math.abs(n) >= 10_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '--'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function normalizePortfolioValue(value: unknown) {
  if (typeof value === 'number') return { value }
  if (Array.isArray(value)) {
    return {
      value: value.reduce((sum, item) => {
        const row = item && typeof item === 'object' ? item as { value?: unknown } : null
        const n = Number(row?.value)
        return Number.isFinite(n) ? sum + n : sum
      }, 0),
    }
  }
  if (value && typeof value === 'object') {
    const n = Number((value as { value?: unknown }).value)
    if (Number.isFinite(n)) return { value: n }
  }
  return null
}

function positionValueSum(positions: PolymarketPosition[]) {
  return positions.reduce((sum, position) => {
    const n = Number(position.currentValue)
    return Number.isFinite(n) ? sum + n : sum
  }, 0)
}

function polymarketPositionStatus(position: PolymarketPosition): PolymarketPositionStatus {
  const status = `${position.status ?? ''} ${position.marketStatus ?? ''}`.toLowerCase()
  if (/(resolved|closed|settled|final|ended|archived)/.test(status) || position.closed || position.archived) return 'ended'
  if (/(not started|upcoming|scheduled|pre.?market)/.test(status)) return 'not-started'
  if (position.startDate) {
    const startedAt = new Date(position.startDate).getTime()
    if (Number.isFinite(startedAt) && startedAt > Date.now()) return 'not-started'
  }
  if (position.endDate) {
    const endedAt = new Date(position.endDate).getTime()
    if (Number.isFinite(endedAt) && endedAt < Date.now()) return 'ended'
  }
  return 'live'
}

function isClaimablePosition(position: PolymarketPosition) {
  return Boolean(position.redeemable || polymarketPositionStatus(position) === 'ended')
}

function isActiveOpenPosition(position: PolymarketPosition) {
  return polymarketPositionStatus(position) !== 'ended' && Number(position.currentValue ?? 0) > 0
}

function polymarketPositionKey(position: PolymarketPosition) {
  return position.asset || position.tokenId || position.conditionId || `${position.title ?? 'position'}:${position.outcome ?? ''}`
}

function polymarketEventUrl(position: PolymarketPosition) {
  if (position.eventSlug) return `https://polymarket.com/event/${position.eventSlug}`
  if (position.slug) return `https://polymarket.com/event/${position.slug}`
  if (position.market) return `https://polymarket.com/market/${position.market}`
  return 'https://polymarket.com'
}

function buildPolymarketPayLink({
  wallet,
  amount,
  funding,
  network,
  polymarketWallet,
  returnToStandalonePortfolio,
  returnToTradingWallet,
  requestId,
}: {
  wallet: string
  amount: string
  funding?: string
  network: RequestNetwork
  polymarketWallet: string
  returnToStandalonePortfolio?: boolean
  returnToTradingWallet?: boolean
  requestId?: string
}) {
  const params = new URLSearchParams()
  params.set('a', amount)
  params.set('src', 't')
  params.set('n', network)
  if (network === 'solana') params.set('s', wallet)
  else params.set('e', wallet)
  params.set('m', 'Polymarket')
  params.set('brand', 'polymarket')
  params.set('pm', '1')
  params.set('bridge', 'polymarket')
  params.set('pmw', polymarketWallet)
  if (requestId) params.set('pmr', requestId)
  if (returnToStandalonePortfolio) params.set('return', 'polydesk-portfolio')
  if (returnToTradingWallet) {
    params.set('portfolio', 'trading')
    params.set('wallet', 'balance')
  }
  if (funding) params.set('funding', funding)
  return `${paylinkOrigin}/pay?${params.toString()}`
}

function PrivyConnectButton({ className, children }: { className?: string; children: ReactNode }) {
  const { ready, login } = usePrivy()
  return (
    <button type="button" onClick={() => login()} disabled={!ready} className={className}>
      {children}
    </button>
  )
}

function PrivyWalletConnectButton({ className, children }: { className?: string; children: ReactNode }) {
  const { ready } = usePrivy()
  const { connectWallet } = useConnectWallet()
  return (
    <button type="button" onClick={() => connectWallet()} disabled={!ready} className={className}>
      {children}
    </button>
  )
}

function PrivyDisconnectButton({ className, title, children }: { className?: string; title?: string; children: ReactNode }) {
  const { ready, logout } = usePrivy()
  return (
    <button type="button" onClick={() => logout()} disabled={!ready} title={title} className={className}>
      {children}
    </button>
  )
}

export function TelegramHelperPanel({
  welcomeText,
  inputPlaceholder,
  initialPolyDeskSubMode,
  onPolyDeskSubModeChange,
}: {
  telegramName: string
  ownerKey: string
  telegramId: string
  fallbackOwner: string
  initialEventId: string
  initialPayer: string
  initialHelperMode: string
  initialPolyDeskSubMode: 'portfolio' | 'worldcup' | 'lp-scout' | ''
  initialNotice: string
  lockedHelperMode: string
  welcomeText: string
  inputPlaceholder: string
  hideTopDivider?: boolean
  polyDeskResetSignal: number
  onPolyDeskSubModeChange: (mode: 'portfolio' | 'worldcup' | 'lp-scout' | '') => void
  onRecoverTelegramName: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3 dark:bg-white/[0.07]">
        <p className="text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100">{welcomeText}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['portfolio', 'worldcup', 'lp-scout'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => onPolyDeskSubModeChange(mode)}
            className={cn(
              'min-h-10 rounded-xl border px-2 text-xs font-bold capitalize transition-colors',
              initialPolyDeskSubMode === mode
                ? 'border-[#0071E3] bg-[#0071E3] text-white'
                : 'border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200',
            )}
          >
            {mode.replace('-', ' ')}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-400 dark:border-white/10 dark:bg-white/[0.04]">
        {inputPlaceholder}
      </div>
    </div>
  )
}

export function PolyPortfolioPanel({
  onBack,
  onOpenLpScout,
  onOpenWorldCup,
  telegramOwner,
  telegramId,
  surface = 'standalone',
  initialPortfolioAction = 'trading',
  initialTradingWalletTab,
}: BackProps & {
  onOpenLpScout: () => void
  onOpenWorldCup: () => void
  telegramOwner: string
  telegramId: string
  surface: string
  initialPortfolioAction: 'watch' | 'trading' | 'external' | null
  initialTradingWalletTab?: 'balance'
}) {
  const { ready: privyReady, authenticated, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const [bundle, setBundle] = useState<PolymarketPortfolioBundle | null>(null)
  const [bundleLoading, setBundleLoading] = useState(false)
  const [bundleError, setBundleError] = useState('')
  const [addressInput, setAddressInput] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [depositWalletBusy, setDepositWalletBusy] = useState(false)
  const [depositWalletError, setDepositWalletError] = useState('')
  const [liveValue, setLiveValue] = useState<{ value?: number } | null>(null)
  const [livePositions, setLivePositions] = useState<PolymarketPosition[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')
  const [tradingPusdBalance, setTradingPusdBalance] = useState<{ raw: string; formatted: string } | null>(null)
  const [tradingPusdLoading, setTradingPusdLoading] = useState(false)
  const [tradingPusdError, setTradingPusdError] = useState('')
  const [tradingWalletTab, setTradingWalletTab] = useState<'balance' | 'fund' | 'withdraw' | 'positions'>(initialTradingWalletTab ?? 'balance')
  const [tradingWalletNetwork, setTradingWalletNetwork] = useState<PolymarketBridgeNetwork>('base')
  const [fundAmount, setFundAmount] = useState('')
  const [fundBusy, setFundBusy] = useState(false)
  const [fundError, setFundError] = useState('')
  const [fundResult, setFundResult] = useState<{ depositAddress: string; network: PolymarketBridgeNetwork; minimumUsdc: number; payUrl: string } | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState('')
  const [withdrawNetwork, setWithdrawNetwork] = useState<PolymarketBridgeNetwork>('base')
  const [withdrawNotice, setWithdrawNotice] = useState('')
  const [sellNotice, setSellNotice] = useState('')
  const [positionStatusTab, setPositionStatusTab] = useState<PolymarketPositionStatus>('live')
  const [addressCopied, setAddressCopied] = useState(false)
  const depositWalletAutoKey = useRef('')

  const profile = bundle?.profile ?? null
  const signingWallet = wallets.find(wallet => /^0x[a-fA-F0-9]{40}$/.test(wallet.address ?? '')) ?? null
  const signingWalletAddress = signingWallet?.address ?? ''
  const savedTradingAddress = profile?.tradingAddress || ''
  const polymarketDepositWallet = profile?.depositWalletAddress || ''
  const depositWalletStatus = String(profile?.depositWalletStatus || '').toLowerCase()
  const polymarketWalletReady = Boolean(polymarketDepositWallet && depositWalletStatus === 'ready')
  const polymarketWalletPending = Boolean(polymarketDepositWallet && !polymarketWalletReady)
  const tradingAddress = savedTradingAddress || signingWalletAddress || ''
  const tradingPortfolioAddress = polymarketDepositWallet || tradingAddress
  const connectedTradingWalletMismatch = Boolean(
    savedTradingAddress &&
    signingWalletAddress &&
    savedTradingAddress.toLowerCase() !== signingWalletAddress.toLowerCase(),
  )
  const activeOpenPositions = useMemo(() => livePositions.filter(isActiveOpenPosition), [livePositions])
  const claimablePositions = useMemo(() => livePositions.filter(isClaimablePosition), [livePositions])
  const positionsByStatus = useMemo(
    () => livePositions.filter(position => polymarketPositionStatus(position) === positionStatusTab),
    [livePositions, positionStatusTab],
  )
  const activePositionValue = useMemo(() => positionValueSum(activeOpenPositions), [activeOpenPositions])
  const claimableValue = useMemo(() => positionValueSum(claimablePositions), [claimablePositions])
  const tradingPusdValue = tradingPusdBalance?.formatted ? Number(tradingPusdBalance.formatted) : null
  const tradingPusdDisplay = tradingPusdLoading
    ? null
    : tradingPusdValue !== null && Number.isFinite(tradingPusdValue)
      ? formatUsd(tradingPusdValue)
      : '--'

  const fetchBundle = useCallback(async () => {
    if (!authenticated) return
    setBundleLoading(true)
    setBundleError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch(apiPath('/api/polymarket-portfolio?action=profile'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not load Polymarket portfolio.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load Polymarket portfolio.')
      setBundle({
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      })
    } catch (err) {
      setBundleError(err instanceof Error ? err.message : 'Could not load Polymarket portfolio.')
    } finally {
      setBundleLoading(false)
    }
  }, [authenticated, getAccessToken])

  const fetchLiveData = useCallback(async (address: string) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return
    setLiveLoading(true)
    setLiveError('')
    try {
      const [valueRes, positionsRes] = await Promise.all([
        fetch(apiPath(`/api/polymarket-portfolio?action=value&address=${encodeURIComponent(address)}`)),
        fetch(apiPath(`/api/polymarket-portfolio?action=positions&address=${encodeURIComponent(address)}&sizeThreshold=0&limit=100`)),
      ])
      const valueData = await readPolyDeskJson<{ ok?: boolean; value?: unknown; error?: string }>(valueRes, 'Could not load portfolio value.')
      const positionsData = await readPolyDeskJson<{ ok?: boolean; positions?: PolymarketPosition[]; error?: string }>(positionsRes, 'Could not load positions.')
      if (!valueRes.ok || !valueData.ok) throw new Error(valueData.error || 'Could not load portfolio value.')
      if (!positionsRes.ok || !positionsData.ok) throw new Error(positionsData.error || 'Could not load positions.')
      setLiveValue(normalizePortfolioValue(valueData.value))
      setLivePositions(Array.isArray(positionsData.positions) ? positionsData.positions : [])
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Could not load live portfolio data.')
    } finally {
      setLiveLoading(false)
    }
  }, [])

  const loadTradingPusdBalance = useCallback(async (wallet = polymarketDepositWallet) => {
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) return
    setTradingPusdLoading(true)
    setTradingPusdError('')
    try {
      const res = await fetch(apiPath('/api/polymarket-bridge'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'balance', polymarketWallet: wallet }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; balance?: { raw?: string; formatted?: string }; error?: string }>(res, 'Could not load pUSD balance.')
      if (!res.ok || !data.ok || !data.balance) throw new Error(data.error || 'Could not load pUSD balance.')
      setTradingPusdBalance({ raw: data.balance.raw ?? '0', formatted: data.balance.formatted ?? '0' })
    } catch (err) {
      setTradingPusdError(err instanceof Error ? err.message : 'Could not load pUSD balance.')
    } finally {
      setTradingPusdLoading(false)
    }
  }, [polymarketDepositWallet])

  useEffect(() => {
    if (privyReady && authenticated) void fetchBundle()
  }, [privyReady, authenticated, fetchBundle])

  useEffect(() => {
    if (tradingPortfolioAddress) void fetchLiveData(tradingPortfolioAddress)
  }, [tradingPortfolioAddress, fetchLiveData])

  useEffect(() => {
    if (polymarketWalletReady && polymarketDepositWallet) void loadTradingPusdBalance(polymarketDepositWallet)
  }, [polymarketWalletReady, polymarketDepositWallet, loadTradingPusdBalance])

  useEffect(() => {
    if (!authenticated || !savedTradingAddress || polymarketWalletReady || depositWalletBusy) return
    const key = `${savedTradingAddress.toLowerCase()}:${depositWalletStatus || 'none'}`
    if (depositWalletAutoKey.current === key) return
    depositWalletAutoKey.current = key
    void activatePolymarketWallet(savedTradingAddress)
  }, [authenticated, savedTradingAddress, polymarketWalletReady, depositWalletStatus, depositWalletBusy])

  async function saveProfile(addressOverride?: string): Promise<PolymarketPortfolioBundle | null> {
    const address = (addressOverride ?? addressInput).trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setProfileError('Enter a valid 0x owner wallet.')
      return null
    }
    setProfileError('')
    setSavingProfile(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch(apiPath('/api/polymarket-portfolio'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'save-profile',
          address,
          mode: 'trading',
          fundingNetwork: tradingWalletNetwork,
          telegramOwner,
          telegramId,
        }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not save profile.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save profile.')
      const nextBundle = {
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      }
      setBundle(nextBundle)
      setAddressInput('')
      return nextBundle
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save profile.')
      return null
    } finally {
      setSavingProfile(false)
    }
  }

  async function activatePolymarketWallet(ownerAddress = savedTradingAddress || signingWalletAddress) {
    const owner = ownerAddress.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) {
      setDepositWalletError('Connect Main Wallet before activating Polymarket wallet.')
      return null
    }
    setDepositWalletBusy(true)
    setDepositWalletError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch(apiPath('/api/polymarket-portfolio'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'ensure-deposit-wallet', ownerAddress: owner }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not activate Polymarket wallet.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not activate Polymarket wallet.')
      const nextBundle = {
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      }
      setBundle(nextBundle)
      return nextBundle
    } catch (err) {
      setDepositWalletError(err instanceof Error ? err.message : 'Could not activate Polymarket wallet.')
      return null
    } finally {
      setDepositWalletBusy(false)
    }
  }

  async function disconnectTradingProfile() {
    setSavingProfile(true)
    setProfileError('')
    setDepositWalletError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch(apiPath('/api/polymarket-portfolio'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'disconnect-trading' }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not change Main Wallet.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not change Main Wallet.')
      setBundle({
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      })
      setTradingPusdBalance(null)
      setFundResult(null)
      setFundAmount('')
      setWithdrawNotice('')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not change Main Wallet.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function useConnectedTradingWallet() {
    if (!signingWalletAddress) {
      setProfileError('Attach a Privy wallet before changing Main Wallet.')
      return
    }
    await disconnectTradingProfile()
    const saved = await saveProfile(signingWalletAddress)
    if (saved?.profile?.tradingAddress) void activatePolymarketWallet(saved.profile.tradingAddress)
  }

  async function startFund() {
    if (!savedTradingAddress) {
      setFundError('Open Main Wallet before funding.')
      return
    }
    if (!polymarketDepositWallet) {
      setFundError('Activate Polymarket Wallet before funding.')
      return
    }
    if (!polymarketWalletReady) {
      setFundError('Polymarket Wallet is still activating. Funding will unlock automatically once it is ready.')
      return
    }
    const amount = fundAmount.trim()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) < 3) {
      setFundError('Enter at least 3 USDC.')
      return
    }
    setFundBusy(true)
    setFundError('')
    setFundResult(null)
    try {
      const bridgeRes = await fetch(apiPath('/api/polymarket-bridge'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polymarketWallet: polymarketDepositWallet, network: tradingWalletNetwork }),
      })
      const bridgeData = await readPolyDeskJson<{
        ok?: boolean
        depositAddress?: string
        network?: PolymarketBridgeNetwork
        minimumUsdc?: number
        error?: string
      }>(bridgeRes, 'Could not prepare bridge address.')
      if (!bridgeRes.ok || !bridgeData.ok || !bridgeData.depositAddress) {
        throw new Error(bridgeData.error || 'Could not prepare bridge address.')
      }
      const requestId = polymarketFundingRequestId()
      const token = await getAccessToken()
      if (token) {
        await fetch(apiPath('/api/polymarket-portfolio'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: 'log-funding',
            polymarketWallet: polymarketDepositWallet,
            network: bridgeData.network ?? tradingWalletNetwork,
            amount,
            status: 'pending',
            requestId,
            depositAddress: bridgeData.depositAddress,
          }),
        }).catch(() => undefined)
      }
      const network = (bridgeData.network ?? tradingWalletNetwork) as PolymarketBridgeNetwork
      setFundResult({
        depositAddress: bridgeData.depositAddress,
        network,
        minimumUsdc: bridgeData.minimumUsdc ?? 3,
        payUrl: buildPolymarketPayLink({
          wallet: bridgeData.depositAddress,
          amount,
          funding: 'Polymarket portfolio',
          network,
          polymarketWallet: polymarketDepositWallet,
          returnToStandalonePortfolio: surface === 'standalone',
          returnToTradingWallet: true,
          requestId,
        }),
      })
      void fetchBundle()
    } catch (err) {
      setFundError(err instanceof Error ? err.message : 'Could not prepare funding.')
    } finally {
      setFundBusy(false)
    }
  }

  function copyDepositWallet() {
    if (!polymarketDepositWallet) return
    void navigator.clipboard?.writeText(polymarketDepositWallet)
    setAddressCopied(true)
    window.setTimeout(() => setAddressCopied(false), 1600)
  }

  const totalValue = liveValue?.value
  const latestFunding = bundle?.fundingAttempts?.[0] ?? null

  if (!privyReady) {
    return (
      <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]">
        <PanelTop icon={Wallet} kicker="Balance" title="Main Wallet" onBack={onBack} />
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading wallet session...
        </div>
      </section>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <PolyDeskBackButton onClick={onBack} />

      <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Balance</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Main Wallet</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                View pUSD trading cash, fund your account, withdraw as USDC, and track positions.
              </p>
            </div>
            {signingWalletAddress && (
              <PrivyDisconnectButton
                title="Sign out wallet"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </PrivyDisconnectButton>
            )}
          </div>
        </div>

        {bundleLoading && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:bg-white/[0.04] dark:text-gray-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved portfolio...
          </p>
        )}
        {bundleError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-400/10 dark:text-red-200">{bundleError}</p>}

        {!savedTradingAddress && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Open Main Wallet</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Save the wallet that will fund and prepare PolyDesk trades.
            </p>
            <div className="mt-3">
              {!authenticated ? (
                <PrivyConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  <Wallet className="h-4 w-4" />
                  Connect wallet
                </PrivyConnectButton>
              ) : signingWalletAddress ? (
                <button
                  type="button"
                  onClick={async () => {
                    const saved = await saveProfile(signingWalletAddress)
                    if (saved?.profile?.tradingAddress) void activatePolymarketWallet(saved.profile.tradingAddress)
                  }}
                  disabled={savingProfile || depositWalletBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {savingProfile || depositWalletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Open Main Wallet
                </button>
              ) : (
                <>
                  <PrivyWalletConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                    <Wallet className="h-4 w-4" />
                    Attach wallet
                  </PrivyWalletConnectButton>
                  <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Privy session active</p>
                </>
              )}
            </div>
            {profileError && <p className="mt-2 text-xs text-red-500 dark:text-red-300">{profileError}</p>}
          </div>
        )}

        {savedTradingAddress && (
          <div className="mt-3 grid gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Owner wallet</p>
                <p className="mt-1 font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">{shortHex(savedTradingAddress)}</p>
              </div>
              <button
                type="button"
                onClick={() => void disconnectTradingProfile()}
                disabled={savingProfile}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
              >
                {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Change
              </button>
            </div>
            {connectedTradingWalletMismatch && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <p className="font-semibold">Connected Privy wallet does not match this saved Main Wallet.</p>
                <p className="mt-1 font-mono">{shortHex(signingWalletAddress)} connected</p>
                <button
                  type="button"
                  onClick={() => void useConnectedTradingWallet()}
                  disabled={savingProfile || depositWalletBusy}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-950 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
                >
                  {savingProfile || depositWalletBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Use connected wallet
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Polymarket wallet</p>
                <button
                  type="button"
                  onClick={copyDepositWallet}
                  disabled={!polymarketDepositWallet}
                  className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-gray-800 disabled:cursor-default dark:text-gray-100"
                >
                  {polymarketDepositWallet
                    ? `${shortHex(polymarketDepositWallet)}${polymarketWalletReady ? '' : ' - activating'}`
                    : depositWalletBusy ? 'Activating...' : 'Not active'}
                  {polymarketDepositWallet && (addressCopied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-gray-400" />)}
                </button>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {polymarketWalletReady
                    ? 'Funding goes to this Polymarket deposit wallet, not the owner wallet.'
                    : 'PolyDesk is activating this Polymarket wallet automatically before funding unlocks.'}
                </p>
              </div>
              {!polymarketWalletReady && (
                <button
                  type="button"
                  onClick={() => void activatePolymarketWallet(savedTradingAddress)}
                  disabled={depositWalletBusy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {depositWalletBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {polymarketDepositWallet ? 'Check' : 'Activate'}
                </button>
              )}
            </div>
            {depositWalletError && <p className="text-xs text-red-500 dark:text-red-300">{depositWalletError}</p>}
            {profile?.depositWalletStatus && polymarketDepositWallet && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Status: <span className="font-semibold">{profile.depositWalletStatus}</span>
                {profile.depositWalletTxHash ? ` - ${shortHex(profile.depositWalletTxHash)}` : ''}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
          {[
            { key: 'balance', label: 'Balance', icon: Activity },
            { key: 'fund', label: 'Fund', icon: Download },
            { key: 'withdraw', label: 'Withdraw', icon: ArrowRight },
            { key: 'positions', label: 'Positions', icon: LineChart },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTradingWalletTab(key as typeof tradingWalletTab)}
              className={cn(
                'flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition-all',
                tradingWalletTab === key
                  ? 'border-gray-300 bg-gray-100 text-gray-950 shadow-sm dark:border-white/15 dark:bg-white/[0.12] dark:text-white'
                  : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {(tradingWalletTab === 'fund' || tradingWalletTab === 'withdraw') && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {polymarketBridgeNetworks.map(network => (
              <button
                key={network.key}
                type="button"
                onClick={() => {
                  if (tradingWalletTab === 'withdraw') setWithdrawNetwork(network.key)
                  else setTradingWalletNetwork(network.key)
                  setFundResult(null)
                }}
                className={cn(
                  'rounded-lg border px-2 py-2 text-[11px] font-bold transition-all',
                  (tradingWalletTab === 'withdraw' ? withdrawNetwork : tradingWalletNetwork) === network.key
                    ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200',
                )}
              >
                {network.label}
              </button>
            ))}
          </div>
        )}

        {tradingWalletTab === 'balance' && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <MetricCard label="pUSD trading cash" value={tradingPusdLoading ? null : tradingPusdDisplay} loading={tradingPusdLoading} note={tradingPusdError || (polymarketWalletReady ? 'Live pUSD balance on the Polymarket wallet.' : 'Activates after Polymarket wallet is ready.')} />
            <MetricCard label="Portfolio value" value={liveLoading ? null : formatUsd(totalValue)} loading={liveLoading} note={`${formatUsd(activePositionValue)} active positions`} footer={tradingPortfolioAddress ? shortHex(tradingPortfolioAddress) : undefined} />
            <MetricCard label="Claimable" value={liveLoading ? null : formatUsd(claimableValue)} loading={liveLoading} note={`${claimablePositions.length} redeemable positions`} />
          </div>
        )}

        {tradingWalletTab === 'fund' && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Fund pUSD trading cash</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Send USDC through Hash PayLink to the Polymarket deposit wallet. The payment page should return to this portfolio after confirmation.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={fundAmount}
                onChange={event => {
                  setFundAmount(event.target.value)
                  setFundResult(null)
                  setFundError('')
                }}
                inputMode="decimal"
                placeholder="Amount"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
              <button
                type="button"
                onClick={() => void startFund()}
                disabled={fundBusy || !savedTradingAddress || !polymarketWalletReady}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                {fundBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Fund
              </button>
            </div>
            {fundError && <p className="mt-2 text-xs text-red-500 dark:text-red-300">{fundError}</p>}
            {fundResult && (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-100">Funding link ready</p>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-200">
                  Deposit address: <span className="font-mono">{shortHex(fundResult.depositAddress)}</span> on {fundResult.network}. Minimum {fundResult.minimumUsdc} USDC.
                </p>
                <a href={fundResult.payUrl} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white dark:bg-emerald-100 dark:text-emerald-950">
                  Continue to Hash PayLink <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {latestFunding && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Latest funding: {latestFunding.amount} USDC on {latestFunding.network} - {latestFunding.status}
              </p>
            )}
          </div>
        )}

        {tradingWalletTab === 'withdraw' && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Withdraw as USDC</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Native withdrawal execution is intentionally gated until the standalone repo has the full relayer and signature audit.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={withdrawAmount}
                onChange={event => setWithdrawAmount(event.target.value)}
                inputMode="decimal"
                placeholder="pUSD amount"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
              <input
                value={withdrawRecipient}
                onChange={event => setWithdrawRecipient(event.target.value)}
                placeholder="Recipient wallet"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setWithdrawNotice('Withdraw execution moves in Phase 3 with the audited Polymarket relayer flow.')}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]"
            >
              Prepare withdrawal
            </button>
            {withdrawNotice && <p className="mt-2 text-xs text-amber-600 dark:text-amber-200">{withdrawNotice}</p>}
          </div>
        )}

        {tradingWalletTab === 'positions' && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Positions</p>
              <button
                type="button"
                onClick={() => tradingPortfolioAddress && void fetchLiveData(tradingPortfolioAddress)}
                disabled={liveLoading || !tradingPortfolioAddress}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                aria-label="Refresh positions"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', liveLoading && 'animate-spin')} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-gray-50 p-1 dark:bg-white/[0.04]">
              {[
                { key: 'not-started', label: 'Not started' },
                { key: 'live', label: 'Live' },
                { key: 'ended', label: 'Ended' },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPositionStatusTab(tab.key as PolymarketPositionStatus)}
                  className={cn(
                    'min-h-[34px] rounded-lg px-2 text-[11px] font-bold transition-all',
                    positionStatusTab === tab.key
                      ? 'bg-white text-gray-950 shadow-sm dark:bg-white/[0.12] dark:text-white'
                      : 'text-gray-500 hover:bg-white/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {sellNotice && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">{sellNotice}</p>}
            {liveError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-400/10 dark:text-red-200">{liveError}</p>}
            {liveLoading && livePositions.length === 0 ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Fetching positions...
              </div>
            ) : positionsByStatus.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">No {positionStatusTab.replace('-', ' ')} positions in this wallet.</p>
            ) : (
              <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(156,163,175,0.35)_transparent]">
                {positionsByStatus.slice(0, 12).map(position => {
                  const active = isActiveOpenPosition(position)
                  const pnl = position.percentPnl
                  const tone = typeof pnl === 'number'
                    ? pnl >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'
                    : 'text-gray-400'
                  return (
                    <div key={polymarketPositionKey(position)} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{position.title ?? 'Polymarket position'}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {position.outcome ?? 'Position'} - {formatUsd(position.currentValue)}
                          </p>
                        </div>
                        <p className={cn('text-sm font-semibold tabular-nums', tone)}>{formatPercent(pnl)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                        {active && (
                          <button
                            type="button"
                            onClick={() => setSellNotice('Sell order submission moves in Phase 3 after the standalone repo receives the audited CLOB and relayer dependencies.')}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-white"
                          >
                            Sell
                          </button>
                        )}
                        <a
                          href={polymarketEventUrl(position)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!authenticated ? (
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:to-white/[0.04]">
            <PrivyConnectButton className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100">
              <Wallet className="h-4 w-4" />
              Connect wallet
            </PrivyConnectButton>
            <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Email or wallet</p>
          </div>
        ) : !signingWalletAddress ? (
          <div className="mt-3">
            <PrivyWalletConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100">
              <Wallet className="h-4 w-4" />
              Attach wallet
            </PrivyWalletConnectButton>
            <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Privy session active</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ServiceButton label="World Cup" icon={Trophy} onClick={onOpenWorldCup} />
        <ServiceButton label="LP Scout" icon={Search} onClick={onOpenLpScout} />
      </div>
    </div>
  )
}

export function PolyWorldCupHubPanel({
  onBack,
  onOpenNews,
  onOpenScores,
  onOpenPortfolio,
}: BackProps & {
  onOpenNews: () => void
  onOpenScores: () => void
  onOpenPortfolio: () => void
}) {
  const { authenticated, getAccessToken } = usePrivy()
  const [hasProfile, setHasProfile] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    async function probe() {
      if (!authenticated) return
      try {
        const token = await getAccessToken()
        if (!token) return
        const res = await fetch(apiPath('/api/polymarket-portfolio?action=profile'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json() as { ok?: boolean; profile?: PolymarketProfile | null }
        if (!cancelled && res.ok && data.ok) setHasProfile(Boolean(data.profile?.polymarketAddress))
      } catch { /* silent */ }
    }
    void probe()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken])

  return (
    <div className="mt-4 space-y-4">
      {onBack && <PolyDeskBackButton onClick={onBack} />}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <Radio className="h-4 w-4 text-gray-500" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk World Cup</p>
      </div>
      <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Live scores, market odds, direct trade routes.</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        Live scores come from the matchday feed. Market odds and trade routes come from Polymarket. No stale fallbacks.
      </p>

      <div className="space-y-2">
        <PolyDeskMenuCard
          title="World Cup markets"
          body="Live match centre with exact Polymarket fixture routing."
          onClick={onOpenScores}
        />
        <PolyDeskMenuCard
          title="World Cup news"
          body="Headlines that move Polymarket prices and LP risk."
          onClick={onOpenNews}
        />
        {hasProfile && (
          <PolyDeskMenuCard
            title="Portfolio exposure"
            body="Check watched positions and market exposure before opening a trade."
            onClick={onOpenPortfolio}
          />
        )}
      </div>
    </div>
  )
}

export function PolyWorldCupNewsPanel({
  onBack,
  onOpenScores,
  onOpenLpScout,
}: BackProps & {
  onOpenScores: () => void
  onOpenLpScout: (prefill: LpScoutPrefill) => void
}) {
  return (
    <div className="space-y-3">
      <PanelTop icon={Newspaper} kicker="World Cup" title="News" onBack={onBack} />
      <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
        Production news feed is a Phase 2 panel extraction target.
      </p>
      <ServiceButton label="Scores" icon={Radio} onClick={onOpenScores} />
      <ServiceButton label="Send to LP Scout" icon={Search} onClick={() => onOpenLpScout({ market: 'World Cup' })} />
    </div>
  )
}

export function PolyStreamPanel({ onBack, onOpenNews }: BackProps & { onOpenNews: () => void }) {
  return (
    <div className="space-y-3">
      <PanelTop icon={Radio} kicker="Live" title="Scores" onBack={onBack} />
      <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
        Production PolyStream fixture and market matching is a Phase 2 panel extraction target.
      </p>
      <ServiceButton label="News" icon={Newspaper} onClick={onOpenNews} />
    </div>
  )
}

export function LpScoutPanel({
  prefill,
  onBack,
}: BackProps & {
  prefill: LpScoutPrefill | null
  onPrefillConsumed: () => void
  onOpenWalletManager: () => void
}) {
  return (
    <div className="space-y-3">
      <PanelTop icon={Search} kicker="LP Scout" title="Scout" onBack={onBack} />
      <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
        Production LP Scout extraction target. {prefill?.market ? `Prefill: ${prefill.market}` : ''}
      </p>
      <ServiceButton label="Reward intelligence" icon={LineChart} onClick={() => undefined} />
    </div>
  )
}

function PolyDeskBackButton({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <span className="back-btn" aria-hidden="true">
        <span className="arrow-container">
          <span className="chevron c1" />
          <span className="chevron c2" />
          <span className="chevron c3" />
        </span>
      </span>
      Back
    </button>
  )
}

function PolyDeskMenuCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md active:scale-[0.99] dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/20"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-black text-gray-950 dark:text-white">{title}</span>
        <span className="mt-1 block text-[12px] leading-5 text-gray-500 dark:text-gray-400">{body}</span>
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white transition-transform group-hover:translate-x-0.5 dark:bg-white dark:text-gray-950">
        <ChevronDown className="-rotate-90 h-4 w-4" />
      </span>
    </button>
  )
}

function PanelTop({
  icon: Icon,
  kicker,
  title,
  onBack,
}: {
  icon: typeof Wallet
  kicker: string
  title: string
  onBack?: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <PolyDeskBackButton onClick={onBack} />
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0071E3]">
        <Icon size={20} />
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{kicker}</p>
        <h2 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">{title}</h2>
      </div>
    </div>
  )
}

function MetricCard({ label, value, loading, note, footer }: { label: string; value: string | null; loading?: boolean; note: string; footer?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
        {loading ? <Loader2 className="inline h-5 w-5 animate-spin" /> : value}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>
      {footer && <p className="mt-1 text-xs font-semibold text-gray-400">{footer}</p>}
    </div>
  )
}

function ServiceButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Wallet; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:border-gray-200 hover:shadow-lg dark:border-white/10 dark:bg-[#111114]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0071E3]">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-black text-gray-900 dark:text-white">{label}</span>
      <ChevronRight size={18} className="text-gray-400" />
    </button>
  )
}
