import { ArrowUpRight, CircleDollarSign, CreditCard, FlaskConical, LockKeyhole } from 'lucide-react'

const OKX_MARKETPLACE_URL = 'https://www.okx.ai/agents'

const plannedServices = [
  { icon: FlaskConical, title: 'Market apps' },
  { icon: CircleDollarSign, title: 'x402 balance' },
  { icon: CreditCard, title: 'OKX funding' },
]

export default function AppPay() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">PolyDesk App Pay</p>
        <span className="rounded-full bg-violet-100 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">Experimental</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white sm:text-4xl">Pay for useful market apps</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">One checkout for paid market data and agent services.</p>

      <section className="polydesk-card relative mt-7 overflow-hidden p-4 sm:p-6">
        <div className="grid gap-3 opacity-35 blur-[2px] sm:grid-cols-3" aria-hidden="true">
          {plannedServices.map(({ icon: Icon, title }) => (
            <div key={title} className="flex min-h-28 flex-col justify-between rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
              <Icon className="h-5 w-5" />
              <h2 className="text-sm font-black">{title}</h2>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 grid place-items-center bg-white/25 px-5 backdrop-blur-[2px] dark:bg-[#111113]/25">
          <div className="max-w-xs rounded-2xl border border-white/80 bg-white/90 px-6 py-5 text-center shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#19191d]/90">
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-gray-950 text-white dark:bg-white dark:text-gray-950"><LockKeyhole className="h-4 w-4" /></span>
            <p className="mt-3 text-base font-black text-gray-950 dark:text-white">Coming soon</p>
            <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">x402 payments inside PolyDesk are not open yet.</p>
          </div>
        </div>
      </section>

      <section className="polydesk-card mt-4 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gray-950 text-[9px] tracking-normal text-white dark:bg-white dark:text-gray-950">OKX</span>
          Available now
        </div>
        <h2 className="mt-4 text-xl font-black tracking-tight text-gray-950 dark:text-white">Use PolyDesk services on OKX</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">Search <strong className="font-black text-gray-700 dark:text-gray-200">PolyDesk</strong> on OKX to call our endpoints or build with the returned data.</p>
        <a href={OKX_MARKETPLACE_URL} target="_blank" rel="noopener noreferrer" className="polydesk-primary-cta mt-5">
          Find PolyDesk on OKX <ArrowUpRight className="h-4 w-4" />
        </a>
      </section>
    </div>
  )
}
