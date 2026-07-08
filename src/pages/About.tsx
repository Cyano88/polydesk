import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CircleDollarSign, LineChart, ShieldCheck, Trophy, Wallet } from 'lucide-react'

const cards = [
  { icon: Bot, title: 'Desk Agent', body: 'Negotiates tasks, guides funding, and helps users understand market state before signing.' },
  { icon: Wallet, title: 'Portfolio', body: 'Tracks deposit wallet state, pUSD, positions, alerts, withdrawals, and claimable outcomes.' },
  { icon: Trophy, title: 'World Cup', body: 'Connects live match data with Polymarket markets so users see more than one stale market.' },
  { icon: LineChart, title: 'LP Scout', body: 'Packages reward, spread, depth, and risk checks as an OKX.AI service.' },
  { icon: CircleDollarSign, title: 'Revenue', body: 'Supports A2A negotiated tasks and future A2MCP fixed-price calls.' },
  { icon: ShieldCheck, title: 'Boundary', body: 'Keeps Hash PayLink payment infrastructure isolated behind a scoped service API.' },
]

export default function About() {
  return (
    <main className="min-h-screen bg-[#071018] text-white">
      <section className="px-5 py-6 sm:px-10 lg:px-16">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link to="/" className="text-lg font-black">
            PolyDesk
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-bold text-white/90"
          >
            Open app <ArrowRight size={15} />
          </Link>
        </nav>

        <div className="mx-auto mt-20 max-w-5xl">
          <p className="text-xs font-black uppercase text-sky-300">OKX.AI ASP foundation</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-black leading-none tracking-normal sm:text-7xl">
            Agentic Polymarket desk for market discovery, funding, portfolio monitoring, and LP intelligence.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300">
            The product app stays direct and operational. This page exists for judges, partners, and pitch traffic.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-5 pb-16 sm:px-10 md:grid-cols-3 lg:px-16">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <article key={card.title} className="min-h-40 rounded-lg border border-white/10 bg-white/[0.06] p-5">
              <Icon className="text-sky-300" size={20} />
              <strong className="mt-4 block text-lg">{card.title}</strong>
              <span className="mt-2 block text-sm leading-6 text-slate-300">{card.body}</span>
            </article>
          )
        })}
      </section>
    </main>
  )
}
