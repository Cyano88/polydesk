import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '../lib/utils'
import AppPay from './AppPay'
import TradeActivity from './TradeActivity'
import {
  LpScoutPanel,
  type LpScoutPrefill,
  PolyPortfolioPanel,
  PolyStreamPanel,
  PolyWorldCupHubPanel,
  PolyWorldCupNewsPanel,
  TelegramHelperPanel,
} from './TelegramPaymentLinks'

type PolyDeskLane = 'portfolio' | 'worldcup' | 'lp-scout'
type PolyDeskServiceView = '' | PolyDeskLane | 'worldcup-news' | 'worldcup-scores' | 'activity' | 'app-pay' | 'marketplace'
type PortfolioAction = 'watch' | 'trading' | 'external' | 'x402'

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

function PolyDeskLiveAgentIcon({ isStatic = false }: { isStatic?: boolean }) {
  return (
    <span className={cn('polydesk-live-agent', isStatic && 'polydesk-live-agent--static')} aria-hidden="true">
      <PolymarketMark className="polydesk-live-agent__mark" />
      <span className="ask-hash-live-agent__bubble">
        <span />
        <span />
        <span />
      </span>
    </span>
  )
}

function normalizeLane(value: string | null): PolyDeskLane | '' {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' ? value : ''
}

function normalizeServiceView(value: string | null): PolyDeskServiceView {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' || value === 'worldcup-news' || value === 'worldcup-scores' || value === 'activity' || value === 'app-pay' || value === 'marketplace'
    ? value
    : ''
}

function normalizePortfolioAction(value: string | null): PortfolioAction {
  return value === 'trading' || value === 'external' || value === 'x402' ? value : 'watch'
}

