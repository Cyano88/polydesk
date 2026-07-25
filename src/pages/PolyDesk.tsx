import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { usePrivyLoginLauncher } from '../lib/PrivyLoginProvider'
import AgentWorkspace from './AgentWorkspace'
import TradeActivity from './TradeActivity'
import { LpScoutPanel, type LpScoutPrefill } from './LpScoutPanel'
import { PolymarketOpenOrdersPanel } from '../components/PolymarketLimitOrderTicket'
import Pulse from './Pulse'
import PolyDeskAgentIcon from '../components/PolyDeskAgentIcon'
import {
  PolyPortfolioPanel,
  PolyStreamPanel,
  PolyWorldCupHubPanel,
  PolyWorldCupNewsPanel,
  TelegramHelperPanel,
} from './TelegramPaymentLinks'

type PolyDeskLane = 'portfolio' | 'worldcup' | 'lp-scout'
type PolyDeskServiceView = '' | PolyDeskLane | 'football' | 'worldcup-news' | 'worldcup-scores' | 'pulse' | 'activity'
type PortfolioAction = 'watch' | 'trading' | 'external' | 'x402'

function normalizeLane(value: string | null): PolyDeskLane | '' {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' ? value : ''
}

function normalizeServiceView(value: string | null): PolyDeskServiceView {
  return value === 'portfolio' || value === 'worldcup' || value === 'football' || value === 'lp-scout' || value === 'worldcup-news' || value === 'worldcup-scores' || value === 'pulse' || value === 'activity'
    ? value
    : ''
}

function normalizePortfolioAction(value: string | null): PortfolioAction {
  return value === 'watch' || value === 'external' || value === 'x402' ? value : 'trading'
}

function LocalPreviewOverview({
  onWatch = () => undefined,
  onTip = () => undefined,
}: {
  onWatch?: () => void
  onTip?: () => void
}) {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Overview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">Portfolio</h1>
      </div>
      <div className="polydesk-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Total value</p>
        <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white">—</p>
        <p className="mt-1 text-xs text-gray-400">Connect your account to load live balances.</p>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-gray-100 pt-4 dark:border-white/10">
          {['Trading balance', 'Open positions', 'Claimable'].map(label => (
            <div key={label}>
              <p className="text-[10px] leading-4 text-gray-400">{label}</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">—</p>
            </div>
          ))}
        </div>
      </div>
      <OverviewActions onWatch={onWatch} onTip={onTip} />
    </section>
  )
}

function OverviewActions({
  onWatch,
  onTip,
}: {
  onWatch: () => void
  onTip: () => void
}) {
  const actions = [
    {
      label: 'Watch portfolio',
      body: 'Track any public Polymarket account.',
      onClick: onWatch,
    },
    {
      label: 'Tip',
      body: 'Send USDC to a Polymarket wallet.',
      onClick: onTip,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Portfolio actions">
      {actions.map(action => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="polydesk-card group min-h-28 p-4 text-left transition-colors hover:border-gray-300 dark:hover:border-white/20"
        >
          <span className="flex items-center justify-between gap-3">
            <strong className="text-sm font-semibold text-gray-950 dark:text-white">{action.label}</strong>
            <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="mt-2 block text-xs leading-5 text-gray-500 dark:text-gray-400">{action.body}</span>
        </button>
      ))}
    </div>
  )
}

