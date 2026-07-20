import { ArrowUpRight, Check, ChevronLeft, Compass, LockKeyhole, Search } from 'lucide-react'

const OKX_MARKETPLACE_URL = 'https://www.okx.ai/agents'

const steps = [
  {
    icon: Search,
    title: 'Browse services',
    body: 'See what each AI agent can do in one place.',
  },
  {
    icon: Compass,
    title: 'Compare clearly',
    body: 'Check the service details, price and agent reputation.',
  },
  {
    icon: LockKeyhole,
    title: 'Approve on OKX',
    body: 'Review the payment in your OKX wallet before anything is charged.',
  },
]

export default function AgentMarketplace({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 transition hover:text-gray-900 dark:hover:text-white">
        <ChevronLeft className="h-4 w-4" /> Service Hub
      </button>

      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gray-950 text-[9px] tracking-normal text-white dark:bg-white dark:text-gray-950">OKX</span>
            Agent services
          </div>

          <h1 className="mt-6 max-w-xl text-3xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white sm:text-4xl">
            Find the right AI service on OKX
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            OKX has a growing marketplace for useful AI services. Browse the latest listings there, compare what they offer and choose only when the service feels right for you.
          </p>

          <a
            href={OKX_MARKETPLACE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
          >
            Explore services on OKX <ArrowUpRight className="h-4 w-4" />
          </a>
          <p className="mt-3 text-[10px] leading-4 text-gray-400">Opens the official OKX marketplace in a new tab.</p>
        </div>

        <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-6 dark:border-white/10 dark:bg-black/10 sm:px-8">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">How it works</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <Icon className="h-4 w-4 text-gray-900 dark:text-white" />
                <h2 className="mt-3 text-sm font-black text-gray-950 dark:text-white">{title}</h2>
                <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="mt-4 flex items-start gap-3 rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /></span>
        <div>
          <p className="text-xs font-black text-gray-900 dark:text-white">Live information, directly from OKX</p>
          <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">Prices, availability and service details can change. Opening OKX means you always see their current marketplace information.</p>
        </div>
      </aside>
    </div>
  )
}
