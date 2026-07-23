import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { rememberLpScoutActivity } from '../lib/polydeskTradeActivity'

type AgentWorkspaceProps = {
  embedded?: boolean
  forceProfile?: boolean
  requestParams?: URLSearchParams | Record<string, string | undefined>
}

type LpScoutResponse = {
  ok?: boolean
  error?: string
  checkoutUrl?: string
  scout?: {
    summary?: string
  }
  artifacts?: {
    resultActivityId?: string
    x402ReceiptUrl?: string
    zeroScoutStatus?: string
  }
}

function mergedParams(requestParams?: AgentWorkspaceProps['requestParams']) {
  const params = new URLSearchParams(window.location.search)
  if (!requestParams) return params
  if (requestParams instanceof URLSearchParams) {
    requestParams.forEach((value, key) => {
      if (value) params.set(key, value)
    })
  } else {
    Object.entries(requestParams).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
  }
  return params
}

function trustedHashPayLinkUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'app.hashpaylink.com' ? url.toString() : ''
  } catch {
    return ''
  }
}

export default function AgentWorkspace({ requestParams }: AgentWorkspaceProps = {}) {
  const navigate = useNavigate()
  const params = useMemo(() => mergedParams(requestParams), [requestParams])
  const pendingLpScout = params.get('run') === 'polymarket-scout'
  const scoutMode = params.get('scoutMode') || 'best'
  const context = params.get('context') || ''
  const budget = params.get('budget') || ''
  const maxAmount = params.get('maxAmount') || '0.01'
  const returnRequestId = params.get('requestId') || ''
  const network = params.get('network') || params.get('n') || 'arc'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const resumedRequestRef = useRef('')

  async function runLpScout() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const requestId = returnRequestId || window.crypto.randomUUID()
      const query = new URLSearchParams({
        requestId,
        network: network === 'base' ? 'base' : 'arc',
        scoutMode,
        agent: 'polydesk-agent',
      })
      if (context) query.set('context', context)
      if (budget) query.set('budget', budget)
      const response = await fetch(`/api/x402/polymarket-scout?${query.toString()}`, {
        headers: { Accept: 'application/json' },
      })
      const body = await response.json().catch(() => ({})) as LpScoutResponse
      if (response.status === 402) {
        const checkoutUrl = trustedHashPayLinkUrl(body.checkoutUrl || '')
        if (!checkoutUrl) throw new Error('Hash PayLink returned an invalid checkout URL.')
        window.location.assign(checkoutUrl)
        return
      }
      if (!response.ok || !body.ok) throw new Error(body.error || 'LP Scout could not verify the Hash PayLink payment.')
      const resultActivityId = body.artifacts?.resultActivityId || ''
      if (!resultActivityId) throw new Error('LP Scout returned no saved result.')
      const receiptUrl = trustedHashPayLinkUrl(body.artifacts?.x402ReceiptUrl || '')
      rememberLpScoutActivity({ resultActivityId, agentSlug: 'polydesk-agent' })
      setComplete(true)
      const next = new URLSearchParams({
        agent: '1',
        lane: 'lp-scout',
        lpScoutActivity: resultActivityId,
        lpScoutAgent: 'polydesk-agent',
        agentMessage: 'View LP Scout result',
      })
      if (receiptUrl) next.set('lpScoutReceiptUrl', receiptUrl)
      navigate(`/?${next.toString()}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LP Scout checkout could not continue.')
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!pendingLpScout || !returnRequestId || resumedRequestRef.current === returnRequestId) return
    resumedRequestRef.current = returnRequestId
    void runLpScout()
  }, [pendingLpScout, returnRequestId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pendingLpScout) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111114]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Wallet and x402 managed by Hash PayLink</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              PolyDesk no longer creates wallets, holds Gateway balances, or executes embedded x402 payments.
            </p>
          </div>
        </div>
        <a
          href="https://app.hashpaylink.com/agent"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-950"
        >
          Open Hash PayLink <ExternalLink className="h-4 w-4" />
        </a>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111114]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-950 dark:text-white">Polymarket LP Scout</p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Checkout, wallet access, and payment verification happen on Hash PayLink.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">
          {maxAmount} USDC
        </span>
      </div>
      {(context || budget) && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          {context && <span className="max-w-full truncate rounded-full bg-gray-50 px-2.5 py-1 dark:bg-white/[0.06]">{context}</span>}
          {budget && <span className="rounded-full bg-gray-50 px-2.5 py-1 dark:bg-white/[0.06]">Budget {budget}</span>}
        </div>
      )}
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-[11px] leading-5 text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
        PolyDesk receives only authoritative paid status and the receipt link required to deliver your research result.
      </div>
      {error && <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
      <button
        type="button"
        onClick={() => void runLpScout()}
        disabled={busy || complete}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950"
      >
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming with Hash PayLink</> : complete ? <><CheckCircle2 className="h-4 w-4" /> Payment confirmed</> : <>Continue to Hash PayLink <ArrowRight className="h-4 w-4" /></>}
      </button>
    </section>
  )
}
