import { useEffect, useState } from 'react'
import { Link, Outlet, useSearchParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  Copy,
  LogOut,
  Mic2,
  Moon,
  Sun,
  UserRound,
} from 'lucide-react'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { cn } from '../lib/utils'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'

type Workspace = 'overview' | 'scout' | 'activity'

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

function LaunchIdentitySequence() {
  return (
    <div className="polydesk-launch-identity" aria-hidden="true">
      <span className="polydesk-launch-identity__halo" />
      <span className="polydesk-launch-identity__stage polydesk-launch-identity__human">
        <UserRound />
      </span>
      <span className="polydesk-launch-identity__stage polydesk-launch-identity__voice">
        <Mic2 />
        <span className="polydesk-launch-identity__signal"><i /><i /><i /></span>
      </span>
      <span className="polydesk-launch-identity__stage polydesk-launch-identity__mark">
        <PolymarketMark />
      </span>
      <span className="polydesk-launch-identity__market-dot polydesk-launch-identity__market-dot--one" />
      <span className="polydesk-launch-identity__market-dot polydesk-launch-identity__market-dot--two" />
    </div>
  )
}

function PolyDeskLaunchGate({
  ready,
  theme,
  onToggleTheme,
}: {
  ready: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#f7f7f9] text-gray-950 dark:bg-[#111113] dark:text-white">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.95),transparent_38%),radial-gradient(circle_at_12%_76%,rgba(96,165,250,0.14),transparent_34%),radial-gradient(circle_at_88%_68%,rgba(167,139,250,0.13),transparent_32%)] dark:bg-[radial-gradient(ellipse_at_50%_16%,rgba(255,255,255,0.075),transparent_32%),radial-gradient(ellipse_at_50%_100%,rgba(255,255,255,0.025),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.22] [background-image:linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(circle_at_center,black,transparent_76%)] dark:opacity-0" />
      <div className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden dark:block" aria-hidden="true">
        <span className="absolute -bottom-[52%] -left-[18%] h-[72%] w-[88%] rounded-[50%] border border-white/[0.035]" />
        <span className="absolute -bottom-[46%] -left-[10%] h-[66%] w-[84%] rounded-[50%] border border-white/[0.045]" />
        <span className="absolute -bottom-[54%] -right-[24%] h-[78%] w-[92%] rounded-[50%] border border-white/[0.03]" />
        <span className="absolute left-1/2 top-[20%] h-px w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <header className="relative z-10 w-full shrink-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">
          <span className="inline-flex items-center gap-2 text-sm font-bold tracking-tight">
            <PolymarketMark className="h-5 w-5" /> PolyDesk
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/70 bg-white/55 text-gray-500 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-400 dark:hover:bg-white/[0.10] dark:hover:text-white"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>
      <section className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12 text-center" aria-labelledby="polydesk-sign-in-title">
        <LaunchIdentitySequence />
        <h1 id="polydesk-sign-in-title" className="mt-5 text-3xl font-black tracking-tight">PolyDesk</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your intelligent desk for prediction markets.</p>

        <PrivyConnectButton
          debugLabel="polydesk-launch-continue"
          loginOptions={{ loginMethods: ['email', 'wallet'] }}
          logoutOnAuthenticated={false}
          disabled={!ready}
          className="mx-auto mt-7 flex min-h-11 w-full max-w-xs items-center justify-center rounded-full bg-gray-950 px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[0_14px_34px_rgba(15,23,42,0.22)] disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:shadow-[0_10px_34px_rgba(0,0,0,0.35)] dark:hover:bg-gray-100"
        >
          {ready ? 'Continue' : 'Preparing sign in…'}
        </PrivyConnectButton>

        <p className="mt-4 text-[11px] leading-5 text-gray-400 dark:text-gray-500">Continue with email or your existing wallet. PolyDesk never asks for your private key.</p>
      </section>
      <footer className="relative z-10 flex h-[60px] shrink-0 items-center border-t border-gray-100 bg-white/50 py-0 dark:border-white/5 dark:bg-[#111113]/50">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <p className="text-center text-xs text-gray-400">
            <span className="polydesk-powered-footer">
              <span>Powered by</span>
              <strong>Hash PayLink</strong>
            </span>
          </p>
        </div>
      </footer>
    </main>
  )
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
  const workspace: Workspace = service === 'activity'
    ? 'activity'
    : service === 'worldcup' || service === 'worldcup-news' || service === 'worldcup-scores' || service === 'football' || service === 'lp-scout'
      ? 'scout'
      : 'overview'

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
    { id: 'overview', label: 'Overview', to: makeTo('portfolio', { portfolio: 'trading', wallet: 'balance' }), active: workspace === 'overview' },
    { id: 'scout', label: 'LP Scout', to: makeTo('lp-scout'), active: workspace === 'scout' },
    { id: 'activity', label: 'Activity', to: makeTo('activity'), active: workspace === 'activity' },
  ] as const

  if (!ready || (authenticated && !walletsReady)) {
    return <PolyDeskLoadingState fullScreen label="Restoring your desk" />
  }

  if (!authenticated) {
    return (
      <PolyDeskLaunchGate
        ready
        theme={theme}
        onToggleTheme={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}
      />
    )
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
          <Link to="/polydesk?service=portfolio&portfolio=trading&wallet=balance" className="group flex items-center gap-2.5 focus:outline-none">
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
                <span className="inline-flex items-center gap-1.5">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

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
        </div>

        <div className="mx-auto flex max-w-5xl px-4 pb-3 sm:hidden">
          <nav aria-label="PolyDesk" className="grid w-full grid-cols-3 gap-1 rounded-full border border-gray-200 bg-gray-50/80 p-0.5 dark:border-white/10 dark:bg-[#1c1c20]">
            {navItems.map(item => (
              <Link key={item.id} to={item.to} className={cn('rounded-full px-2 py-1.5 text-center text-[10px] font-semibold transition-all', item.active ? 'bg-white text-gray-900 shadow-sm dark:text-gray-950' : 'text-gray-400')}>
                <span className="inline-flex items-center gap-1">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main data-polydesk-product-ui className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
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
