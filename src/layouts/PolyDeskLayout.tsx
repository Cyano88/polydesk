import { useEffect, useState, type ComponentType } from 'react'
import { Link, Outlet, useSearchParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  ArrowLeftRight,
  CircleDollarSign,
  Copy,
  Eye,
  LogOut,
  Moon,
  Newspaper,
  Radar,
  Sun,
  Trophy,
  Wallet,
} from 'lucide-react'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { cn } from '../lib/utils'

type Workspace = 'agent' | 'portfolio' | 'trade'

function PolymarketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M6.25 5.8 18.4 2.75a1 1 0 0 1 1.24.97v16.56a1 1 0 0 1-1.24.97L6.25 18.2a1 1 0 0 1-.75-.97V6.77a1 1 0 0 1 .75-.97Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="M7.2 8.45 17.2 5.9v5.35L7.2 8.45ZM7.2 15.55l10-2.8v5.35l-10-2.55Z" fill="currentColor" />
    </svg>
  )
}

function shortAddress(value: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return 'Account'
  return `${value.slice(0, 4)}…${value.slice(-2)}`
}

function avatarGradient(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  const hue = Math.abs(hash) % 360
  return `linear-gradient(135deg, hsl(${hue} 76% 58%), hsl(${(hue + 78) % 360} 70% 34%))`
}

function PolyDeskLaunchGate({ ready }: { ready: boolean }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#F5F5F7] px-5 py-24 text-gray-950 dark:bg-[#111113] dark:text-white">
      <header className="absolute inset-x-0 top-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">
          <span className="inline-flex items-center gap-2 text-sm font-bold tracking-tight">
            <PolymarketMark className="h-5 w-5" /> PolyDesk
          </span>
          <PrivyConnectButton
            debugLabel="polydesk-header-sign-in"
            loginOptions={{ loginMethods: ['email', 'wallet'] }}
            logoutOnAuthenticated={false}
            disabled={!ready}
            className="rounded-full border border-gray-200 bg-white px-3.5 py-2 text-[11px] font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/[0.09]"
          >
            Sign in
          </PrivyConnectButton>
        </div>
      </header>
      <section className="w-full max-w-sm text-center" aria-labelledby="polydesk-sign-in-title">
        <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <img
            src="/brand/polydesk-okx-avatar-bw.png"
            alt=""
            className="h-full w-full object-cover"
            onError={event => { event.currentTarget.style.display = 'none' }}
          />
        </div>
        <h1 id="polydesk-sign-in-title" className="mt-5 text-3xl font-black tracking-tight">PolyDesk</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your intelligent desk for prediction markets.</p>

        <PrivyConnectButton
          debugLabel="polydesk-launch-email"
          loginOptions={{ loginMethods: ['email'] }}
          logoutOnAuthenticated={false}
          disabled={!ready}
          className="mt-8 flex w-full items-center justify-center rounded-2xl bg-gray-950 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          {ready ? 'Sign in with email' : 'Preparing sign in…'}
        </PrivyConnectButton>

        <p className="mt-5 text-xs font-medium text-gray-400 dark:text-gray-500">Already registered on Polymarket?</p>
        <PrivyConnectButton
          debugLabel="polydesk-launch-wallet"
          loginOptions={{ loginMethods: ['wallet'] }}
          logoutOnAuthenticated={false}
          disabled={!ready}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-sm font-bold text-gray-900 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]"
        >
          <Wallet className="h-4 w-4" />
          Connect external wallet
        </PrivyConnectButton>
        <p className="mt-5 text-[11px] leading-5 text-gray-400 dark:text-gray-500">Secure access powered by Privy. PolyDesk never asks for your private key.</p>
      </section>
    </main>
  )
}

type UtilityItem = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  to?: string
  onClick?: () => void
  active?: boolean
}

function WorkspaceUtilityPill({ label, items }: { label: string; items: UtilityItem[] }) {
  return (
    <nav aria-label={label} className="inline-flex w-full max-w-md items-center justify-between gap-1 rounded-full border border-white/10 bg-[#0D0D0D] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      {items.map(item => {
        const Icon = item.icon
        const classes = cn(
          'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 text-[10px] font-bold transition-all sm:text-[11px]',
          item.active
            ? 'bg-white text-gray-950 shadow-sm'
            : 'text-gray-500 hover:bg-white/[0.06] hover:text-gray-200',
        )
        const content = <><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></>
        return item.to ? (
          <Link key={item.id} to={item.to} className={classes} aria-current={item.active ? 'page' : undefined}>{content}</Link>
        ) : (
          <button key={item.id} type="button" onClick={item.onClick} className={classes}>{content}</button>
        )
      })}
    </nav>
  )
}

