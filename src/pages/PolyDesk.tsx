import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  LineChart,
  Newspaper,
  Radio,
  Search,
  Trophy,
  Wallet,
} from 'lucide-react'
import { hashPayLinkBaseUrl } from '../lib/config'

type PolyDeskLane = 'portfolio' | 'worldcup' | 'lp-scout'
type PolyDeskServiceView = '' | PolyDeskLane | 'worldcup-news' | 'worldcup-scores'

const introPrompts = [
  'I am Desk Agent.',
  'Tap to launch me.',
  'I can help with portfolio alerts.',
  'I can read World Cup markets.',
  'I can guide LP Scout access.',
  'I can help fund Polymarket.',
]

const menuCards: Array<{
  id: PolyDeskServiceView
  title: string
  description: string
  icon: typeof Wallet
}> = [
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'View pUSD trading cash, fund your account, withdraw as USDC, and track positions.',
    icon: Wallet,
  },
  {
    id: 'worldcup',
    title: 'World Cup',
    description: 'Track live fixtures, upcoming markets, news, and score-aware trading opportunities.',
    icon: Trophy,
  },
  {
    id: 'lp-scout',
    title: 'LP Scout',
    description: 'Scan LP rewards, market depth, spreads, and operator opportunities.',
    icon: Search,
  },
]

function normalizeLane(value: string | null): PolyDeskLane | '' {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' ? value : ''
}

function normalizeServiceView(value: string | null): PolyDeskServiceView {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' || value === 'worldcup-news' || value === 'worldcup-scores'
    ? value
    : ''
}

