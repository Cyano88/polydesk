import { Link } from 'react-router-dom'
import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  CommandLineIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import PolymarketMark from '../components/PolymarketMark'
import { marketplaceProductUrl, polydeskMarketplaceProducts } from '../lib/polydeskMarketplaceProducts'

const audiences = [
  {
    title: 'For people',
    body: 'Use the PolyDesk web application to research markets, inspect portfolios, request agent help, approve trades, and manage notifications.',
    icon: UserIcon,
  },
  {
    title: 'For agents',
    body: 'Call typed A2A and HTTP services for one result, one governed trading mission, or recurring portfolio monitoring.',
    icon: CommandLineIcon,
  },
  {
    title: 'For platforms',
    body: 'Embed PolyDesk capabilities while keeping your own user experience, identity, and return destination.',
    icon: ShieldCheckIcon,
  },
] as const

const lifecycle = [
  ['01', 'Request', 'A person writes a plain-language request, or an agent sends a typed service payload.'],
  ['02', 'Verify', 'PolyDesk checks live market data, wallet readiness, evidence, and the buyer-defined limits.'],
  ['03', 'Approve', 'Read-only results return immediately. Funding and trading wait for the buyer-controlled signature.'],
  ['04', 'Prove', 'The caller receives machine-readable output, status, and public execution evidence where available.'],
] as const

