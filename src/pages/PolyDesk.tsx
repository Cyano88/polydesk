import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { cn } from '../lib/utils'
import type { LpScoutPrefill } from './LpScoutPanel'
import Pulse from './Pulse'
import PolyDeskAgentIcon from '../components/PolyDeskAgentIcon'
import { PolyDeskLoadingState } from '../components/PolyDeskLoadState'

const AgentWorkspace = lazy(() => import('./AgentWorkspace'))
const TradeActivity = lazy(() => import('./TradeActivity'))
const LpScoutPanel = lazy(() => import('./LpScoutPanel').then(module => ({ default: module.LpScoutPanel })))
const PolymarketLimitOrderTicket = lazy(() => import('../components/PolymarketLimitOrderTicket').then(module => ({ default: module.PolymarketLimitOrderTicket })))
const PolyPortfolioPanel = lazy(() => import('./TelegramPaymentLinks').then(module => ({ default: module.PolyPortfolioPanel })))
const PolyStreamPanel = lazy(() => import('./TelegramPaymentLinks').then(module => ({ default: module.PolyStreamPanel })))
const PolyWorldCupHubPanel = lazy(() => import('./TelegramPaymentLinks').then(module => ({ default: module.PolyWorldCupHubPanel })))
const PolyWorldCupNewsPanel = lazy(() => import('./TelegramPaymentLinks').then(module => ({ default: module.PolyWorldCupNewsPanel })))
const TelegramHelperPanel = lazy(() => import('./TelegramPaymentLinks').then(module => ({ default: module.TelegramHelperPanel })))

type PolyDeskLane = 'portfolio' | 'worldcup' | 'lp-scout'
type PolyDeskServiceView = '' | PolyDeskLane | 'football' | 'worldcup-news' | 'worldcup-scores' | 'pulse' | 'activity'
type PortfolioAction = 'watch' | 'trading' | 'external' | 'x402'
type TradingWalletTab = 'balance' | 'fund' | 'withdraw' | 'positions' | 'monitor'

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

function normalizeTradingWalletTab(value: string | null): TradingWalletTab | undefined {
  return value === 'balance' || value === 'fund' || value === 'withdraw' || value === 'positions' || value === 'monitor'
    ? value
    : undefined
}

function LocalPreviewOverview({
}: Record<string, never>) {
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
    </section>
  )
}

export default function PolyDesk() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = usePrivy()
  const activeLane = normalizeLane(searchParams.get('lane'))
  const localPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const browsePreview = localPreview || !user
  const activeServiceView = normalizeServiceView(searchParams.get('service'))
  const portfolioAction = normalizePortfolioAction(searchParams.get('portfolio'))
  const tradingWalletTab = normalizeTradingWalletTab(searchParams.get('wallet'))
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
  const [watchedTrade, setWatchedTrade] = useState<{
    title: string
    marketUrl: string
    outcome: 'YES' | 'NO'
    price: number
  } | null>(null)
  const helperKey = effectiveAgentLane || 'choose-lane'
  const welcomeText = 'Welcome back. Ask about your portfolio, live football, football news, or LP opportunities.'

  const ownerKey = useMemo(() => {
    const privyIdentity = user?.id?.trim()
    return privyIdentity
      ? `identity:${privyIdentity}`
      : localPreview
        ? 'polydesk-preview-agent'
        : ''
  }, [localPreview, user?.id])

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

  useEffect(() => {
    if (!watchedTrade) return
    window.setTimeout(() => {
      document.querySelector('[data-polydesk-watched-trade="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)
  }, [watchedTrade])

  return (
    <main className={cn('text-gray-950 dark:text-white', isAgentOpen && 'h-full min-h-0 w-full')}>
      <div className={cn(
        'mx-auto w-full space-y-5',
        isAgentOpen
          ? 'h-full min-h-0 w-full !max-w-2xl !space-y-0'
          : serviceView === 'football' || serviceView === 'worldcup-news' || serviceView === 'worldcup-scores' || serviceView === 'pulse' || serviceView === 'activity' ? 'max-w-2xl' : 'max-w-md',
      )}>
        <Suspense fallback={<PolyDeskLoadingState label="Opening workspace" />}>
        {!isAgentOpen && !serviceView && (
          browsePreview ? (
            <LocalPreviewOverview />
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
                initialTradingWalletTab="positions"
              />
            </>
          )
        )}

        {isAgentOpen && (
          <section className="flex h-full min-h-0 w-full max-w-2xl flex-col bg-white dark:bg-[#111114]">
            <header className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/10">
              <span className="text-gray-800 dark:text-gray-100">
                <PolyDeskAgentIcon header isStatic />
              </span>
              <h1 className="min-w-0 text-sm font-semibold text-gray-950 dark:text-white">PolyDesk Agent</h1>
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
                prefix: 'PolyDesk Agent is live on OKX AI for agents to use or resell.',
                label: 'okx.ai/agents/5427…',
                url: 'https://www.okx.ai/agents/5427?source=search',
                suffix: 'Circle listing coming soon.',
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
              <TradeActivity />
            ) : serviceView === 'pulse' ? (
              <Pulse />
            ) : serviceView === 'portfolio' ? (
              <>
                {browsePreview && !searchParams.get('portfolio') ? (
                  <LocalPreviewOverview />
                ) : (
                  <>
                  <PolyPortfolioPanel
                    onBack={closeServiceView}
                    onOpenLpScout={() => openServiceView('lp-scout')}
                    onOpenWorldCup={() => openServiceView('football')}
                    telegramOwner={ownerKey}
                    telegramId=""
                    surface="standalone"
                    initialPortfolioAction={portfolioAction}
                    initialTradingWalletTab={tradingWalletTab}
                    onTradeWatchedPosition={setWatchedTrade}
                  />
                  {portfolioAction === 'watch' && watchedTrade && (
                    <section className="mt-4 scroll-mt-28" data-polydesk-watched-trade="true">
                      <PolymarketLimitOrderTicket
                        marketTitle={watchedTrade.title}
                        marketUrl={watchedTrade.marketUrl}
                        yesQuote={watchedTrade.outcome === 'YES' ? watchedTrade.price : 1 - watchedTrade.price}
                        noQuote={watchedTrade.outcome === 'NO' ? watchedTrade.price : 1 - watchedTrade.price}
                        initialOutcome={watchedTrade.outcome}
                        orderSource="watch-position"
                      />
                    </section>
                  )}
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
        </Suspense>
      </div>
    </main>
  )
}
