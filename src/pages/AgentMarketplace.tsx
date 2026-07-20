import { useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ChevronLeft, Copy, ExternalLink, Loader2, Search, ShieldCheck, Sparkles, Store, Wallet, X } from 'lucide-react'
import { cn } from '../lib/utils'

type Json = Record<string, unknown>
type Agent = { id: string; name: string; rating: string; minPrice: string; topService: string; raw: Json }
type Service = { id: string; agentId: string; name: string; type: string; fee: string; endpoint: string; description: string; method: string; raw: Json }
type QuoteChoice = { index: number; amount: string; token: string; network: string; payTo: string; raw: Json }

function record(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined
}

function value(item: Json | undefined, ...keys: string[]) {
  for (const key of keys) {
    const next = item?.[key]
    if (typeof next === 'string' || typeof next === 'number') return String(next)
  }
  return ''
}

function deepValue(root: unknown, ...keys: string[]) {
  const queue = [root]
  const seen = new Set<unknown>()
  while (queue.length) {
    const next = queue.shift()
    if (!next || typeof next !== 'object' || seen.has(next)) continue
    seen.add(next)
    const item = record(next)
    if (item) {
      const found = value(item, ...keys)
      if (found) return found
      queue.push(...Object.values(item))
    } else if (Array.isArray(next)) queue.push(...next)
  }
  return ''
}

function nestedArray(root: unknown, keys: string[]) {
  const item = record(root)
  for (const key of keys) if (Array.isArray(item?.[key])) return item[key] as unknown[]
  const data = record(item?.data)
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key] as unknown[]
  return Array.isArray(root) ? root : []
}

