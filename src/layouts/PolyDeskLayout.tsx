import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useSearchParams } from 'react-router-dom'
import { History, Moon, Sun } from 'lucide-react'

function PolymarketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M6.25 5.8 18.4 2.75a1 1 0 0 1 1.24.97v16.56a1 1 0 0 1-1.24.97L6.25 18.2a1 1 0 0 1-.75-.97V6.77a1 1 0 0 1 .75-.97Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 8.45 17.2 5.9v5.35L7.2 8.45ZM7.2 15.55l10-2.8v5.35l-10-2.55Z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function PolyDeskLayout() {
  const [searchParams] = useSearchParams()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('polydesk-theme') === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('polydesk-theme', theme)
  }, [theme])

  const polyDeskNavItems = useMemo(() => {
    const polyDeskService = searchParams.get('service') ?? ''
    const polyDeskLane = searchParams.get('lane') ?? ''
    const polyDeskAgentOpen = searchParams.get('agent') === '1'
    const activePolyDeskNav = polyDeskAgentOpen || polyDeskLane || !polyDeskService
      ? 'agent'
      : polyDeskService === 'portfolio'
        ? 'portfolio'
        : polyDeskService === 'worldcup' || polyDeskService === 'worldcup-news' || polyDeskService === 'worldcup-scores'
          ? 'worldcup'
          : polyDeskService === 'lp-scout'
            ? 'lp-scout'
            : 'agent'

    const makePolyDeskNavTo = (id: 'agent' | 'portfolio' | 'worldcup' | 'lp-scout') => {
      const next = new URLSearchParams(searchParams)
      next.delete('lane')
      if (id === 'agent') {
        next.delete('agent')
        next.delete('service')
      } else {
        next.delete('agent')
        next.set('service', id)
      }
      const qs = next.toString()
      return `/polydesk${qs ? `?${qs}` : ''}`
    }

    return [
      { label: 'Desk Agent', id: 'agent', to: makePolyDeskNavTo('agent'), active: activePolyDeskNav === 'agent' },
      { label: 'Portfolio', id: 'portfolio', to: makePolyDeskNavTo('portfolio'), active: activePolyDeskNav === 'portfolio' },
      { label: 'World Cup', id: 'worldcup', to: makePolyDeskNavTo('worldcup'), active: activePolyDeskNav === 'worldcup' },
      { label: 'LP Scout', id: 'lp-scout', to: makePolyDeskNavTo('lp-scout'), active: activePolyDeskNav === 'lp-scout' },
    ] as const
  }, [searchParams])

  function openPaymentHistory() {
    const next = new URLSearchParams(searchParams)
    next.set('service', 'portfolio')
    next.set('portfolio', 'trading')
    const qs = next.toString()
    window.location.assign(`/polydesk${qs ? `?${qs}` : ''}`)
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

          <div className="flex items-center gap-x-2">
            <div className="hidden items-center rounded-full border border-gray-200 bg-gray-50/80 p-0.5 dark:border-white/10 dark:bg-[#1c1c20] sm:flex">
              {polyDeskNavItems.map(item => (
                <Link
                  key={item.id}
                  to={item.to}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                  style={item.active
                    ? { background: '#ffffff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { color: '#9ca3af' }}
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            <button
              type="button"
              onClick={openPaymentHistory}
              aria-label="Open payment history"
              title="History"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-[#1c1c20] dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
            >
              <History className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-[#1c1c20] dark:text-gray-400 dark:hover:bg-white/5"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-5xl px-4 pb-3 sm:hidden">
          <div className="grid w-full grid-cols-4 gap-1 rounded-full border border-gray-200 bg-gray-50/80 p-0.5 dark:border-white/10 dark:bg-[#1c1c20]">
            {polyDeskNavItems.map(item => (
              <Link
                key={item.id}
                to={item.to}
                className={[
                  'rounded-full px-2 py-1.5 text-center text-[10px] font-semibold transition-all',
                  item.active
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white dark:text-gray-950'
                    : 'text-gray-400',
                ].join(' ')}
              >
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Outlet />
      </main>

      <footer className="flex h-[60px] items-center border-t border-gray-100 bg-white/50 py-0 dark:border-white/5 dark:bg-[#111113]/50">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <p className="text-center text-xs text-gray-400">
            <span className="polydesk-powered-footer">
              <span>Powered by</span>
              <strong>Hash PayLink</strong>
            </span>
          </p>
        </div>
      </footer>
    </div>
  )
}