export default function PolyDesk() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeLane = normalizeLane(searchParams.get('lane'))
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
  const [agentLane, setAgentLane] = useState<PolyDeskLane | ''>(effectiveAgentLane)
  const [serviceView, setServiceView] = useState<PolyDeskServiceView>(activeServiceView)
  const [previousServiceView, setPreviousServiceView] = useState<PolyDeskServiceView>('')
  const [lpScoutPrefill, setLpScoutPrefill] = useState<LpScoutPrefill | null>(null)
  const [polyDeskResetSignal, setPolyDeskResetSignal] = useState(0)
  const helperKey = effectiveAgentLane || 'choose-lane'
  const welcomeText = 'Welcome back, there. Ask me about Polymarket funding, portfolio, World Cup markets, LP Scout, and live market context.'

  const ownerKey = useMemo(() => {
    const email = searchParams.get('email')?.trim().toLowerCase()
    const wallet = searchParams.get('wallet')?.trim().toLowerCase()
    return email ? `email:${email}` : wallet ? `wallet:${wallet}` : 'polydesk-web'
  }, [searchParams])

  function openServiceView(view: PolyDeskServiceView, trackPrevious = true) {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('lane')
    if (view) next.set('service', view)
    else next.delete('service')
    setSearchParams(next, { replace: false })
    setIsAgentOpen(false)
    setAgentLane('')
    if (trackPrevious) setPreviousServiceView(serviceView)
    setServiceView(view)
    window.setTimeout(() => {
      document.querySelector('[data-polydesk-service-view="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)
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

  function resetLane() {
    if (serviceView) {
      closeServiceView()
      return
    }
    if (activeLane || agentLane) {
      const next = new URLSearchParams(searchParams)
      next.set('agent', '1')
      next.delete('lane')
      window.localStorage.removeItem(`hashpaylink-helper-active-mode:${ownerKey}:polydesk`)
      setAgentLane('')
      setPolyDeskResetSignal(value => value + 1)
      if (activeLane) setSearchParams(next, { replace: false })
      return
    }
    if (agentRouteOpen) {
      const historyState = window.history.state as { idx?: number } | null
      if ((historyState?.idx ?? 0) > 0) {
        navigate(-1)
        return
      }
      const next = new URLSearchParams(searchParams)
      next.delete('lane')
      next.delete('agent')
      setSearchParams(next, { replace: true })
      setIsAgentOpen(false)
      return
    }
    if (isAgentOpen) {
      setIsAgentOpen(false)
      return
    }
    if (!activeLane) {
      navigate(-1)
      return
    }
  }

  useEffect(() => {
    setIsAgentOpen(Boolean(activeLane || agentRouteOpen))
    setAgentLane(activeLane)
  }, [activeLane, agentRouteOpen])

  useEffect(() => {
    setServiceView(activeServiceView)
    if (activeServiceView) {
      setIsAgentOpen(false)
      setAgentLane('')
    }
  }, [activeServiceView])

  useEffect(() => {
    if (activeServiceView !== 'lp-scout' || searchParams.get('lpScoutPath') !== 'fund') return
    const next = new URLSearchParams(searchParams)
    next.set('service', 'app-pay')
    next.delete('portfolio')
    next.delete('lpScoutPath')
    setSearchParams(next, { replace: true })
  }, [activeServiceView, searchParams, setSearchParams])

  function launchAgent() {
    if (!agentRouteOpen) {
      const next = new URLSearchParams(searchParams)
      next.set('agent', '1')
      next.delete('service')
      setSearchParams(next, { replace: false })
    }
    setServiceView('')
    setIsAgentOpen(true)
  }

  return (
    <main className="text-gray-950 dark:text-white">
      <div className={cn(
        'mx-auto w-full space-y-5',
        serviceView === 'app-pay' || serviceView === 'marketplace' ? 'max-w-3xl' : serviceView === 'worldcup-news' || serviceView === 'worldcup-scores' || serviceView === 'activity' ? 'max-w-2xl' : 'max-w-md',
      )}>
        {isAgentOpen && (
          <button
            type="button"
            onClick={resetLane}
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
        )}

        {!isAgentOpen && !serviceView && (
          <div className="mb-1 flex flex-col items-start text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Portfolio</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Your prediction market desk</h2>
          </div>
        )}

        {!serviceView && (
          <button
            type="button"
            onClick={launchAgent}
            className={cn(
              'polydesk-card group w-full p-4 text-left transition-all hover:border-gray-300 active:scale-[0.995] dark:hover:border-white/20',
              isAgentOpen ? '!mt-0 rounded-t-2xl rounded-b-none border-b-0 pb-3 shadow-none' : 'rounded-2xl',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 items-start pt-0.5 text-gray-700 dark:text-gray-300">
                <PolyDeskLiveAgentIcon isStatic={isAgentOpen} />
              </div>
              <div className="min-w-0 flex-1">
                {isAgentOpen ? (
                  <p className="pt-0.5 text-sm font-semibold text-gray-900 dark:text-white">Desk Agent</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Desk Agent</p>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">Hello There</p>
                      </div>
                      <span className="back-btn shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-600" aria-hidden="true">
                        <span className="arrow-container arrow-container--right">
                          <span className="chevron c1" />
                          <span className="chevron c2" />
                          <span className="chevron c3" />
                        </span>
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Ask about your balance, positions, markets or funding.</p>
                    <span className="polydesk-primary-cta mt-4 w-full">Open Desk Agent</span>
                  </>
                )}
              </div>
            </div>
          </button>
        )}

        {isAgentOpen && (
          <section className="!mt-0 overflow-hidden rounded-b-2xl border border-t-0 border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#111114]">
            <TelegramHelperPanel
              key={helperKey}
              telegramName="there"
              ownerKey={ownerKey}
              telegramId=""
              fallbackOwner="polydesk-web"
              initialEventId=""
              initialPayer=""
              initialHelperMode="polydesk"
              initialPolyDeskSubMode={effectiveAgentLane}
              initialNotice=""
              lockedHelperMode="polydesk"
              welcomeText={welcomeText}
              inputPlaceholder="Ask Desk Agent..."
              hideTopDivider
              polyDeskResetSignal={polyDeskResetSignal}
              onPolyDeskSubModeChange={setAgentLane}
              autoQuestion={agentMessage || undefined}
              autoQuestionKey={lpScoutActivityId ? `lp-scout:${lpScoutActivityId}` : undefined}
              lpScoutActivityId={lpScoutActivityId || undefined}
              lpScoutReceiptId={lpScoutReceiptId || undefined}
              lpScoutReceiptUrl={lpScoutReceiptUrl || undefined}
              lpScoutAgentSlug={lpScoutAgentSlug || undefined}
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
            {serviceView === 'app-pay' || serviceView === 'marketplace' ? (
              <AppPay />
            ) : serviceView === 'activity' ? (
              <TradeActivity />
            ) : serviceView === 'portfolio' ? (
              <PolyPortfolioPanel
                onBack={closeServiceView}
                onOpenLpScout={() => openServiceView('lp-scout')}
                onOpenWorldCup={() => openServiceView('worldcup')}
                telegramOwner={ownerKey}
                telegramId=""
                surface="standalone"
                initialPortfolioAction={portfolioAction}
                initialTradingWalletTab={searchParams.get('wallet') === 'balance' ? 'balance' : undefined}
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
