import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '../lib/utils'
import AgentWorkspace from './AgentWorkspace'
import TradeActivity from './TradeActivity'
import { LpScoutPanel, type LpScoutPrefill } from './LpScoutPanel'
import {
  PolyPortfolioPanel,
  PolyStreamPanel,
  PolyWorldCupHubPanel,
  PolyWorldCupNewsPanel,
  TelegramHelperPanel,
} from './TelegramPaymentLinks'

type PolyDeskLane = 'portfolio' | 'worldcup' | 'lp-scout'
type PolyDeskServiceView = '' | PolyDeskLane | 'football' | 'worldcup-news' | 'worldcup-scores' | 'activity'
type PortfolioAction = 'watch' | 'trading' | 'external' | 'x402'

function normalizeLane(value: string | null): PolyDeskLane | '' {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' ? value : ''
}

function normalizeServiceView(value: string | null): PolyDeskServiceView {
  return value === 'portfolio' || value === 'worldcup' || value === 'football' || value === 'lp-scout' || value === 'worldcup-news' || value === 'worldcup-scores' || value === 'activity'
    ? value
    : ''
}

function normalizePortfolioAction(value: string | null): PortfolioAction {
  return value === 'watch' || value === 'external' || value === 'x402' ? value : 'trading'
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
  const welcomeText = 'Welcome back. Ask about your Polymarket account, football markets, LP Scout, and live market context.'

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
    const legacyService = searchParams.get('service')
    if (legacyService !== 'app-pay' && legacyService !== 'marketplace') return
    const next = new URLSearchParams(searchParams)
    next.set('service', 'lp-scout')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return (
    <main className="text-gray-950 dark:text-white">
      <div className={cn(
        'mx-auto w-full space-y-5',
        serviceView === 'football' || serviceView === 'worldcup-news' || serviceView === 'worldcup-scores' || serviceView === 'activity' ? 'max-w-2xl' : 'max-w-md',
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
        )}

        {isAgentOpen && (
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#111114]">
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
            {serviceView === 'activity' ? (
              <TradeActivity />
            ) : serviceView === 'portfolio' ? (
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
                onOpenFootball={() => openServiceView('football')}
              />
            )}
          </section>
        )}
      </div>
    </main>
  )
}
