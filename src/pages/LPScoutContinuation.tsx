import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, TriangleAlert } from '../components/icons'
import { trustedHashPayLinkUrl } from '../lib/hashPayLinkUrl'
import { rememberLpScoutActivity } from '../lib/polydeskTradeActivity'

type LpScoutResponse = {
  ok?: boolean
  error?: string
  checkoutUrl?: string
  artifacts?: {
    resultActivityId?: string
    receiptActivityId?: string
  }
}

export default function LPScoutContinuation() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function resume() {
      try {
        const requestId = params.get('requestId') || ''
        if (!/^[a-zA-Z0-9_-]{16,64}$/.test(requestId)) {
          throw new Error('This LP Scout continuation link is invalid.')
        }
        const query = new URLSearchParams({
          requestId,
          network: 'arc',
          scoutMode: params.get('scoutMode') || 'best',
          agent: params.get('agent') || 'polydesk-agent',
        })
        const context = params.get('context') || ''
        const budget = params.get('budget') || ''
        if (context) query.set('context', context)
        if (budget) query.set('budget', budget)

        const response = await fetch(`/api/x402/polymarket-scout?${query.toString()}`, {
          headers: { Accept: 'application/json' },
        })
        const body = await response.json().catch(() => ({})) as LpScoutResponse
        if (response.status === 402) {
          const checkoutUrl = trustedHashPayLinkUrl(body.checkoutUrl || '', '/pay/')
          if (!checkoutUrl) throw new Error('Hash PayLink returned an invalid checkout URL.')
          window.location.assign(checkoutUrl)
          return
        }
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'LP Scout could not verify the Hash PayLink payment.')
        }
        const resultActivityId = body.artifacts?.resultActivityId || ''
        if (!resultActivityId) throw new Error('LP Scout returned no saved report.')
        rememberLpScoutActivity({
          resultActivityId,
          receiptActivityId: body.artifacts?.receiptActivityId,
          agentSlug: query.get('agent') || 'polydesk-agent',
        })
        const reportQuery = new URLSearchParams()
        if (body.artifacts?.receiptActivityId) reportQuery.set('receipt', body.artifacts.receiptActivityId)
        const suffix = reportQuery.toString()
        navigate(`/report/lp-scout/${encodeURIComponent(resultActivityId)}${suffix ? `?${suffix}` : ''}`, { replace: true })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'LP Scout checkout could not continue.')
      }
    }

    void resume()
  }, [navigate, params])

  return (
    <main className="grid min-h-screen place-items-center bg-gray-50 px-5 text-gray-950 dark:bg-gray-950 dark:text-white">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-[#111216]">
        {error ? <TriangleAlert className="mx-auto h-7 w-7 text-amber-500" /> : <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" />}
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{error ? 'LP Scout could not continue' : 'Verifying your LP Scout payment'}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{error || 'Your verified report will open automatically.'}</p>
        {error && (
          <a href="/integrations" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">
            View integrations
          </a>
        )}
      </section>
    </main>
  )
}
