import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink } from '../components/icons'

const productFlow = [
  ['01', 'Discover', 'Read live market opportunities, football context, and public wallet activity.'],
  ['02', 'Understand', 'Use the Agent, Watch, and LP Scout to turn raw market data into a clear next step.'],
  ['03', 'Act within limits', 'Verify the correct account, fund only when needed, and check price, spend, market, and expiry limits before signing.'],
  ['04', 'Keep the proof', 'Return a receipt that binds the payment, decision, order, and public execution evidence.'],
]

const evidence = [
  ['5', 'pay-per-call agent services'],
  ['1', 'A2A trading membership'],
  ['0', 'private keys requested'],
  ['Live', 'boot-enabled A2A worker'],
]

const directServices = [
  ['Football Match Live Data', '0.1 USDT', 'Provider-backed fixtures, scores, events, and matched market metadata.'],
  ['Football News Brief', '0.1 USDT', 'Current source-linked football coverage and related active markets when confidently matched.'],
  ['Verified Polymarket Funding', '0.1 USDT', 'Owner-to-Deposit-Wallet verification before a Hash PayLink checkout is created.'],
  ['Governed Polymarket Trader', '0.1 USDT', 'A bounded route from a public signal to a buyer-signed trade and verified receipt.'],
  ['Polymarket LP Scout', '0.3 USDT', 'Current spread, depth, reward, freshness, and execution-risk research.'],
]