function agentsFrom(root: unknown): Agent[] {
  return nestedArray(root, ['list', 'agents', 'items']).flatMap((entry, index) => {
    const item = record(entry)
    if (!item) return []
    const cells = Array.isArray(item.cells) ? item.cells.map(String) : []
    const id = value(item, 'agentId', 'id') || cells[0]?.replace(/^#/, '') || String(index + 1)
    return [{
      id: id.replace(/^#/, ''),
      name: value(item, 'name', 'agentName') || cells[1] || `Agent #${id}`,
      rating: value(item, 'ratingStars', 'feedbackRate', 'rating') || cells[2] || 'No rating yet',
      minPrice: value(item, 'minPrice', 'fee') || cells[3] || '—',
      topService: value(item, 'topService', 'serviceName') || cells[4] || 'Open services',
      raw: item,
    }]
  })
}

function servicesFrom(root: unknown, agentId: string): Service[] {
  return nestedArray(root, ['services', 'list', 'items']).flatMap((entry, index) => {
    const item = record(entry)
    if (!item) return []
    const cells = Array.isArray(item.cells) ? item.cells.map(String) : []
    const endpoint = value(item, 'endpoint', 'url') || cells[4] || ''
    return [{
      id: (value(item, 'id', 'serviceId') || cells[0] || `${agentId}-${index}`).replace(/^#/, ''),
      agentId,
      name: value(item, 'serviceName', 'name') || cells[1] || `Service ${index + 1}`,
      type: value(item, 'serviceType', 'type') || cells[2] || 'API service',
      fee: value(item, 'fee', 'price') || cells[3] || 'free',
      endpoint: endpoint.replace(/^`|`$/g, ''),
      description: value(item, 'serviceDescription', 'description') || cells[5] || 'Agent service',
      method: (value(item, 'method') || 'GET').toUpperCase(),
      raw: item,
    }]
  })
}

function quoteChoices(root: unknown): QuoteChoice[] {
  const quote = record(root)
  const candidates = nestedArray(quote, ['candidates', 'alternatives', 'accepts'])
  return candidates.flatMap((entry, index) => {
    const item = record(entry)
    if (!item) return []
    return [{
      index: Number(item.acceptsIndex ?? item.index ?? index),
      amount: deepValue(item, 'amountDisplay', 'displayAmount', 'amount', 'maxAmountRequired'),
      token: deepValue(item, 'symbol', 'token', 'asset', 'currency'),
      network: deepValue(item, 'networkLabel', 'network', 'chainId'),
      payTo: deepValue(item, 'payTo', 'recipient'),
      raw: item,
    }]
  })
}

async function api(token: string, body: Json) {
  const response = await fetch('/api/okx-agentic-marketplace', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null) as Json | null
  if (!response.ok || data?.ok !== true) throw new Error(value(data ?? undefined, 'error') || 'OKX marketplace request failed.')
  return data
}

export default function AgentMarketplace({ onBack }: { onBack: () => void }) {
  const { authenticated, getAccessToken } = usePrivy()
  const [walletReady, setWalletReady] = useState(false)
  const [login, setLogin] = useState<{ sessionId: string; url: string } | null>(null)
  const [query, setQuery] = useState('API services')
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [selected, setSelected] = useState<Service | null>(null)
  const [paramsText, setParamsText] = useState('{}')
  const [quote, setQuote] = useState<Json | null>(null)
  const [choice, setChoice] = useState<QuoteChoice | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

  async function withToken(body: Json) {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in to PolyDesk first.')
    return api(token, body)
  }

  useEffect(() => {
    if (!authenticated) return
    void withToken({ action: 'status' }).then(data => {
      const wallet = record(data.wallet)
      setWalletReady(wallet?.loggedIn === true)
    }).catch(() => setWalletReady(false))
  }, [authenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  async function beginLogin() {
    setBusy('login'); setNotice('Creating a secure OKX Agentic Wallet login…')
    try {
      const data = await withToken({ action: 'login-init' })
      const payload = record(data.login)
      const url = value(payload, 'loginUrl')
      const sessionId = value(payload, 'authSessionId')
      if (!url || !sessionId) throw new Error('OKX did not return a login session.')
      setLogin({ url, sessionId }); window.open(url, '_blank', 'noopener,noreferrer')
      setNotice('Finish the OKX login in the new tab, then return here and confirm.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'OKX login failed.') } finally { setBusy('') }
  }

  async function finishLogin() {
    if (!login) return
    setBusy('poll'); setNotice('Confirming your TEE-backed Agentic Wallet session…')
    try {
      await withToken({ action: 'login-poll', sessionId: login.sessionId })
      setWalletReady(true); setLogin(null); setNotice('OKX Agentic Wallet connected. Search the live marketplace.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Login is not complete yet.') } finally { setBusy('') }
  }

  async function search() {
    if (!query.trim()) return
    setBusy('search'); setNotice('Searching the live OKX agent registry…'); setSelectedAgent(null); setServices([])
    try {
      const data = await withToken({ action: 'search', query: query.trim() })
      const catalog = data.catalog
      const next = agentsFrom(catalog)
      setAgents(next); setTotal(Number(record(catalog)?.total ?? next.length)); setNotice(next.length ? '' : `No OKX agents matched “${query.trim()}”. Try a broader search.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Marketplace search failed.') } finally { setBusy('') }
  }

  async function openAgent(agent: Agent) {
    setSelectedAgent(agent); setServices([]); setBusy('services'); setNotice('Loading this agent’s live services…')
    try {
      const data = await withToken({ action: 'services', agentId: agent.id })
      const next = servicesFrom(data.services, agent.id)
      setServices(next); setNotice(next.length ? '' : 'This agent has no currently callable API services.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load services.') } finally { setBusy('') }
  }

  function parseParams() {
    const parsed = JSON.parse(paramsText || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Service inputs must be a JSON object.')
    return parsed as Json
  }

  async function createQuote() {
    if (!selected) return
    setBusy('quote'); setNotice('Probing the service and preparing exact OKX payment terms…'); setQuote(null); setChoice(null); setResult(null)
    try {
      const data = await withToken({ action: 'quote', agentId: selected.agentId, serviceId: selected.id, endpoint: selected.endpoint, method: selected.method, params: parseParams() })
      const root = record(data.quote) ?? {}
      const choices = quoteChoices(root)
      const recommended = choices.find(item => record(item.raw)?.recommended === true) ?? choices[0]
      if (!value(root, 'paymentId') || !recommended || !recommended.amount || !recommended.token || !recommended.network || !recommended.payTo || !Number.isInteger(recommended.index)) {
        throw new Error('This endpoint did not return complete, conformant OKX payment terms. No payment was submitted.')
      }
      setQuote(root); setChoice(recommended); setNotice('Review the exact terms below. Payment happens only when you approve.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create payment quote.') } finally { setBusy('') }
  }

  async function pay() {
    if (!quote || !choice) return
    setBusy('pay'); setNotice('OKX Agentic Wallet is signing in the TEE, replaying the request, and capturing the deliverable…')
    try {
      const data = await withToken({ action: 'pay', approved: true, paymentId: value(quote, 'paymentId'), selectedIndex: choice.index, params: parseParams() })
      setResult(data.purchase); setNotice('Payment completed and the service deliverable was returned.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Payment failed.') } finally { setBusy('') }
  }

  const displayAgents = useMemo(() => agents, [agents])

  return <div className="mx-auto w-full max-w-5xl">
    <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500"><ChevronLeft className="h-4 w-4" /> Service Hub</button>
    <section className="overflow-hidden rounded-[2rem] bg-[#08090b] px-6 py-8 text-white shadow-xl sm:px-9">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#62e6b5]"><Sparkles className="h-3 w-3" /> OKX Agent Economy</span>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-[-0.04em] sm:text-5xl">The live OKX service market.<br /><span className="text-white/45">One clean buyer flow.</span></h1><p className="mt-4 max-w-2xl text-sm leading-6 text-white/55">Discover listed OKX agents, inspect their services, approve exact payment terms, and keep the returned deliverable.</p></div><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3"><Wallet className="h-5 w-5 text-[#62e6b5]" /><div><p className="text-[10px] uppercase tracking-widest text-white/35">Payment wallet</p><p className="text-xs font-bold">{walletReady ? 'Agentic Wallet connected' : 'Agentic Wallet not connected'}</p></div></div></div>
    </section>

    {!walletReady ? <section className="mt-6 rounded-[1.5rem] border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]"><h2 className="text-lg font-black">Connect OKX Agentic Wallet</h2><p className="mt-2 text-xs leading-5 text-gray-500">Use OKX browser login. Your signing key stays in the OKX TEE; PolyDesk stores only your isolated Agentic Wallet session.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void beginLogin()} disabled={Boolean(busy)} className="rounded-full bg-gray-950 px-5 py-3 text-xs font-black text-white disabled:opacity-50">{busy === 'login' ? 'Preparing login…' : 'Sign in with OKX'}</button>{login && <><a href={login.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border px-5 py-3 text-xs font-black">Open login <ExternalLink className="h-3.5 w-3.5" /></a><button onClick={() => void finishLogin()} disabled={Boolean(busy)} className="rounded-full bg-[#00b87a] px-5 py-3 text-xs font-black text-white">{busy === 'poll' ? 'Checking…' : 'I finished signing in'}</button></>}</div></section> : <>
      <form onSubmit={event => { event.preventDefault(); void search() }} className="mt-6 flex gap-2"><label className="flex flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]"><Search className="h-4 w-4 text-gray-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search live OKX agents and services" className="w-full bg-transparent text-sm outline-none" /></label><button disabled={busy === 'search'} className="rounded-2xl bg-gray-950 px-5 text-xs font-black text-white dark:bg-white dark:text-gray-950">{busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</button></form>
      {displayAgents.length > 0 && <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Showing {displayAgents.length}{total > displayAgents.length ? ` of ${total}` : ''} live results</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">{displayAgents.map(agent => <button key={agent.id} onClick={() => void openAgent(agent)} className="rounded-[1.5rem] border border-gray-200 bg-white p-5 text-left shadow-sm dark:border-white/10 dark:bg-white/[0.04]"><div className="flex items-start justify-between"><Store className="h-5 w-5 text-emerald-500" /><span className="text-[10px] font-black text-gray-400">#{agent.id}</span></div><h2 className="mt-4 text-lg font-black">{agent.name}</h2><p className="mt-1 text-xs text-gray-500">{agent.topService}</p><div className="mt-4 flex justify-between border-t pt-3 text-[10px] font-bold text-gray-400 dark:border-white/10"><span>{agent.rating}</span><span>{agent.minPrice}</span></div></button>)}</div>
    </>}

    {notice && <p role="status" className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">{notice}</p>}

    {selectedAgent && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 sm:items-center sm:p-5"><div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-[#f7f7f9] p-5 dark:bg-[#171719] sm:rounded-[2rem] sm:p-7"><div className="flex justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">OKX agent #{selectedAgent.id}</p><h2 className="mt-2 text-2xl font-black">{selectedAgent.name}</h2></div><button onClick={() => { setSelectedAgent(null); setSelected(null); setQuote(null); setResult(null) }} className="grid h-9 w-9 place-items-center rounded-full bg-white dark:bg-white/10"><X className="h-4 w-4" /></button></div>
      <div className="mt-5 space-y-2">{busy === 'services' && <p className="py-8 text-center text-xs text-gray-400">Loading live services…</p>}{services.map(service => <button key={service.id} onClick={() => { setSelected(service); setQuote(null); setChoice(null); setResult(null); setParamsText('{}') }} className={cn('w-full rounded-2xl border p-4 text-left', selected?.id === service.id ? 'border-gray-950 bg-white dark:border-white dark:bg-white/10' : 'border-gray-200 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]')}><div className="flex justify-between gap-3"><div><p className="text-sm font-black">{service.name}</p><p className="mt-1 text-xs leading-5 text-gray-500">{service.description}</p></div><span className="shrink-0 text-xs font-black">{service.fee === 'free' ? 'Free' : `${service.fee}${/USDT/i.test(service.fee) ? '' : ' USDT'}`}</span></div><p className="mt-2 truncate font-mono text-[9px] text-gray-400">{service.endpoint || 'Negotiated service'}</p></button>)}</div>
      {selected && <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Service inputs</p><p className="mt-1 text-[10px] text-gray-400">Enter the endpoint’s named inputs as JSON. Use {'{}'} when none are required.</p><textarea value={paramsText} onChange={event => setParamsText(event.target.value)} rows={4} className="mt-3 w-full rounded-xl border bg-transparent p-3 font-mono text-xs dark:border-white/10" />{!quote && !result && <button onClick={() => void createQuote()} disabled={Boolean(busy) || !selected.endpoint} className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-xs font-black text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy === 'quote' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Review OKX payment terms</button>}</div>}
      {quote && choice && !result && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-300/15 dark:bg-amber-300/[0.08] dark:text-amber-100"><p className="text-sm font-black">Confirm this OKX Agent Payments Protocol purchase</p><dl className="mt-3 grid gap-2 text-xs"><div className="flex justify-between gap-4"><dt>Amount</dt><dd className="font-black">{choice.amount} {choice.token}</dd></div><div className="flex justify-between gap-4"><dt>Network</dt><dd className="font-black">{choice.network}</dd></div><div className="flex justify-between gap-4"><dt>Pay to</dt><dd className="max-w-[65%] truncate font-mono text-[10px]">{choice.payTo}</dd></div></dl><p className="mt-3 text-[10px] leading-4 opacity-70">This button approves this one payment. The TEE signs, replays the service request, and returns its deliverable.</p><button onClick={() => void pay()} disabled={Boolean(busy)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-950 px-5 py-3 text-xs font-black text-white disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950">{busy === 'pay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Approve and pay</button></div>}
      {Boolean(result) && <div className="mt-4 overflow-hidden rounded-2xl bg-[#0b0c0e] text-white"><div className="flex justify-between border-b border-white/10 px-4 py-3"><div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Deliverable</p><p className="text-xs font-bold">OKX payment result</p></div><button onClick={() => { void navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setCopied(true); window.setTimeout(() => setCopied(false), 1400) }} className="inline-flex items-center gap-1 text-[10px] font-bold"><Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}</button></div><pre className="max-h-72 overflow-auto p-4 text-[10px] leading-5 text-white/70">{JSON.stringify(result, null, 2)}</pre></div>}
      <button onClick={() => { setSelectedAgent(null); setSelected(null); setQuote(null); setResult(null) }} className="mt-5 rounded-full px-5 py-3 text-xs font-bold text-gray-500">Close</button></div></div>}
  </div>
}