export default function Integrations() {
  return (
    <div className='min-h-screen bg-[#f6f6f3] font-inter text-gray-950 dark:bg-[#101114] dark:text-white'>
      <header className='sticky top-0 z-40 border-b border-black/5 bg-[#f6f6f3]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#101114]/90'>
        <div className='mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8'>
          <Link to='/' className='flex items-center gap-2.5 font-semibold tracking-tight'>
            <PolymarketMark className='h-6 w-6' />
            PolyDesk
          </Link>
          <nav className='flex items-center gap-4 text-sm font-medium'>
            <Link to='/docs' className='hidden text-gray-500 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white sm:inline'>Docs</Link>
            <Link to='/about' className='hidden text-gray-500 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white sm:inline'>About</Link>
            <Link to='/polydesk?agent=1' className='rounded-full bg-gray-950 px-4 py-2 text-white transition hover:bg-black dark:bg-white dark:text-gray-950'>Open PolyDesk</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className='mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pb-24 sm:pt-28'>
          <p className='text-xs font-bold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400'>Polymarket infrastructure</p>
          <h1 className='mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.055em] sm:text-7xl'>One PolyDesk stack for people, agents, and platforms.</h1>
          <p className='mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300'>
            The web application is the human reference client. The same verified capabilities are available to agents and infrastructure through bounded, machine-readable services.
          </p>
          <div className='mt-8 flex flex-wrap gap-3'>
            <Link to='/polydesk?agent=1' className='inline-flex min-h-12 items-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white dark:bg-white dark:text-gray-950'>
              Ask PolyDesk <ArrowRightIcon className='h-4 w-4' />
            </Link>
            <Link to='/docs/okx-ai' className='inline-flex min-h-12 items-center gap-2 rounded-full border border-gray-300 px-6 text-sm font-semibold text-gray-800 hover:bg-white dark:border-white/15 dark:text-gray-100 dark:hover:bg-white/[0.06]'>
              Read integration docs
            </Link>
            <a href='/api/a2mcp/services' className='inline-flex min-h-12 items-center gap-2 rounded-full border border-gray-300 px-6 text-sm font-semibold text-gray-800 hover:bg-white dark:border-white/15 dark:text-gray-100 dark:hover:bg-white/[0.06]'>
              Machine-readable manifest <ArrowTopRightOnSquareIcon className='h-4 w-4' />
            </a>
          </div>
        </section>

        <section className='border-y border-black/5 bg-white dark:border-white/10 dark:bg-white/[0.025]'>
          <div className='mx-auto grid max-w-6xl gap-px px-5 py-12 sm:grid-cols-3 sm:px-8'>
            {audiences.map(({ title, body, icon: Icon }) => (
              <article key={title} className='border-black/5 py-6 sm:border-r sm:px-7 sm:first:pl-0 sm:last:border-r-0 dark:border-white/10'>
                <Icon className='h-6 w-6 text-gray-500 dark:text-gray-400' />
                <h2 className='mt-5 text-xl font-semibold'>{title}</h2>
                <p className='mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300'>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className='mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28'>
          <div className='grid gap-12 lg:grid-cols-[0.8fr_1.2fr]'>
            <div>
              <p className='text-xs font-bold uppercase tracking-[0.2em] text-gray-500'>Service model</p>
              <h2 className='mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl'>Three products. One non-custodial control layer.</h2>
              <p className='mt-4 leading-7 text-gray-600 dark:text-gray-300'>Run one bounded mission, continuously manage an agent, or assess an external Polymarket integration. Internal API capabilities support these products; they are not separate product lines.</p>
            </div>
            <div className='grid gap-3'>
              {polydeskMarketplaceProducts.map((product, index) => {
                const url = marketplaceProductUrl(product)
                const price = product.pricing.mode === 'subscription'
                  ? `${product.pricing.amountUsdt} USDT monthly · ${product.pricing.freeTrialDays}-day trial`
                  : product.pricing.mode === 'per-task'
                    ? `${product.pricing.amountUsdt} USDT per ${product.lifecycle === 'assessment' ? 'assessment' : 'mission'}`
                    : 'Pricing by scope'
                return (
                  <article key={product.id} className={index === 0 ? 'rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950' : 'rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04]'}>
                    <p className={index === 0 ? 'text-xs font-bold uppercase tracking-widest text-white/50 dark:text-gray-500' : 'text-xs font-bold uppercase tracking-widest text-gray-400'}>{product.lifecycle}</p>
                    <h3 className='mt-2 text-xl font-semibold'>{product.name}</h3>
                    <p className={index === 0 ? 'mt-2 text-sm leading-6 text-white/70 dark:text-gray-600' : 'mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300'}>{product.scope}</p>
                    <p className='mt-5 text-sm font-semibold'>{price}</p>
                    {url && <a className='mt-4 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4' href={url} target='_blank' rel='noreferrer'>Current listing <ArrowTopRightOnSquareIcon className='h-4 w-4' /></a>}
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className='bg-gray-950 text-white dark:bg-black'>
          <div className='mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24'>
            <p className='text-xs font-bold uppercase tracking-[0.2em] text-white/45'>Shared lifecycle</p>
            <h2 className='mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl'>Natural language for people. Typed contracts for machines.</h2>
            <div className='mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4'>
              {lifecycle.map(([index, title, body]) => (
                <article key={index}>
                  <p className='font-mono text-xs text-white/35'>{index}</p>
                  <h3 className='mt-3 font-semibold'>{title}</h3>
                  <p className='mt-2 text-sm leading-6 text-white/60'>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className='mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2'>
          <div>
            <EnvelopeIcon className='h-7 w-7 text-gray-500' />
            <h2 className='mt-4 text-2xl font-semibold tracking-tight'>Human control continues after the request.</h2>
            <p className='mt-3 leading-7 text-gray-600 dark:text-gray-300'>Funding confirmations, successful trades, portfolio summaries, PnL thresholds, and claimable positions can be delivered by verified email. Links use the configured originating platform destination.</p>
          </div>
          <div className='rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.035]'>
            <h2 className='text-lg font-semibold'>Integration boundaries</h2>
            <ul className='mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300'>
              {[
                'PolyDesk never requests wallet secrets or reusable Polymarket credentials.',
                'Read-only requests can complete immediately; financial actions remain buyer-approved.',
                'Marketplace identity and return routing use allowlisted integration keys, not caller-supplied URLs.',
                'Hash PayLink remains the funding checkout, settlement-status, and receipt boundary.',
              ].map(item => <li key={item} className='flex gap-2'><CheckCircleIcon className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600' />{item}</li>)}
            </ul>
          </div>
        </section>

        <section className='border-t border-black/5 px-5 py-16 dark:border-white/10 sm:px-8'>
          <div className='mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center'>
            <div>
              <h2 className='text-2xl font-semibold'>Build on PolyDesk.</h2>
              <p className='mt-2 text-sm text-gray-600 dark:text-gray-300'>Start with the versioned public manifest or inspect the live OKX.AI service catalog.</p>
            </div>
            <div className='flex flex-wrap gap-3'>
              <Link to='/docs/okx-ai' className='inline-flex min-h-11 items-center rounded-full bg-gray-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950'>Developer guide</Link>
              <a href='/.well-known/polydesk.json' className='inline-flex min-h-11 items-center rounded-full border border-gray-300 px-5 text-sm font-semibold dark:border-white/15'>Integration manifest</a>
              <a href='https://www.okx.ai/agents/5427' target='_blank' rel='noreferrer' className='inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 px-5 text-sm font-semibold dark:border-white/15'>Agent #5427 <ArrowTopRightOnSquareIcon className='h-4 w-4' /></a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
