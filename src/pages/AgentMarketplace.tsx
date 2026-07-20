import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  X,
} from 'lucide-react'
import { cn } from '../lib/utils'

type ServiceField = {
  name: string
  required: boolean
  description: string
  values?: string[]
}

type MarketplaceService = {
  id: string
  title: string
  description: string
  category: string
  endpoint: string
  method: 'GET' | 'POST'
  pricing: { amount: string; asset: 'USDT' | 'USDC'; network?: string }
  request?: { query?: ServiceField[] }
  output: string[]
  artifacts?: string[]
  safety?: string[]
}

type OkxCheckout = {
  paymentId: string
  paymentUrl: string
  status: string
  amount: string
  asset: string
  network: string
  expiresAt: string
}

type OkxChallenge = {
  data?: {
    expires?: string
    request?: {
      amount?: string
      currency?: string
      recipient?: string
      methodDetails?: { chainId?: number; authorizationType?: string }
    }
  }
}

type EthereumProvider = {
  isOkxWallet?: boolean
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
}

const OKX_SERVICES: MarketplaceService[] = [
  {
    id: 'okx-polymarket-lp-scout',
    title: 'Polymarket LP Scout',
    description: 'Find live reward markets with usable spreads, depth, liquidity and a practical execution checklist.',
    category: 'Market intelligence',
    endpoint: '/api/a2mcp/okx/polymarket-lp-scout',
    method: 'GET',
    pricing: { amount: '0.3', asset: 'USDT', network: 'X Layer' },
    request: { query: [
      { name: 'scoutMode', required: false, description: 'How to focus the scan.', values: ['best', 'theme', 'market'] },
      { name: 'context', required: false, description: 'Theme, market URL, sector, event or sports category.' },
      { name: 'budget', required: false, description: 'Budget context for sizing guidance.' },
    ] },
    output: ['ranked LP opportunity', 'execution checklist', 'risk flags and data gaps', 'receipt-backed report links'],
    artifacts: ['x402 receipt', 'LP Scout report', 'machine-readable result'],
    safety: ['Research only. Recheck the live Polymarket order book before acting.'],
  },
  {
    id: 'worldcup-live-scores',
    title: 'World Cup Live Scores',
    description: 'Live fixtures, scores, clocks and linked prediction-market context in one agent-readable result.',
    category: 'Sports data',
    endpoint: '/api/a2mcp/worldcup-live-scores',
    method: 'POST',
    pricing: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    output: ['match status and score', 'clock and kickoff context', 'linked Polymarket markets', 'trade-option metadata'],
  },
  {
    id: 'worldcup-market-news',
    title: 'World Cup Market News',
    description: 'Market-moving World Cup headlines, source links and impact tags for prediction-market research.',
    category: 'Market intelligence',
    endpoint: '/api/a2mcp/worldcup-market-news',
    method: 'POST',
    pricing: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    output: ['headline and summary', 'source and publish time', 'market-impact tag', 'article URL'],
  },
  {
    id: 'polymarket-portfolio-watch',
    title: 'Polymarket Portfolio Watch',
    description: 'Read a public wallet’s positions, portfolio value, PnL and claimable markets without custody.',
    category: 'Portfolio',
    endpoint: '/api/a2mcp/polymarket-portfolio-watch',
    method: 'POST',
    pricing: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    request: { query: [
      { name: 'wallet', required: true, description: 'Public Polymarket 0x wallet.' },
      { name: 'limit', required: false, description: 'Positions to inspect, up to 100.' },
    ] },
    output: ['portfolio value estimate', 'open positions and PnL', 'claimable positions', 'freshness metadata'],
    safety: ['Read-only. PolyDesk never takes custody or places a trade.'],
  },
  {
    id: 'polymarket-funding-link',
    title: 'Polymarket Funding Link',
    description: 'Create a hosted Hash PayLink checkout for a specific public Polymarket wallet.',
    category: 'Funding',
    endpoint: '/api/a2mcp/polymarket-funding-link',
    method: 'POST',
    pricing: { amount: '0.1', asset: 'USDT', network: 'X Layer' },
    request: { query: [
      { name: 'wallet', required: true, description: 'Public Polymarket 0x wallet to fund.' },
      { name: 'amount', required: true, description: 'Funding amount in USDC. Minimum 3.' },
      { name: 'network', required: false, description: 'Network used to fund.', values: ['base', 'arbitrum', 'solana'] },
    ] },
    output: ['hosted checkout URL', 'bridge deposit address', 'tracking request id', 'funding safety instructions'],
    safety: ['Review the destination wallet before opening the checkout.'],
  },
]