function PolymarketMark({ className = '' }: { className?: string }) {
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

function PolyDeskLiveAgentIcon({ isStatic = false }: { isStatic?: boolean }) {
  return (
    <span className={`live-agent-icon${isStatic ? ' live-agent-icon--static' : ''}`} aria-hidden="true">
      <PolymarketMark className="live-agent-icon__mark" />
      <span className="live-agent-icon__bubble">
        <span />
        <span />
        <span />
      </span>
    </span>
  )
}

function MenuCard({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string
  description: string
  icon: typeof Wallet
  onClick: () => void
}) {
  return (
    <button type="button" className="menu-card" onClick={onClick}>
      <span className="menu-card__icon">
        <Icon size={21} />
      </span>
      <span className="menu-card__copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <ChevronRight className="menu-card__arrow" size={18} />
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-back">
      <span className="back-chevron" aria-hidden="true">
        <ArrowLeft size={16} />
      </span>
      Back
    </button>
  )
}

function DeskAgentStub({ lane, onLaneChange }: { lane: PolyDeskLane | ''; onLaneChange: (lane: PolyDeskLane | '') => void }) {
  return (
    <div className="desk-agent-body">
      <div className="desk-agent-thread">
        <div className="agent-message">
          <span className="agent-avatar">
            <Bot size={17} />
          </span>
          <p>
            Welcome back. Choose Portfolio, World Cup, or LP Scout. In Phase 2 this panel becomes the extracted `TelegramHelperPanel`
            with the current PolyDesk agent flow.
          </p>
        </div>
      </div>
      <div className="agent-mode-grid">
        {menuCards.map(card => (
          <button
            type="button"
            key={card.id}
            className={`agent-mode${lane === card.id ? ' agent-mode--active' : ''}`}
            onClick={() => onLaneChange(card.id as PolyDeskLane)}
          >
            <card.icon size={17} />
            <span>{card.title}</span>
          </button>
        ))}
      </div>
      <div className="agent-input">
        <span>{lane ? `Ask about ${lane.replace('-', ' ')}...` : 'Ask Desk Agent...'}</span>
      </div>
    </div>
  )
}

function PortfolioStub({
  onBack,
  onOpenLpScout,
  onOpenWorldCup,
}: {
  onBack: () => void
  onOpenLpScout: () => void
  onOpenWorldCup: () => void
}) {
  return (
    <section className="service-panel">
      <PanelHeader title="Main Wallet" kicker="Balance" icon={Wallet} onBack={onBack} />
      <p className="panel-lede">View pUSD trading cash, fund your account, withdraw as USDC, and track positions.</p>
      <div className="wallet-strip">
        <div>
          <span>Owner wallet</span>
          <strong>Connect Privy</strong>
        </div>
        <div>
          <span>Polymarket wallet</span>
          <strong>Deposit wallet</strong>
        </div>
      </div>
      <div className="portfolio-grid">
        <Metric label="pUSD trading cash" value="$--" detail="Live balance moves in Phase 2." />
        <Metric label="Portfolio value" value="$--" detail="Positions stay stubbed until extraction." />
        <Metric label="Claimable" value="$--" detail="Redeemable position logic not moved yet." />
      </div>
      <div className="tab-strip">
        <button type="button">Balance</button>
        <button type="button">Fund</button>
        <button type="button">Withdraw</button>
        <button type="button">Positions</button>
      </div>
      <div className="action-row">
        <a className="primary-action" href={`${hashPayLinkBaseUrl}/polydesk?service=portfolio&portfolio=trading`} target="_blank" rel="noreferrer">
          Open current live portfolio <ExternalLink size={15} />
        </a>
        <button type="button" className="secondary-action" onClick={onOpenWorldCup}>
          World Cup
        </button>
        <button type="button" className="secondary-action" onClick={onOpenLpScout}>
          LP Scout
        </button>
      </div>
    </section>
  )
}

function WorldCupStub({
  onBack,
  onOpenNews,
  onOpenScores,
  onOpenPortfolio,
}: {
  onBack: () => void
  onOpenNews: () => void
  onOpenScores: () => void
  onOpenPortfolio: () => void
}) {
  return (
    <section className="service-panel">
      <PanelHeader title="World Cup" kicker="Market hub" icon={Trophy} onBack={onBack} />
      <div className="match-card">
        <div>
          <span>Next extraction target</span>
          <strong>Live fixture and market list</strong>
        </div>
        <p>Phase 2 replaces this with the verified World Cup hub so the app is not stuck on a single France market.</p>
      </div>
      <div className="service-grid">
        <FeatureTile icon={Radio} title="Scores" body="Live match data and market matching." onClick={onOpenScores} />
        <FeatureTile icon={Newspaper} title="News" body="Context feed for market decisions." onClick={onOpenNews} />
        <FeatureTile icon={Wallet} title="Portfolio" body="Return to trading wallet state." onClick={onOpenPortfolio} />
      </div>
    </section>
  )
}

function NewsStub({ onBack, onOpenScores }: { onBack: () => void; onOpenScores: () => void }) {
  return (
    <section className="service-panel">
      <PanelHeader title="World Cup News" kicker="News" icon={Newspaper} onBack={onBack} />
      <EmptyState icon={Bell} title="News feed pending extraction" body="This will become the current PolyDesk news panel, not a new marketing surface." />
      <button type="button" className="primary-action" onClick={onOpenScores}>
        Open scores
      </button>
    </section>
  )
}

function ScoresStub({ onBack, onOpenNews }: { onBack: () => void; onOpenNews: () => void }) {
  return (
    <section className="service-panel">
      <PanelHeader title="Scores" kicker="Live" icon={Radio} onBack={onBack} />
      <EmptyState icon={LineChart} title="PolyStream pending extraction" body="This surface will use the current live/upcoming match data flow." />
      <button type="button" className="primary-action" onClick={onOpenNews}>
        Open news
      </button>
    </section>
  )
}

function LpScoutStub({ onBack }: { onBack: () => void }) {
  return (
    <section className="service-panel">
      <PanelHeader title="LP Scout" kicker="Scout" icon={Search} onBack={onBack} />
      <div className="service-grid">
        <FeatureTile icon={CircleDollarSign} title="Rewards" body="Reward opportunity scoring." />
        <FeatureTile icon={BarChart3} title="Depth" body="Market spread and liquidity checks." />
        <FeatureTile icon={LineChart} title="Brief" body="Operator-ready LP summary." />
      </div>
    </section>
  )
}

function PanelHeader({ title, kicker, icon: Icon, onBack }: { title: string; kicker: string; icon: typeof Wallet; onBack: () => void }) {
  return (
    <header className="panel-header">
      <BackButton onClick={onBack} />
      <div className="panel-title-row">
        <span className="panel-header__icon">
          <Icon size={21} />
        </span>
        <div>
          <p>{kicker}</p>
          <h2>{title}</h2>
        </div>
      </div>
    </header>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  )
}

function FeatureTile({ icon: Icon, title, body, onClick }: { icon: typeof Wallet; title: string; body: string; onClick?: () => void }) {
  const children = (
    <>
      <span className="feature-icon">
        <Icon size={18} />
      </span>
      <strong>{title}</strong>
      <span>{body}</span>
    </>
  )

  return onClick ? (
    <button type="button" className="feature-tile feature-tile--button" onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className="feature-tile">{children}</div>
  )
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Wallet; title: string; body: string }) {
  return (
    <div className="empty-state">
      <Icon size={22} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}

export default function PolyDesk() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeLane = normalizeLane(searchParams.get('lane'))
  const activeServiceView = normalizeServiceView(searchParams.get('service'))
  const agentRouteOpen = searchParams.get('agent') === '1'
  const [isAgentOpen, setIsAgentOpen] = useState(Boolean(activeLane || agentRouteOpen))
  const [agentLane, setAgentLane] = useState<PolyDeskLane | ''>(activeLane)
  const [serviceView, setServiceView] = useState<PolyDeskServiceView>(activeServiceView)
  const [promptIndex, setPromptIndex] = useState(0)

  const ownerKey = useMemo(() => {
    const email = searchParams.get('email')?.trim().toLowerCase()
    const wallet = searchParams.get('wallet')?.trim().toLowerCase()
    return email ? `email:${email}` : wallet ? `wallet:${wallet}` : 'polydesk-web'
  }, [searchParams])

  useEffect(() => {
    if (isAgentOpen) return undefined
    const timer = window.setTimeout(() => setPromptIndex(index => (index + 1) % introPrompts.length), 4200)
    return () => window.clearTimeout(timer)
  }, [isAgentOpen, promptIndex])

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

  function openServiceView(view: PolyDeskServiceView) {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('lane')
    if (view) next.set('service', view)
    else next.delete('service')
    setSearchParams(next, { replace: false })
    setServiceView(view)
    setIsAgentOpen(false)
    setAgentLane('')
  }

  function launchAgent() {
    const next = new URLSearchParams(searchParams)
    next.set('agent', '1')
    next.delete('service')
    setSearchParams(next, { replace: false })
    setServiceView('')
    setIsAgentOpen(true)
  }

  function closeServiceView() {
    const next = new URLSearchParams(searchParams)
    next.delete('service')
    setSearchParams(next, { replace: false })
    setServiceView('')
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
      setAgentLane('')
      if (activeLane) setSearchParams(next, { replace: false })
      return
    }
    if (agentRouteOpen || isAgentOpen) {
      const next = new URLSearchParams(searchParams)
      next.delete('agent')
      next.delete('lane')
      setSearchParams(next, { replace: true })
      setIsAgentOpen(false)
      return
    }
    navigate(-1)
  }

  return (
    <main className="polydesk-app">
      <div className="polydesk-shell">
        <header className="app-header">
          <Link className="app-brand" to="/">
            <PolymarketMark className="app-brand__mark" />
            <span>PolyDesk</span>
          </Link>
          <nav className="app-nav" aria-label="PolyDesk">
            <button type="button" onClick={() => openServiceView('portfolio')} className={serviceView === 'portfolio' ? 'is-active' : ''}>
              Portfolio
            </button>
            <button type="button" onClick={() => openServiceView('worldcup')} className={serviceView === 'worldcup' ? 'is-active' : ''}>
              World Cup
            </button>
            <button type="button" onClick={() => openServiceView('lp-scout')} className={serviceView === 'lp-scout' ? 'is-active' : ''}>
              LP Scout
            </button>
          </nav>
        </header>

        {isAgentOpen && <BackButton onClick={resetLane} />}

        {!isAgentOpen && !serviceView && (
          <section className="hub-heading">
            <div className="service-hub-icon">
              <PolymarketMark className="service-hub-icon__mark" />
            </div>
            <p>Service Hub</p>
            <h1>What do you want to do today?</h1>
          </section>
        )}

        {!serviceView && (
          <button type="button" onClick={launchAgent} className={`desk-agent-card${isAgentOpen ? ' desk-agent-card--open' : ''}`}>
            <div className="desk-agent-card__inner">
              <PolyDeskLiveAgentIcon isStatic={isAgentOpen} />
              <div className="desk-agent-card__copy">
                {isAgentOpen ? (
                  <strong>Desk Agent</strong>
                ) : (
                  <>
                    <span>Desk Agent</span>
                    <strong>Hello There</strong>
                    <p key={promptIndex}>{introPrompts[promptIndex]}</p>
                  </>
                )}
              </div>
              {!isAgentOpen && <ChevronRight className="desk-agent-card__arrow" size={18} />}
            </div>
          </button>
        )}

        {isAgentOpen && (
          <section className="desk-agent-panel">
            <DeskAgentStub lane={agentLane} onLaneChange={setAgentLane} />
          </section>
        )}

        {!isAgentOpen && !serviceView && (
          <section className="menu-list">
            {menuCards.map(card => (
              <MenuCard key={card.id} {...card} onClick={() => openServiceView(card.id)} />
            ))}
          </section>
        )}

        {serviceView && !isAgentOpen && (
          <section data-polydesk-service-view="true">
            {serviceView === 'portfolio' ? (
              <PortfolioStub onBack={closeServiceView} onOpenLpScout={() => openServiceView('lp-scout')} onOpenWorldCup={() => openServiceView('worldcup')} />
            ) : serviceView === 'worldcup' ? (
              <WorldCupStub
                onBack={closeServiceView}
                onOpenNews={() => openServiceView('worldcup-news')}
                onOpenScores={() => openServiceView('worldcup-scores')}
                onOpenPortfolio={() => openServiceView('portfolio')}
              />
            ) : serviceView === 'worldcup-news' ? (
              <NewsStub onBack={() => openServiceView('worldcup')} onOpenScores={() => openServiceView('worldcup-scores')} />
            ) : serviceView === 'worldcup-scores' ? (
              <ScoresStub onBack={() => openServiceView('worldcup')} onOpenNews={() => openServiceView('worldcup-news')} />
            ) : (
              <LpScoutStub onBack={closeServiceView} />
            )}
          </section>
        )}

        <footer className="app-footer">
          <span>Powered by</span>
          <a href={hashPayLinkBaseUrl} target="_blank" rel="noreferrer">
            Hash PayLink
          </a>
          <Link to="/about">About</Link>
          <span className="owner-key">{ownerKey}</span>
        </footer>
      </div>
    </main>
  )
}
