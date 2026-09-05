import { Link } from 'react-router-dom'
import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  CheckBadgeIcon,
  CodeBracketIcon,
  DocumentCheckIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import PolymarketMark from '../components/PolymarketMark'
import { polydeskMarketplaceProducts } from '../lib/polydeskMarketplaceProducts'

const audiences = [
  {
    label: 'People',
    title: 'A reference application',
    body: 'Research markets, inspect portfolios, configure monitoring, and approve financial actions from one human-facing workspace.',
  },
  {
    label: 'Agents',
    title: 'Bounded machine services',
    body: 'Use typed contracts for one trade, continuous portfolio management, or a verifiable integration assessment.',
  },
  {
    label: 'Platforms',
    title: 'Infrastructure you can embed',
    body: 'Keep your own interface and identity while PolyDesk provides governed Polymarket workflows and portable evidence.',
  },
] as const

const principles = [
  ['Non-custodial by design', 'Wallet keys and reusable trading credentials stay with their owner.'],
  ['Explicit authorization', 'Funding and trading stop until the buyer approves the exact bounded action.'],
  ['Open integration surface', 'Versioned manifests and typed responses make capabilities inspectable before use.'],
  ['Verifiable outcomes', 'Receipts bind decisions and completed actions to evidence that machines and people can audit.'],
] as const

const productLabels = {
  'one-off': 'One mission',
  subscription: 'Continuous management',
  assessment: 'External assurance',
} as const

export default function About() {
  return (
    <div className="min-h-screen bg-[#f4f3ef] font-inter text-slate-950">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f4f3ef]/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10" aria-label="Public navigation">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <PolymarketMark className="h-6 w-6" />
            PolyDesk
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium sm:gap-6">
            <Link to="/integrations" className="text-slate-600 transition hover:text-slate-950">Integrations</Link>
            <Link to="/docs" className="hidden text-slate-600 transition hover:text-slate-950 sm:inline">Docs</Link>
            <a href="/polydesk" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-white transition hover:bg-black">
              Open app <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28 lg:grid-cols-[1.35fr_.65fr] lg:px-10 lg:pt-36">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Governed prediction-market infrastructure</p>
            <h1 className="mt-7 max-w-5xl text-balance text-[clamp(3.25rem,7.5vw,7.4rem)] font-semibold leading-[.9] tracking-[-0.065em]">
              The open control layer for Polymarket agents.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9">
              PolyDesk gives people, agents, and platforms a shared standard for market intelligence, explicit authorization, and verifiable execution.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/integrations" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-black">
                Explore integrations <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <a href="/.well-known/polydesk.json" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-800 transition hover:bg-white">
                Read the public manifest <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
          <aside className="self-end border-l border-slate-300 pl-6 lg:mb-2 lg:pl-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Foundation principle</p>
            <p className="mt-4 text-2xl font-medium leading-9 tracking-[-0.025em]">Agents can act quickly without asking people to surrender control.</p>
          </aside>
        </section>

        <section className="border-y border-black/5 bg-white/65">
          <div className="mx-auto grid max-w-7xl gap-px px-5 py-4 text-sm font-semibold text-slate-700 sm:grid-cols-3 sm:px-8 lg:px-10">
            <div className="flex items-center gap-3 py-3"><CodeBracketIcon className="h-5 w-5 text-slate-400" /> Versioned machine contracts</div>
            <div className="flex items-center gap-3 py-3"><ShieldCheckIcon className="h-5 w-5 text-slate-400" /> Buyer-controlled financial actions</div>
            <div className="flex items-center gap-3 py-3"><DocumentCheckIcon className="h-5 w-5 text-slate-400" /> Portable execution evidence</div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[.65fr_1.35fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Public products</p>
              <h2 className="mt-4 max-w-md text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Three clear ways to use the network.</h2>
              <p className="mt-5 max-w-md leading-7 text-slate-600">Implementation capabilities stay behind these product boundaries instead of becoming a confusing catalog of separate tools.</p>
            </div>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {polydeskMarketplaceProducts.map((product, index) => (
                <article key={product.id} className="grid gap-4 py-7 sm:grid-cols-[3rem_1fr] sm:py-9">
                  <span className="font-mono text-xs text-slate-400">0{index + 1}</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{productLabels[product.lifecycle]}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{product.name}</h3>
                    <p className="mt-3 max-w-2xl leading-7 text-slate-600">{product.scope}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">One standard, three entry points</p>
            <div className="mt-12 grid gap-10 sm:grid-cols-3">
              {audiences.map(item => (
                <article key={item.label} className="border-t border-white/20 pt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">{item.label}</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{item.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-white/60">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]">
            <div>
              <CheckBadgeIcon className="h-8 w-8 text-slate-500" />
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">Built around enforceable boundaries.</h2>
            </div>
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {principles.map(([title, body]) => (
                <article key={title}>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-black/5 bg-white/65">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:flex-row sm:items-center sm:px-8 lg:px-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Build with PolyDesk</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Start with the integration contract.</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/docs/okx-ai" className="inline-flex min-h-11 items-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white">Developer docs</Link>
              <a href="/polydesk" className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-semibold">Open reference app</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 px-5 py-8 text-sm text-slate-500 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 PolyDesk. Infrastructure for governed prediction-market agents.</p>
          <div className="flex gap-5">
            <Link to="/integrations" className="hover:text-slate-950">Integrations</Link>
            <Link to="/docs" className="hover:text-slate-950">Docs</Link>
            <a href="https://x.com/PolyDeskTrade" target="_blank" rel="noreferrer" className="hover:text-slate-950">Updates</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