const categories = ['All', 'Market intelligence', 'Sports data', 'Portfolio', 'Funding']
function humanPaymentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return message || 'The OKX checkout could not be completed.'
}

export default function AgentMarketplace({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MarketplaceService | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [checkout, setCheckout] = useState<OkxCheckout | null>(null)
  const [busy, setBusy] = useState<'create' | 'pay' | 'status' | ''>('')
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | unknown[] | null>(null)
  const [copied, setCopied] = useState(false)

  const visibleServices = useMemo(() => OKX_SERVICES.filter(service => {
    const categoryMatch = category === 'All' || service.category === category
    const searchMatch = !query.trim() || `${service.title} ${service.description} ${service.category}`.toLowerCase().includes(query.trim().toLowerCase())
    return categoryMatch && searchMatch
  }), [category, query])

  function openService(service: MarketplaceService) {
    const defaults: Record<string, string> = {}
    for (const field of service.request?.query ?? []) {
      if (field.values?.length) defaults[field.name] = field.values[0]
    }
    setSelected(service)
    setValues(defaults)
    setCheckout(null)
    setResult(null)
    setNotice('')
  }

  function closeService() {
    setSelected(null)
    setCheckout(null)
    setResult(null)
    setNotice('')
  }

  async function createCheckout() {
    if (!selected || busy) return
    for (const field of selected.request?.query ?? []) {
      if (field.required && !values[field.name]?.trim()) {
        setNotice(`${field.name} is required before requesting the service.`)
        return
      }
    }
    setBusy('create')
    setNotice('Creating your official OKX checkout…')
    setCheckout(null)
    setResult(null)
    try {
      const response = await fetch('/api/okx-marketplace-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', serviceId: selected.id, inputs: values }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; checkout?: OkxCheckout } | null
      if (!response.ok || !data?.ok || !data.checkout?.paymentUrl) throw new Error(data?.error || 'OKX did not return a checkout link.')
      setCheckout(data.checkout)
      setNotice('Payment request ready. Connect OKX Wallet to review and sign the exact X Layer authorization.')
    } catch (error) {
      setNotice(humanPaymentError(error))
    } finally {
      setBusy('')
    }
  }

  async function payWithOkxWallet() {
    if (!checkout || busy) return
    const provider = (window as typeof window & { okxwallet?: EthereumProvider }).okxwallet
    if (!provider?.request || !provider.isOkxWallet) {
      setNotice('OKX Wallet was not detected. Install or open the OKX Wallet extension, then try again.')
      return
    }
    setBusy('pay')
    setNotice('Connecting OKX Wallet and loading the payment termsâ€¦')
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      const from = accounts?.[0]
      if (!/^0x[a-fA-F0-9]{40}$/.test(from ?? '')) throw new Error('OKX Wallet did not return a valid EVM account.')
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xc4' }] })
      } catch (error) {
        if ((error as { code?: number })?.code !== 4902) throw error
        await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xc4', chainName: 'X Layer', nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 }, rpcUrls: ['https://rpc.xlayer.tech'], blockExplorerUrls: ['https://www.oklink.com/xlayer'] }] })
      }
      const challengeResponse = await fetch('/api/okx-marketplace-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'challenge', paymentId: checkout.paymentId }) })
      const challengeData = await challengeResponse.json().catch(() => null) as { ok?: boolean; error?: string; challenge?: OkxChallenge } | null
      const request = challengeData?.challenge?.data?.request
      if (!challengeResponse.ok || !challengeData?.ok || !request?.amount || !request.currency || !request.recipient) throw new Error(challengeData?.error || 'Could not load the OKX payment terms.')
      if (request.methodDetails?.chainId !== 196 || request.methodDetails.authorizationType !== 'eip-3009') throw new Error('OKX returned an unsupported payment authorization.')
      const expiresAt = Date.parse(challengeData.challenge?.data?.expires ?? checkout.expiresAt)
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('This payment request expired. Create a fresh checkout.')
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
      const nonce = `0x${Array.from(nonceBytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
      const authorization = { from, to: request.recipient, value: request.amount, validAfter: '0', validBefore: String(Math.floor(expiresAt / 1000)), nonce }
      const typedData = {
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
          TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }],
        },
        primaryType: 'TransferWithAuthorization',
        domain: { name: 'USD\u20AE0', version: '1', chainId: 196, verifyingContract: request.currency },
        message: authorization,
      }
      setNotice(`Review the ${checkout.amount} ${checkout.asset} authorization in OKX Wallet. PolyDesk cannot sign for you.`)
      const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [from, JSON.stringify(typedData)] })
      if (typeof signature !== 'string') throw new Error('OKX Wallet did not return a signature.')
      const submitResponse = await fetch('/api/okx-marketplace-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'credential', paymentId: checkout.paymentId, signature, authorization }) })
      const submitted = await submitResponse.json().catch(() => null) as { ok?: boolean; status?: string; error?: string } | null
      if (!submitResponse.ok || !submitted?.ok) throw new Error(submitted?.error || 'OKX rejected the signed payment.')
      setCheckout(current => current ? { ...current, status: submitted.status || 'settling' } : current)
      setNotice('Payment signature accepted. Waiting for X Layer confirmation and service deliveryâ€¦')
    } catch (error) {
      setNotice(humanPaymentError(error))
    } finally {
      setBusy('')
    }
  }

  async function checkCheckoutStatus(silent = false) {
    if (!checkout || busy === 'status') return
    setBusy('status')
    if (!silent) setNotice('Checking OKX payment and deliverable status…')
    try {
      const response = await fetch('/api/okx-marketplace-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', paymentId: checkout.paymentId }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; status?: string; error?: string; deliverable?: Record<string, unknown> | unknown[] } | null
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Could not verify the OKX payment.')
      setCheckout(current => current ? { ...current, status: data.status || current.status } : current)
      if (data.status === 'completed' && data.deliverable) {
        setResult(data.deliverable)
        setNotice('OKX payment settled. Your reusable service deliverable is ready.')
      } else if (!silent) {
        setNotice(data.status === 'delivering' ? 'Payment confirmed. PolyDesk is preparing the deliverable…' : 'Payment is still waiting for approval or settlement on OKX.')
      }
    } catch (error) {
      setNotice(humanPaymentError(error))
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    if (!checkout || result) return undefined
    const timer = window.setInterval(() => void checkCheckoutStatus(true), 4_000)
    return () => window.clearInterval(timer)
  }, [checkout?.paymentId, result]) // eslint-disable-line react-hooks/exhaustive-deps

  async function copyResult() {
    if (!result || !navigator.clipboard) return
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
        <ChevronLeft className="h-4 w-4" /> Service Hub
      </button>

      <section className="overflow-hidden rounded-[2rem] bg-[#08090b] text-white shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
        <div className="relative isolate overflow-hidden px-5 py-7 sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-[#00d68f]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 left-1/4 -z-10 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#62e6b5]">
                <Sparkles className="h-3 w-3" /> OKX Agent Economy
              </span>
              <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Buy useful agent services.<br /><span className="text-white/45">Keep the deliverable.</span></h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">Choose a service, set its inputs, then review and sign payment with OKX Wallet. No coding assistant or server-side wallet session required.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#00d68f]/15 text-[#62e6b5]"><Wallet className="h-4 w-4" /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Payment wallet</p><p className="mt-0.5 text-xs font-bold">OKX Agentic Wallet</p></div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services" className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-gray-400" />
        </label>
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          {categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-[10px] font-bold transition', category === item ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]')}>{item}</button>)}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {visibleServices.map((service, index) => (
          <button key={service.id} type="button" onClick={() => openService(service)} className="group rounded-[1.5rem] border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.065]">
            <div className="flex items-start justify-between gap-3">
              <span className={cn('grid h-10 w-10 place-items-center rounded-2xl', index % 3 === 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300' : index % 3 === 1 ? 'bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300' : 'bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300')}><Store className="h-4 w-4" /></span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-700 dark:bg-white/[0.08] dark:text-white">{service.pricing.amount} {service.pricing.asset}</span>
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{service.category}</p>
            <h2 className="mt-1.5 text-lg font-black tracking-tight text-gray-950 dark:text-white">{service.title}</h2>
            <p className="mt-2 min-h-12 text-xs leading-5 text-gray-500 dark:text-gray-400">{service.description}</p>
            <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-white/[0.07]">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> OKX Pay · X Layer</span>
              <span className="inline-flex items-center gap-1 text-xs font-black text-gray-800 transition group-hover:gap-2 dark:text-white">Open <ArrowRight className="h-3.5 w-3.5" /></span>
            </div>
          </button>
        ))}
      </div>

      <section className="mt-6 rounded-[1.5rem] border border-dashed border-gray-300 bg-white/40 p-5 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Circle marketplace</p><p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-200">Circle Gateway services join after the OKX buyer path.</p></div>
          <span className="rounded-full border border-gray-200 px-3 py-1.5 text-[10px] font-black text-gray-400 dark:border-white/10">NEXT</span>
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={selected.title}>
          <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-[#f7f7f9] p-5 shadow-2xl dark:bg-[#171719] sm:rounded-[2rem] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">OKX · {selected.category}</p><h2 className="mt-2 text-2xl font-black tracking-tight">{selected.title}</h2><p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{selected.description}</p></div>
              <button type="button" onClick={closeService} aria-label="Close service" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-gray-500 shadow-sm dark:bg-white/[0.07]"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[['Price', `${selected.pricing.amount} ${selected.pricing.asset}`], ['Network', selected.pricing.network ?? 'X Layer'], ['Method', selected.method]].map(([label, value]) => <div key={label} className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]"><p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{label}</p><p className="mt-1 text-xs font-black">{value}</p></div>)}
            </div>

            {(selected.request?.query?.length ?? 0) > 0 && <div className="mt-5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Service inputs</p>
              {selected.request?.query?.map(field => <label key={field.name} className="block"><span className="mb-1.5 flex items-center gap-1 text-xs font-bold">{field.name}{field.required && <span className="text-red-500">*</span>}</span>{field.values ? <select value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.05]">{field.values.map(value => <option key={value} value={value}>{value}</option>)}</select> : <input value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} placeholder={field.description} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.05]" />}<span className="mt-1 block text-[10px] leading-4 text-gray-400">{field.description}</span></label>)}
            </div>}

            <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">You receive</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{selected.output.map(item => <div key={item} className="flex items-start gap-2 text-xs font-semibold leading-5 text-gray-600 dark:text-gray-300"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> {item}</div>)}</div>
            </div>

            {notice && <div role="status" className={cn('mt-4 rounded-2xl px-4 py-3 text-xs font-semibold leading-5', result ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200' : 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200')}>{notice}</div>}

            {Boolean(result) && <div className="mt-4 overflow-hidden rounded-2xl bg-[#0b0c0e] text-white"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Deliverable</p><p className="mt-0.5 text-xs font-bold">Reusable JSON</p></div><button type="button" onClick={() => void copyResult()} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold hover:bg-white/15"><Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy JSON'}</button></div><pre className="max-h-64 overflow-auto p-4 text-[10px] leading-5 text-white/70">{JSON.stringify(result, null, 2)}</pre></div>}

            {checkout && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-300/15 dark:bg-amber-300/[0.08] dark:text-amber-100"><div className="flex items-start gap-3"><CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-black">{checkout.amount} {checkout.asset} through OKX</p><p className="mt-1 text-[11px] leading-5 opacity-70">OKX Wallet shows the exact amount and recipient before signing. PolyDesk receives only the public signature and releases the deliverable after settlement.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void payWithOkxWallet()} disabled={Boolean(busy) || checkout.status !== 'pending'} className="inline-flex items-center gap-2 rounded-full bg-amber-950 px-4 py-2 text-[10px] font-black text-white disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950">{busy === 'pay' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />} Connect OKX Wallet & pay</button><button type="button" onClick={() => void checkCheckoutStatus()} disabled={busy === 'status'} className="inline-flex items-center gap-2 rounded-full border border-amber-900/15 px-4 py-2 text-[10px] font-black disabled:opacity-50">{busy === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Check payment</button></div><p className="mt-2 truncate font-mono text-[9px] opacity-45">{checkout.paymentId} · {checkout.status}</p></div></div></div>}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeService} className="rounded-full px-5 py-3 text-xs font-bold text-gray-500 hover:bg-gray-200/60 dark:hover:bg-white/[0.06]">Close</button>
              {!result && !checkout && <button type="button" onClick={() => void createCheckout()} disabled={Boolean(busy)} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-full bg-[#00b87a] px-5 py-3 text-xs font-black text-white shadow-lg shadow-emerald-500/15 disabled:opacity-50">{busy === 'create' ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating checkout</> : <><Wallet className="h-4 w-4" /> Continue with OKX <ArrowRight className="h-4 w-4" /></>}</button>}
              {result && <a href={selected.endpoint} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-xs font-black text-white dark:bg-white dark:text-gray-950">Service endpoint <ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
