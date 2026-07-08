import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  Bell,
  Bot,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  LineChart,
  Radio,
  Search,
  ShieldCheck,
  Trophy,
  Wallet,
} from 'lucide-react'
import { hashPayLinkBaseUrl } from '../lib/config'

type PolyDeskLane = 'portfolio' | 'worldcup' | 'lp-scout'
type PolyDeskServiceView = '' | PolyDeskLane | 'worldcup-news' | 'worldcup-scores'

const lanes: Array<{
  id: PolyDeskLane
  title: string
  eyebrow: string
  description: string
  icon: typeof Wallet
}> = [
  {
    id: 'portfolio',
    title: 'Portfolio',
    eyebrow: 'Wallet + positions',
    description: 'Monitor pUSD, deposit-wallet readiness, positions, alerts, funding, withdrawals, and user-confirmed exits.',
    icon: Wallet,
  },
  {
    id: 'worldcup',
    title: 'World Cup',
    eyebrow: 'Live match markets',
    description: 'Track upcoming fixtures, matched Polymarket markets, price movement, news context, and score-aware trading surfaces.',
    icon: Trophy,
  },
  {
    id: 'lp-scout',
    title: 'LP Scout',
    eyebrow: 'Reward intelligence',
    description: 'Find Polymarket LP reward opportunities, summarize conditions, and package the service for OKX.AI ASP delivery.',
    icon: Search,
  },
]

function normalizeServiceView(value: string | null): PolyDeskServiceView {
  return value === 'portfolio' || value === 'worldcup' || value === 'lp-scout' || value === 'worldcup-news' || value === 'worldcup-scores'
    ? value
    : ''
}

function PolymarketMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="brand-mark" fill="none">
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

function LaneCard({
  lane,
  onOpen,
}: {
  lane: (typeof lanes)[number]
  onOpen: (view: PolyDeskServiceView) => void
}) {
  const Icon = lane.icon
  return (
    <button type="button" className="lane-card" onClick={() => onOpen(lane.id)}>
      <span className="lane-icon">
        <Icon size={20} />
      </span>
      <span className="lane-copy">
        <span className="lane-eyebrow">{lane.eyebrow}</span>
        <span className="lane-title">{lane.title}</span>
        <span className="lane-description">{lane.description}</span>
      </span>
      <ChevronRight className="lane-arrow" size={18} />
    </button>
  )
}