function OverviewTabs({
  active,
  onPortfolio,
  onActivity,
}: {
  active: 'portfolio' | 'activity'
  onPortfolio: () => void
  onActivity: () => void
}) {
  return (
    <div className="sticky top-[61px] z-30 mb-4 grid grid-cols-2 gap-1 rounded-xl border border-gray-200/80 bg-gray-100/95 p-1 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#1c1c20]/95" aria-label="Overview sections">
      {[
        { id: 'portfolio', label: 'Portfolio', onClick: onPortfolio },
        { id: 'activity', label: 'Activity', onClick: onActivity },
      ].map(item => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          aria-pressed={active === item.id}
          className={cn(
            'min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
            active === item.id
              ? '!bg-white !text-gray-950 shadow-sm'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default function PolyDesk() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = usePrivy()
  const loginLauncher = usePrivyLoginLauncher()
  const activeLane = normalizeLane(searchParams.get('lane'))
  const localPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const browsePreview = localPreview || !user
  const activeServiceView = normalizeServiceView(searchParams.get('service'))
  const portfolioAction = normalizePortfolioAction(searchParams.get('portfolio'))
  const agentRouteOpen = searchParams.get('agent') === '1'
  const lpScoutActivityId = searchParams.get('lpScoutActivity')?.trim() ?? ''
  const lpScoutReceiptId = searchParams.get('lpScoutReceipt')?.trim() ?? ''
  const lpScoutReceiptUrl = searchParams.get('lpScoutReceiptUrl')?.trim() ?? ''
  const lpScoutAgentSlug = searchParams.get('lpScoutAgent')?.trim() ?? ''
  const agentMessage = searchParams.get('agentMessage')?.trim() ?? ''
  const effectiveAgentLane = activeLane || (lpScoutActivityId ? 'lp-scout' : '')
  const [isAgentOpen, setIsAgentOpen] = useState(Boolean(effectiveAgentLane || agentRouteOpen))
  const [serviceView, setServiceView] = useState<PolyDeskServiceView>(activeServiceView || 'pulse')
  const [previousServiceView, setPreviousServiceView] = useState<PolyDeskServiceView>('')
  const [lpScoutPrefill, setLpScoutPrefill] = useState<LpScoutPrefill | null>(null)
  const helperKey = effectiveAgentLane || 'choose-lane'
  const welcomeText = 'Welcome back. Ask about your Polymarket account, live football, latest news, LP Scout, and market context.'

  function requestIdentity(action: 'watch-portfolio' | 'tip') {
    loginLauncher?.requestLogin({ debugLabel: `polydesk-public-${action}` })
  }

  const ownerKey = useMemo(() => {
    const email = searchParams.get('email')?.trim().toLowerCase()
    const wallet = searchParams.get('wallet')?.trim().toLowerCase()
    const privyIdentity = user?.id?.trim()
    return email
      ? `email:${email}`
      : wallet
        ? `wallet:${wallet}`
        : privyIdentity
          ? `identity:${privyIdentity}`
          : localPreview
            ? 'polydesk-preview-agent'
            : 'polydesk-web'
  }, [localPreview, searchParams, user?.id])

  function openServiceView(view: PolyDeskServiceView, trackPrevious = true) {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('lane')
    if (view) next.set('service', view)
    else next.delete('service')
    setSearchParams(next, { replace: false })
    setIsAgentOpen(false)
    if (trackPrevious) setPreviousServiceView(serviceView)
    setServiceView(view)
    window.setTimeout(() => {
      document.querySelector('[data-polydesk-service-view="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)
  }

  function openPortfolioAction(action: Extract<PortfolioAction, 'watch' | 'external'>) {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('lane')
    next.set('service', 'portfolio')
    next.set('portfolio', action)
    next.delete('wallet')
    setSearchParams(next, { replace: false })
    setIsAgentOpen(false)
    setServiceView('portfolio')
  }

  function openOverviewTab(tab: 'portfolio' | 'activity') {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('lane')
    if (tab === 'activity') {
      next.set('service', 'activity')
      next.delete('portfolio')
      next.delete('wallet')
      setServiceView('activity')
    } else {
      next.set('service', 'portfolio')
      next.set('portfolio', 'trading')
      next.set('wallet', 'balance')
      setServiceView('portfolio')
    }
    setSearchParams(next, { replace: false })
    setIsAgentOpen(false)
  }

  function backToServiceParent(parent: PolyDeskServiceView) {
    const target = previousServiceView || parent
    setPreviousServiceView('')
    openServiceView(target, false)
  }

  function closeServiceView() {
    setServiceView('')
    setLpScoutPrefill(null)
    const next = new URLSearchParams(searchParams)
    next.delete('service')
    setSearchParams(next, { replace: false })
  }

  useEffect(() => {
    setIsAgentOpen(Boolean(activeLane || agentRouteOpen))
  }, [activeLane, agentRouteOpen])

  useEffect(() => {
    setServiceView(activeServiceView || 'pulse')
    if (activeServiceView) {
      setIsAgentOpen(false)
    }
  }, [activeServiceView])

  useEffect(() => {
    const legacyService = searchParams.get('service')
    if (legacyService !== 'app-pay' && legacyService !== 'marketplace') return
    const next = new URLSearchParams(searchParams)
    next.set('service', 'lp-scout')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return (
    <main className={cn('text-gray-950 dark:text-white', isAgentOpen && 'h-full min-h-0')}>
      <div className={cn(
        'mx-auto w-full space-y-5',
        isAgentOpen
          ? 'h-full min-h-0 max-w-3xl !space-y-0'
          : serviceView === 'football' || serviceView === 'worldcup-news' || serviceView === 'worldcup-scores' || serviceView === 'pulse' || serviceView === 'activity' ? 'max-w-2xl' : 'max-w-md',
      )}>
        {!isAgentOpen && !serviceView && (
          browsePreview ? (
            <LocalPreviewOverview
              onWatch={() => requestIdentity('watch-portfolio')}
              onTip={() => requestIdentity('tip')}
            />
          ) : (
            <>
              <PolyPortfolioPanel
                onBack={() => undefined}
                onOpenLpScout={() => openServiceView('lp-scout')}
                onOpenWorldCup={() => openServiceView('football')}
                telegramOwner={ownerKey}
                telegramId=""
                surface="standalone"
                initialPortfolioAction="trading"
                initialTradingWalletTab="balance"
              />
              <PolymarketOpenOrdersPanel />
            </>
          )
        )}

        {isAgentOpen && (
          <section className="flex h-full min-h-0 flex-col bg-white dark:bg-[#111114]">
            <header className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/10">
              <span className="text-gray-800 dark:text-gray-100">
                <PolyDeskAgentIcon header isStatic />
              </span>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-gray-950 dark:text-white">PolyDesk Agent</h1>
                <p className="text-[11px] text-gray-400">Prediction-market intelligence</p>
              </div>
            </header>
            <TelegramHelperPanel
              key={helperKey}
              telegramName="there"
              ownerKey={ownerKey}
              telegramId=""
              fallbackOwner="polydesk-web"
              initialEventId=""
              initialPayer={ownerKey}
              initialHelperMode="polydesk"
              initialPolyDeskSubMode={effectiveAgentLane}
              initialNotice=""
              lockedHelperMode="polydesk"
              welcomeText={welcomeText}
              welcomeAction={{
                prefix: 'PolyDesk Agent is live on the OKX AI marketplace, where other agents can plug in, build with, or resell its intelligence services.',
                label: 'okx.ai/agents/5427…',
                url: 'https://www.okx.ai/agents/5427?source=search',
                suffix: 'Circle agent marketplace listing coming soon.',
              }}
              inputPlaceholder="Ask Desk Agent..."
              hideTopDivider
              autoQuestion={agentMessage || undefined}
              autoQuestionKey={lpScoutActivityId ? `lp-scout:${lpScoutActivityId}` : undefined}
              lpScoutActivityId={lpScoutActivityId || undefined}
              lpScoutReceiptId={lpScoutReceiptId || undefined}
              lpScoutReceiptUrl={lpScoutReceiptUrl || undefined}
              lpScoutAgentSlug={lpScoutAgentSlug || undefined}
              singlePolyDeskAgent
              immersive
              onRecoverTelegramName={() => undefined}
              onBack={() => {
                if (effectiveAgentLane) {
                  const next = new URLSearchParams(searchParams)
                  next.delete('lane')
                  setSearchParams(next, { replace: false })
                }
              }}
            />
          </section>
        )}

        {serviceView && !isAgentOpen && (
          <section
            data-polydesk-service-view="true"
            className="p-0"
          >
            {serviceView === 'activity' ? (
              <>
                <OverviewTabs
                  active="activity"
                  onPortfolio={() => openOverviewTab('portfolio')}
                  onActivity={() => undefined}
                />
                <TradeActivity />
              </>
            ) : serviceView === 'pulse' ? (
              <Pulse />
            ) : serviceView === 'portfolio' ? (
              <>
                <OverviewTabs
                  active="portfolio"
                  onPortfolio={() => undefined}
                  onActivity={() => openOverviewTab('activity')}
                />
                {browsePreview ? (
                  <LocalPreviewOverview
                    onWatch={() => requestIdentity('watch-portfolio')}
                    onTip={() => requestIdentity('tip')}
                  />
                ) : (
                  <>
                  {portfolioAction === 'trading' && (
                    <OverviewActions
                      onWatch={() => openPortfolioAction('watch')}
                      onTip={() => openPortfolioAction('external')}
                    />
                  )}
                  <PolyPortfolioPanel
                    onBack={closeServiceView}
                    onOpenLpScout={() => openServiceView('lp-scout')}
                    onOpenWorldCup={() => openServiceView('football')}
                    telegramOwner={ownerKey}
                    telegramId=""
                    surface="standalone"
                    initialPortfolioAction={portfolioAction}
                    initialTradingWalletTab={searchParams.get('wallet') === 'balance' ? 'balance' : undefined}
                  />
                  {portfolioAction === 'trading' && <PolymarketOpenOrdersPanel />}
                  </>
                )}
              </>
            ) : serviceView === 'football' ? (
              <PolyStreamPanel
                hideBack
                onBack={() => openServiceView('lp-scout')}
              />
            ) : serviceView === 'worldcup' ? (
              <PolyWorldCupHubPanel
                onBack={closeServiceView}
                onOpenNews={() => openServiceView('worldcup-news')}
                onOpenScores={() => openServiceView('worldcup-scores')}
              />
            ) : serviceView === 'worldcup-news' ? (
              <PolyWorldCupNewsPanel
                hideBack
                onBack={() => backToServiceParent('worldcup')}
                onOpenLpScout={prefill => {
                  setLpScoutPrefill(prefill)
                  openServiceView('lp-scout')
                }}
              />
            ) : serviceView === 'worldcup-scores' ? (
              <PolyStreamPanel
                hideBack
                onBack={() => backToServiceParent('worldcup')}
              />
            ) : serviceView === 'lp-scout' && searchParams.get('run') === 'polymarket-scout' ? (
              <AgentWorkspace />
            ) : (
              <LpScoutPanel
                hideBack
                prefill={lpScoutPrefill}
                onPrefillConsumed={() => setLpScoutPrefill(null)}
                onBack={closeServiceView}
              />
            )}
          </section>
        )}
      </div>
    </main>
  )
}
