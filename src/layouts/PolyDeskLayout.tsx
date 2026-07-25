import { useEffect, useState } from 'react'
import { Link, Outlet, useSearchParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  Activity as PulseIcon,
  Copy,
  LayoutDashboard,
  LogOut,
  Moon,
  Radar,
  Sun,
} from 'lucide-react'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { cn } from '../lib/utils'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'
import PolyDeskAgentIcon from '../components/PolyDeskAgentIcon'

type Workspace = 'overview' | 'agent' | 'scout' | 'pulse'

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

function PolyDeskWorkspace() {
  const [searchParams] = useSearchParams()
  const { authenticated, logout, ready, user } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
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
  const agentOpen = searchParams.get('agent') === '1' || Boolean(searchParams.get('lane'))
  const localPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const previewMode = localPreview || !authenticated
  const workspace: Workspace = agentOpen
    ? 'agent'
    : service === 'pulse'
      ? 'pulse'
    : service === 'worldcup' || service === 'worldcup-news' || service === 'worldcup-scores' || service === 'football' || service === 'lp-scout'
      ? 'scout'
      : service === 'portfolio' || service === 'activity'
        ? 'overview'
        : 'pulse'

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

  function makeAgentTo() {
    const next = new URLSearchParams(searchParams)
    next.delete('service')
    next.delete('lane')
    next.delete('lpScoutPath')
    next.delete('portfolio')
    next.delete('wallet')
    next.set('agent', '1')
    const query = next.toString()
    return `/polydesk${query ? `?${query}` : ''}`
  }

  const navItems = [
    { id: 'pulse', label: 'Pulse', icon: PulseIcon, to: makeTo('pulse'), active: workspace === 'pulse' },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, to: makeTo('portfolio', { portfolio: 'trading', wallet: 'balance' }), active: workspace === 'overview' },
    { id: 'agent', label: 'Agent', icon: null, to: makeAgentTo(), active: workspace === 'agent' },
    { id: 'scout', label: 'LP Scout', icon: Radar, to: makeTo('lp-scout'), active: workspace === 'scout' },
  ] as const

  if (!localPreview && (!ready || (authenticated && !walletsReady))) {
    return <PolyDeskLoadingState fullScreen label="Restoring your desk" />
  }

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
          <Link to={makeTo('portfolio', { portfolio: previewMode ? 'preview' : 'trading', wallet: 'balance' })} className="group flex items-center gap-2.5 focus:outline-none">
            <span className="flex h-8 w-8 items-center justify-center text-gray-900 transition-transform group-hover:scale-105 dark:text-white">
              <PolymarketMark className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">PolyDesk</span>
          </Link>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-[#1c1c20] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            {authenticated ? (
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
            ) : !localPreview ? (
              <PrivyConnectButton
                debugLabel="polydesk-header-sign-in"
                loginOptions={{ loginMethods: ['email', 'wallet'] }}
                logoutOnAuthenticated={false}
                className="polydesk-primary-cta polydesk-primary-cta--compact"
              >
                Sign in
              </PrivyConnectButton>
            ) : null}
          </div>
        </div>

      </header>

      <main data-polydesk-product-ui className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-28 sm:px-6 sm:py-10 sm:pb-28">
        <Outlet />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-50 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <nav
          aria-label="PolyDesk workspace"
          className="mx-auto grid w-[min(26rem,calc(100%-2rem))] grid-cols-4 gap-1 rounded-2xl border border-gray-200/80 bg-white/90 p-1.5 shadow-[0_16px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-[#17171b]/92 dark:shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
        >
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <Link
                key={item.id}
                to={item.to}
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-950 dark:focus-visible:outline-white',
                  item.active
                    ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950 dark:shadow-[0_6px_20px_rgba(0,0,0,0.28)]'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/[0.07] dark:hover:text-gray-200',
                )}
              >
                {Icon
                  ? <Icon className="h-[17px] w-[17px]" strokeWidth={item.active ? 2.3 : 1.9} />
                  : <PolyDeskAgentIcon header isStatic className="!h-[17px] !w-[17px]" />}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </footer>
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