function AgentPanel({ onOpen }: { onOpen: (view: PolyDeskServiceView) => void }) {
  return (
    <section className="agent-panel">
      <div className="panel-heading">
        <span className="panel-icon">
          <Bot size={18} />
        </span>
        <div>
          <p className="panel-kicker">Desk Agent</p>
          <h2>Choose an operating lane</h2>
        </div>
      </div>
      <div className="agent-grid">
        {lanes.map(lane => (
          <LaneCard key={lane.id} lane={lane} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function PortfolioStub({ onBack, onOpenLpScout, onOpenWorldCup }: { onBack: () => void; onOpenLpScout: () => void; onOpenWorldCup: () => void }) {
  return (
    <section className="workspace">
      <WorkspaceHeader title="Portfolio" kicker="Main wallet" icon={Wallet} onBack={onBack} />
      <div className="metric-grid">
        <Metric label="pUSD trading cash" value="Remote API" detail="Phase 2 will read the live Hash PayLink portfolio endpoint." />
        <Metric label="Positions" value="Stubbed" detail="Real position cards move after the frontend extraction gate." />
        <Metric label="Approvals" value="Protected" detail="Sell approval must preserve the verified neg-risk adapter spender." />
      </div>
      <div className="action-row">
        <a className="primary-action" href={`${hashPayLinkBaseUrl}/polydesk?service=portfolio&portfolio=trading`} target="_blank" rel="noreferrer">
          Open current live portfolio <ExternalLink size={16} />
        </a>
        <button type="button" className="secondary-action" onClick={onOpenWorldCup}>
          View World Cup
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
    <section className="workspace">
      <WorkspaceHeader title="World Cup" kicker="Market command" icon={Trophy} onBack={onBack} />
      <div className="split-grid">
        <FeatureTile icon={Radio} title="Scores + fixtures" body="Phase 2 extracts the live match list and prevents the France-only regression." onClick={onOpenScores} />
        <FeatureTile icon={Bell} title="News context" body="News and market context move from the verified World Cup panel range." onClick={onOpenNews} />
        <FeatureTile icon={Wallet} title="Trading wallet" body="Funding and portfolio actions stay user-confirmed and route through stable APIs." onClick={onOpenPortfolio} />
      </div>
    </section>
  )
}

function NewsStub({ onBack, onOpenScores }: { onBack: () => void; onOpenScores: () => void }) {
  return (
    <section className="workspace">
      <WorkspaceHeader title="World Cup News" kicker="Signal feed" icon={Bell} onBack={onBack} />
      <EmptyState
        icon={Activity}
        title="News extraction starts in Phase 2"
        body="This panel will call `/api/poly-worldcup-news` after the frontend module is moved and verified."
      />
      <button type="button" className="primary-action" onClick={onOpenScores}>
        Open scores stub
      </button>
    </section>
  )
}

function ScoresStub({ onBack, onOpenNews }: { onBack: () => void; onOpenNews: () => void }) {
  return (
    <section className="workspace">
      <WorkspaceHeader title="Scores + Markets" kicker="Live fixtures" icon={Radio} onBack={onBack} />
      <EmptyState
        icon={LineChart}
        title="Live market stream is isolated next"
        body="The real PolyStream module will be extracted with fixture coverage checks so Morocco, France, and future matches can render from live data."
      />
      <button type="button" className="primary-action" onClick={onOpenNews}>
        Open news stub
      </button>
    </section>
  )
}

function LpScoutStub({ onBack }: { onBack: () => void }) {
  return (
    <section className="workspace">
      <WorkspaceHeader title="LP Scout" kicker="OKX.AI-ready service" icon={Search} onBack={onBack} />
      <div className="split-grid">
        <FeatureTile icon={CircleDollarSign} title="Revenue path" body="Can become a fixed-price A2MCP call or negotiated A2A scout task." />
        <FeatureTile icon={ShieldCheck} title="Service boundary" body="x402 and OKX.AI billing stay behind the documented service boundary until cutover." />
        <FeatureTile icon={LineChart} title="Market intelligence" body="Scans reward terms, spreads, volume, and fulfillment risk for LP candidates." />
      </div>
    </section>
  )
}

function WorkspaceHeader({ title, kicker, icon: Icon, onBack }: { title: string; kicker: string; icon: typeof Wallet; onBack: () => void }) {
  return (
    <div className="workspace-header">
      <button type="button" className="back-button" onClick={onBack} aria-label="Back">
        <ArrowLeft size={18} />
      </button>
      <span className="workspace-icon">
        <Icon size={20} />
      </span>
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
      </div>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  )
}

function FeatureTile({ icon: Icon, title, body, onClick }: { icon: typeof Wallet; title: string; body: string; onClick?: () => void }) {
  const content = (
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
      {content}
    </button>
  ) : (
    <div className="feature-tile">{content}</div>
  )
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Wallet; title: string; body: string }) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}

export default function PolyDesk() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeServiceView = normalizeServiceView(searchParams.get('service'))
  const [serviceView, setServiceView] = useState<PolyDeskServiceView>(activeServiceView)
  const prompts = useMemo(
    () => ['I monitor Polymarket wallets.', 'I can read World Cup markets.', 'I can prepare user-confirmed trades.', 'I can package LP Scout for OKX.AI.'],
    [],
  )
  const [promptIndex, setPromptIndex] = useState(0)

  useEffect(() => {
    setServiceView(activeServiceView)
  }, [activeServiceView])

  useEffect(() => {
    const timer = window.setTimeout(() => setPromptIndex(index => (index + 1) % prompts.length), 4200)
    return () => window.clearTimeout(timer)
  }, [promptIndex, prompts.length])

  function openServiceView(view: PolyDeskServiceView) {
    const next = new URLSearchParams(searchParams)
    if (view) next.set('service', view)
    else next.delete('service')
    setSearchParams(next, { replace: false })
    setServiceView(view)
  }

  function closeServiceView() {
    const next = new URLSearchParams(searchParams)
    next.delete('service')
    setSearchParams(next, { replace: false })
    setServiceView('')
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <nav className="topbar">
          <Link className="brand" to="/">
            <PolymarketMark />
            <span>PolyDesk</span>
          </Link>
          <a className="topbar-link" href={`${hashPayLinkBaseUrl}/polydesk`} target="_blank" rel="noreferrer">
            Live Hash PayLink build <ExternalLink size={14} />
          </a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="hero-kicker">Agentic Polymarket desk</p>
            <h1>Desk Agent for markets, funding, portfolio, and LP intelligence.</h1>
            <p className="hero-body">
              Phase 1 shell extracted from Hash PayLink with strict boundaries. Trading logic, checkout rails, and production APIs stay remote until each module is
              moved and verified.
            </p>
            <div className="status-strip">
              <span>Frontend shell</span>
              <span>Hash PayLink API boundary</span>
              <span>No core payment secrets</span>
            </div>
          </div>
          <div className="agent-card">
            <div className="agent-orb">
              <Bot size={28} />
            </div>
            <p>Desk Agent</p>
            <strong key={promptIndex}>{prompts[promptIndex]}</strong>
          </div>
        </div>
      </section>

      <section className="content-shell">
        {!serviceView ? (
          <AgentPanel onOpen={openServiceView} />
        ) : serviceView === 'portfolio' ? (
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
    </main>
  )
}