export default function About() {
  return (
    <main className="min-h-screen bg-[#fafaf8] font-inter text-gray-950">
      <header className="border-b border-gray-200 bg-[#fafaf8]">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <img src="/brand/polydesk-mark-bw-transparent.svg" alt="" className="h-7 w-7" />
            PolyDesk
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link to="/docs" className="hidden text-gray-600 hover:text-gray-950 sm:inline">Docs</Link>
            <Link to="/docs/okx-ai" className="hidden text-gray-600 hover:text-gray-950 sm:inline">Agent services</Link>
            <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 font-semibold text-white hover:bg-gray-800">
              Open PolyDesk <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-20 sm:px-8 sm:pb-28 sm:pt-28">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Agentic prediction-market infrastructure</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-gray-950 sm:text-7xl">
          The shortest path from a live signal to a verified action.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">
          PolyDesk brings market discovery, public-wallet research, verified funding, bounded trading, and machine-readable receipts into one product for people and autonomous agents.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/polydesk?service=pulse" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white hover:bg-gray-800">
            Explore live Pulse <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/docs" className="inline-flex min-h-12 items-center rounded-lg border border-gray-300 px-5 text-sm font-semibold text-gray-800 hover:bg-white">
            Read the product guide
          </Link>
        </div>
        <p className="mt-5 text-sm text-gray-500">Browse without signing in. Connect only when an action requires account ownership, payment, or a signature.</p>
      </section>

      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
          {evidence.map(([value, label]) => (
            <div key={label} className="border-b border-gray-200 py-7 pr-5 even:pl-5 sm:py-9 lg:border-b-0 lg:border-r lg:px-7 first:pl-0 last:border-r-0 last:pr-0">
              <strong className="block text-3xl font-semibold tracking-tight text-gray-950">{value}</strong>
              <span className="mt-1 block text-sm leading-5 text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">The problem</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Market agents keep rebuilding the same missing middle.</h2>
        </div>
        <div className="space-y-6 text-lg leading-8 text-gray-600">
          <p>A signal alone is not an action. Before a buyer can act, it still needs current context, the correct Polymarket account, sufficient funds, explicit authority, safe order parameters, and proof of what happened.</p>
          <p>PolyDesk connects those steps. A person can use the public workspace, while another agent can call one focused service or delegate the complete bounded workflow.</p>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">One connected product</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Discover, understand, act, and prove.</h2>
          </div>
          <div className="mt-12 border-t border-gray-200">
            {productFlow.map(([number, title, body]) => (
              <div key={number} className="grid gap-3 border-b border-gray-200 py-7 sm:grid-cols-[4rem_12rem_1fr] sm:items-start">
                <span className="font-mono text-sm text-gray-400">{number}</span>
                <strong className="text-lg font-semibold">{title}</strong>
                <p className="max-w-2xl leading-7 text-gray-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Business model</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Pay for the result you need.</h2>
            <p className="mt-5 leading-7 text-gray-600">Agents can buy one machine-readable result instead of rebuilding an integration or committing to another data subscription. The complete A2A workflow is available as a 5 USDT monthly membership with a three-day trial on OKX.AI.</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {directServices.map(([name, price, description]) => (
              <div key={name} className="grid gap-2 border-b border-gray-200 p-5 last:border-b-0 sm:grid-cols-[1fr_auto]">
                <div>
                  <strong className="block text-sm font-semibold">{name}</strong>
                  <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-gray-700">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Infrastructure used</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">Focused product, proven rails.</h2>
            <dl className="mt-8 divide-y divide-gray-200 border-y border-gray-200">
              <div className="grid grid-cols-[8rem_1fr] gap-5 py-4"><dt className="font-semibold">Polymarket</dt><dd className="text-gray-600">Public markets, order books, positions, and execution evidence.</dd></div>
              <div className="grid grid-cols-[8rem_1fr] gap-5 py-4"><dt className="font-semibold">Hash PayLink</dt><dd className="text-gray-600">Hosted checkout, payment verification, settlement status, and receipts.</dd></div>
              <div className="grid grid-cols-[8rem_1fr] gap-5 py-4"><dt className="font-semibold">OKX.AI</dt><dd className="text-gray-600">Agent discovery, x402 distribution, A2A tasks, and buyer-controlled execution.</dd></div>
              <div className="grid grid-cols-[8rem_1fr] gap-5 py-4"><dt className="font-semibold">Sportmonks</dt><dd className="text-gray-600">Provider-backed football fixtures, scores, match events, and news.</dd></div>
            </dl>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Control boundary</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">The buyer keeps the keys.</h2>
            <p className="mt-6 text-lg leading-8 text-gray-600">PolyDesk accepts public market inputs, public addresses, signed orders, and bounded mandates. It does not ask for seed phrases, private keys, or reusable CLOB credentials.</p>
            <ul className="mt-7 space-y-3 text-sm leading-6 text-gray-600">
              <li className="border-l-2 border-gray-950 pl-4">Funding is prepared only after the owner and Deposit Wallet match.</li>
              <li className="border-l-2 border-gray-950 pl-4">Trade preparation checks exact spend, price, market, signer, and expiry limits.</li>
              <li className="border-l-2 border-gray-950 pl-4">Receipts use public payment and execution evidence instead of a trust-me success message.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Inspect the evidence</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">See the working product before the pitch.</h2>
        <div className="mt-9 grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 md:grid-cols-2">
          <Link to="/polydesk?service=pulse" className="group bg-white p-6 hover:bg-gray-50">
            <strong className="flex items-center justify-between">Live product <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></strong>
            <span className="mt-2 block text-sm leading-6 text-gray-500">Browse Pulse, Watch, Agent, LP Scout, Overview, Tip, Activity, and Rewards.</span>
          </Link>
          <Link to="/docs" className="group bg-white p-6 hover:bg-gray-50">
            <strong className="flex items-center justify-between">Product documentation <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></strong>
            <span className="mt-2 block text-sm leading-6 text-gray-500">Follow the consumer guide and learn every authentication boundary.</span>
          </Link>
          <a href="/api/a2mcp/services" className="group bg-white p-6 hover:bg-gray-50">
            <strong className="flex items-center justify-between">Machine catalog <ExternalLink className="h-4 w-4" /></strong>
            <span className="mt-2 block text-sm leading-6 text-gray-500">Inspect live service methods, prices, inputs, outputs, and safety rules.</span>
          </a>
          <a href="/api/a2a/polydesk-trading-agent" className="group bg-white p-6 hover:bg-gray-50">
            <strong className="flex items-center justify-between">A2A descriptor <ExternalLink className="h-4 w-4" /></strong>
            <span className="mt-2 block text-sm leading-6 text-gray-500">Read the complete autonomous trading lifecycle and limitations.</span>
          </a>
        </div>
      </section>

      <section className="border-t border-gray-200 bg-gray-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">PolyDesk</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Open the product. Inspect the evidence. Build on the services.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-gray-950 hover:bg-gray-100">Open PolyDesk <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/docs/okx-ai" className="inline-flex min-h-11 items-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white hover:bg-white/10">Build with PolyDesk</Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl border-t border-white/10 px-5 py-6 text-xs leading-5 text-gray-500 sm:px-8">
          Market research and execution infrastructure are not guarantees of profit. External platforms and data providers remain subject to their own availability, rules, and regional restrictions.
        </div>
      </section>
    </main>
  )
}