function PolyDeskWorkspace() {
  const [searchParams] = useSearchParams()
  const { authenticated, logout, ready, user } = usePrivy()
  const { wallets } = useWallets()
  const [accountOpen, setAccountOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('polydesk-theme') === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('polydesk-theme', theme)
  }, [theme])

  const service = searchParams.get('service') ?? ''
  const portfolioAction = searchParams.get('portfolio') ?? 'watch'
  const workspace: Workspace = service === 'portfolio'
    ? 'portfolio'
    : service === 'worldcup' || service === 'worldcup-news' || service === 'worldcup-scores' || service === 'lp-scout'
      ? 'trade'
      : 'agent'

  const walletAddress = wallets.find(wallet => /^0x[a-fA-F0-9]{40}$/.test(wallet.address ?? ''))?.address ?? ''
  const identitySeed = walletAddress || user?.id || 'polydesk'

  function makeTo(nextService?: string, extra: Record<string, string> = {}) {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('lane')
    next.delete('lpScoutPath')
    next.delete('portfolio')
    next.delete('wallet')
    if (nextService) next.set('service', nextService)
    else next.delete('service')
    Object.entries(extra).forEach(([key, value]) => next.set(key, value))
    const query = next.toString()
    return `/polydesk${query ? `?${query}` : ''}`
  }

  const navItems = [
    { id: 'agent', label: 'Desk Agent', to: makeTo(), active: workspace === 'agent' },
    { id: 'portfolio', label: 'Portfolio', to: makeTo('portfolio', { portfolio: 'watch' }), active: workspace === 'portfolio' },
    { id: 'trade', label: 'Trade', to: makeTo('worldcup-scores'), active: workspace === 'trade' },
  ] as const

  const portfolioItems: UtilityItem[] = [
    { id: 'watch', label: 'Watch', icon: Eye, to: makeTo('portfolio', { portfolio: 'watch' }), active: portfolioAction === 'watch' },
    { id: 'wallet', label: 'Wallet', icon: Wallet, to: makeTo('portfolio', { portfolio: 'trading', wallet: 'balance' }), active: portfolioAction === 'trading' },
    { id: 'external', label: 'External', icon: ArrowLeftRight, to: makeTo('portfolio', { portfolio: 'external' }), active: portfolioAction === 'external' },
    { id: 'x402', label: 'Fund x402', icon: CircleDollarSign, to: makeTo('portfolio', { portfolio: 'x402' }), active: portfolioAction === 'x402' },
  ]

  const tradeItems: UtilityItem[] = [
    { id: 'worldcup', label: 'World Cup', icon: Trophy, to: makeTo('worldcup-scores'), active: service === 'worldcup' || service === 'worldcup-scores' },
    { id: 'news', label: 'News', icon: Newspaper, to: makeTo('worldcup-news'), active: service === 'worldcup-news' },
    { id: 'scout', label: 'LP Scout', icon: Radar, to: makeTo('lp-scout'), active: service === 'lp-scout' },
    { id: 'theme', label: 'Theme', icon: theme === 'dark' ? Sun : Moon, onClick: () => setTheme(value => value === 'dark' ? 'light' : 'dark') },
  ]

  if (!ready || !authenticated) return <PolyDeskLaunchGate ready={ready} />

  async function copyWallet() {
    if (!walletAddress || !navigator.clipboard) return
    await navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F7] font-inter dark:bg-[#111113]">
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl dark:border-white/5 dark:bg-[#111113]/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pb-2 pt-3 sm:px-6">
          <Link to="/polydesk" className="group flex items-center gap-2.5 focus:outline-none">
            <span className="flex h-8 w-8 items-center justify-center text-gray-900 transition-transform group-hover:scale-105 dark:text-white">
              <PolymarketMark className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">PolyDesk</span>
          </Link>

          <nav aria-label="PolyDesk" className="hidden items-center rounded-full border border-gray-200 bg-gray-50/80 p-0.5 dark:border-white/10 dark:bg-[#1c1c20] sm:flex">
            {navItems.map(item => (
              <Link
                key={item.id}
                to={item.to}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-all',
                  item.active ? 'bg-white text-gray-900 shadow-sm dark:text-gray-950' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                )}
                aria-current={item.active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountOpen(value => !value)}
              aria-expanded={accountOpen}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-2.5 text-[11px] font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-[#1c1c20] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              <span className="h-7 w-7 rounded-full ring-1 ring-black/5" style={{ background: avatarGradient(identitySeed) }} aria-hidden="true" />
              <span>{shortAddress(walletAddress)}</span>
            </button>
            {accountOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#1c1c20]">
                {walletAddress && (
                  <button type="button" onClick={() => void copyWallet()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]">
                    <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy address'}
                  </button>
                )}
                <button type="button" onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-5xl px-4 pb-3 sm:hidden">
          <nav aria-label="PolyDesk" className="grid w-full grid-cols-3 gap-1 rounded-full border border-gray-200 bg-gray-50/80 p-0.5 dark:border-white/10 dark:bg-[#1c1c20]">
            {navItems.map(item => (
              <Link key={item.id} to={item.to} className={cn('rounded-full px-2 py-1.5 text-center text-[10px] font-semibold transition-all', item.active ? 'bg-white text-gray-900 shadow-sm dark:text-gray-950' : 'text-gray-400')}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      {workspace !== 'agent' && (
        <footer className="border-t border-gray-100 bg-white/60 py-3 dark:border-white/5 dark:bg-[#111113]/70">
          <div className="mx-auto flex w-full max-w-5xl justify-center px-4 sm:px-6">
            <WorkspaceUtilityPill
              label={workspace === 'portfolio' ? 'Portfolio tools' : 'Trade tools'}
              items={workspace === 'portfolio' ? portfolioItems : tradeItems}
            />
          </div>
        </footer>
      )}
    </div>
  )
}

function PolyDeskAuthUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F7] px-5 dark:bg-[#111113]">
      <section className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
        <h1 className="text-xl font-black">PolyDesk sign in is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Privy must be configured before the public workspace can open.</p>
      </section>
    </main>
  )
}

export default function PolyDeskLayout() {
  if (!PRIVY_AUTH_ENABLED) return <PolyDeskAuthUnavailable />
  return <PolyDeskWorkspace />
}
