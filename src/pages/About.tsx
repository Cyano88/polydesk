import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CircleDollarSign, LineChart, ShieldCheck, Trophy, Wallet } from 'lucide-react'

export default function About() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <nav className="landing-nav">
          <Link to="/" className="landing-brand">
            PolyDesk
          </Link>
          <Link to="/" className="landing-open-app">
            Open app <ArrowRight size={15} />
          </Link>
        </nav>
        <div className="landing-copy">
          <p>OKX.AI ASP foundation</p>
          <h1>Agentic Polymarket desk for market discovery, funding, portfolio monitoring, and LP intelligence.</h1>
          <span>
            The product app stays direct and operational. This page exists for judges, partners, and pitch traffic.
          </span>
        </div>
      </section>
      <section className="landing-grid">
        <PitchCard icon={Bot} title="Desk Agent" body="Negotiates tasks, guides funding, and helps users understand market state before signing." />
        <PitchCard icon={Wallet} title="Portfolio" body="Tracks deposit wallet state, pUSD, positions, alerts, withdrawals, and claimable outcomes." />
        <PitchCard icon={Trophy} title="World Cup" body="Connects live match data with Polymarket markets so users see more than one stale market." />
        <PitchCard icon={LineChart} title="LP Scout" body="Packages reward, spread, depth, and risk checks as an OKX.AI service." />
        <PitchCard icon={CircleDollarSign} title="Revenue" body="Supports A2A negotiated tasks and future A2MCP fixed-price calls." />
        <PitchCard icon={ShieldCheck} title="Boundary" body="Keeps Hash PayLink payment infrastructure isolated behind a scoped service API." />
      </section>
    </main>
  )
}

function PitchCard({ icon: Icon, title, body }: { icon: typeof Bot; title: string; body: string }) {
  return (
    <article className="pitch-card">
      <Icon size={20} />
      <strong>{title}</strong>
      <span>{body}</span>
    </article>
  )
}
