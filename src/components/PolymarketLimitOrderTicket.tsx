import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { CheckCircle2 } from 'lucide-react'
import {
  polyDeskCreateOwnerApiKey,
  polyDeskEnsurePolygonProvider,
  polyDeskOrderSubmitDebug,
  polyDeskProviderAccount,
  polyDeskProviderChainId,
  polyDeskValidClobCreds,
  submitPolymarketOrderFromBrowser,
} from '../pages/TelegramPaymentLinks'

type PreparedLimit = {
  readyForLocalSigning: boolean
  issues: string[]
  market: {
    title: string
    outcome: string
    tokenId: string
    tickSize: string
    minimumOrderSize: string
    negRisk: boolean
    executionPrice: string
  }
  wallet: { address: string }
  signingPlan: {
    client: { builderConfig: { builderCode: string } }
    createOrder: {
      tokenID: string
      price: number
      size: number
    }
  }
}

type TradingProfile = {
  tradingAddress?: string
  depositWalletAddress?: string
  depositWalletStatus?: string
}

type OpenOrder = {
  id?: string
  orderID?: string
  market?: string
  asset_id?: string
  outcome?: string
  side?: string
  price?: string
  original_size?: string
  size_matched?: string
  status?: string
}

type MarketPosition = {
  eventSlug?: string
  slug?: string
  title?: string
  outcome?: string
  size?: number
  avgPrice?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
}

function tickDecimals(tickSize: string) {
  return tickSize.split('.')[1]?.length ?? 0
}

function cleanTickSize(value: unknown) {
  const text = String(value ?? '').trim()
  return /^(?:0\.1|0\.01|0\.001|0\.0001)$/.test(text) ? text : '0.01'
}

function cleanPrice(value: unknown, tickSize = '0.01') {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || number >= 1) return ''
  const tick = Number(tickSize)
  const aligned = Math.floor((number + Number.EPSILON) / tick) * tick
  return Math.min(1 - tick, Math.max(tick, aligned)).toFixed(tickDecimals(tickSize))
}

function minimumRewardSpend(rewardMinShares: unknown, price: unknown) {
  const shares = Number(rewardMinShares)
  const quote = Number(price)
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(quote) || quote <= 0 || quote >= 1) return 0
  return Math.ceil(shares * quote * 1_000_000) / 1_000_000
}

function amountInput(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, '')
}

export function PolymarketLimitOrderTicket({
  marketTitle,
  marketUrl,
  yesQuote,
  noQuote,
  tickSize: rawTickSize,
  rewardMinShares,
  estimatedRewardCapitalUsdc,
  initialOutcome = 'YES',
  orderSource = 'lp-scout',
}: {
  marketTitle: string
  marketUrl: string
  yesQuote?: unknown
  noQuote?: unknown
  tickSize?: unknown
  rewardMinShares?: unknown
  estimatedRewardCapitalUsdc?: unknown
  initialOutcome?: 'YES' | 'NO'
  orderSource?: 'lp-scout' | 'watch-position'
}) {
  const tickSize = cleanTickSize(rawTickSize)
  const initialPrice = cleanPrice(yesQuote, tickSize)
  const initialRewardSpend = minimumRewardSpend(rewardMinShares, initialPrice)
  const { authenticated, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const [profile, setProfile] = useState<TradingProfile | null>(null)
  const [outcome, setOutcome] = useState<'YES' | 'NO'>(initialOutcome)
  const [price, setPrice] = useState(initialOutcome === 'NO' ? cleanPrice(noQuote, tickSize) : initialPrice)
  const [amount, setAmount] = useState(initialRewardSpend > 0 ? amountInput(initialRewardSpend) : '1')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [placed, setPlaced] = useState<{
    orderId?: string
    price: string
    amount: string
    outcome: 'YES' | 'NO'
  } | null>(null)
  const [marketPosition, setMarketPosition] = useState<MarketPosition | null>(null)
  const [cancelContext, setCancelContext] = useState<{
    orderId: string
    walletClient: any
    credentials: { key: string; secret: string; passphrase: string }
  } | null>(null)

  useEffect(() => {
    if (!authenticated) {
      setProfile(null)
      return
    }
    let cancelled = false
    void (async () => {
      const token = await getAccessToken()
      if (!token) return
      const response = await fetch('/api/polymarket-portfolio?action=profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await response.json().catch(() => ({})) as { ok?: boolean; profile?: TradingProfile }
      if (!cancelled && response.ok && body.ok) setProfile(body.profile ?? null)
    })()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    setPrice(outcome === 'YES' ? cleanPrice(yesQuote, tickSize) : cleanPrice(noQuote, tickSize))
  }, [noQuote, outcome, tickSize, yesQuote])

  useEffect(() => {
    const nextPrice = cleanPrice(yesQuote, tickSize)
    const nextMinimum = minimumRewardSpend(rewardMinShares, nextPrice)
    setOutcome(initialOutcome)
    setPrice(initialOutcome === 'NO' ? cleanPrice(noQuote, tickSize) : nextPrice)
    setAmount(nextMinimum > 0 ? amountInput(nextMinimum) : '1')
    setNotice('')
    setPlaced(null)
  }, [initialOutcome, marketUrl, noQuote, rewardMinShares, tickSize, yesQuote])

  const estimatedShares = useMemo(() => {
    const amountNumber = Number(amount)
    const priceNumber = Number(price)
    return amountNumber > 0 && priceNumber > 0 ? amountNumber / priceNumber : 0
  }, [amount, price])

  const requiredRewardSpend = useMemo(
    () => minimumRewardSpend(rewardMinShares, price),
    [price, rewardMinShares],
  )
  const belowRewardMinimum = requiredRewardSpend > 0 && Number(amount) < requiredRewardSpend
  const rewardShares = Number(rewardMinShares)
  const combinedRewardSetup = Number(estimatedRewardCapitalUsdc)

  const projected = useMemo(() => {
    const spend = Number(amount)
    const payout = estimatedShares
    return {
      payout: Number.isFinite(payout) ? payout : 0,
      profit: Number.isFinite(payout - spend) ? Math.max(0, payout - spend) : 0,
      risk: Number.isFinite(spend) ? Math.max(0, spend) : 0,
    }
  }, [amount, estimatedShares])

  const marketSlug = useMemo(() => {
    try {
      const parts = new URL(marketUrl).pathname.split('/').filter(Boolean)
      return parts.at(-1)?.toLowerCase() ?? ''
    } catch {
      return ''
    }
  }, [marketUrl])

  const loadMarketPosition = useCallback(async () => {
    const address = profile?.depositWalletAddress ?? ''
    if (!authenticated || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setMarketPosition(null)
      return
    }
    try {
      const response = await fetch(`/api/polymarket-portfolio?action=positions&address=${encodeURIComponent(address)}&sizeThreshold=0&limit=100`)
      const body = await response.json().catch(() => ({})) as { ok?: boolean; positions?: MarketPosition[] }
      if (!response.ok || !body.ok) return
      const expectedOutcome = (placed?.outcome ?? outcome).toUpperCase()
      const position = (body.positions ?? []).find(item => {
        const sameOutcome = String(item.outcome ?? '').toUpperCase() === expectedOutcome
        const sameMarket = marketSlug
          ? item.eventSlug?.toLowerCase() === marketSlug || item.slug?.toLowerCase() === marketSlug
          : item.title?.trim().toLowerCase() === marketTitle.trim().toLowerCase()
        return sameOutcome && sameMarket
      })
      setMarketPosition(position ?? null)
    } finally {
      // Background refresh stays silent.
    }
  }, [authenticated, marketSlug, marketTitle, outcome, placed?.outcome, profile?.depositWalletAddress])

  useEffect(() => {
    void loadMarketPosition()
  }, [loadMarketPosition])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMarketPosition()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [loadMarketPosition])

  async function placeLimitOrder() {
    setNotice('')
    setPlaced(null)
    if (!authenticated) {
      setNotice('Sign in before placing an order.')
      return
    }
    const ownerAddress = profile?.tradingAddress ?? ''
    const funderAddress = profile?.depositWalletAddress ?? ''
    if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress) || !/^0x[a-fA-F0-9]{40}$/.test(funderAddress) || profile?.depositWalletStatus !== 'ready') {
      setNotice('Activate the Polymarket wallet from Overview before placing an order.')
      return
    }
    const signingWallet = wallets.find(wallet => wallet.address?.toLowerCase() === ownerAddress.toLowerCase())
    if (!signingWallet || typeof signingWallet.getEthereumProvider !== 'function') {
      setNotice('Reconnect the wallet that controls this Polymarket account.')
      return
    }
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      setNotice('Enter a valid USDC amount.')
      return
    }
    if (!/^\d+(?:\.\d{1,6})?$/.test(price) || Number(price) <= 0 || Number(price) >= 1) {
      setNotice('Enter a limit price between 0 and 1.')
      return
    }
    if (belowRewardMinimum) {
      setNotice(`Enter at least ${amountInput(requiredRewardSpend)} USDC for this ${outcome} quote to meet the market's displayed reward minimum.`)
      return
    }

    setBusy(true)
    try {
      setNotice('Reviewing the live market and wallet readiness.')
      const planResponse = await fetch('/api/polymarket-open/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalOrderId: `${orderSource}:${Date.now()}`,
          marketUrl,
          outcome,
          maxSpendUsdc: amount,
          wallet: funderAddress,
          orderType: 'GTC',
          limitPrice: price,
        }),
      })
      const planBody = await planResponse.json().catch(() => ({})) as { ok?: boolean; error?: string } & Partial<PreparedLimit>
      if (!planResponse.ok || !planBody.ok) throw new Error(planBody.error || 'The limit order could not be prepared.')
      const plan = planBody as PreparedLimit
      if (!plan.readyForLocalSigning) throw new Error(plan.issues?.[0] || 'Fund or approve the Polymarket wallet before placing this order.')

      if (typeof signingWallet.switchChain === 'function') await signingWallet.switchChain(137)
      const provider = await signingWallet.getEthereumProvider()
      await polyDeskEnsurePolygonProvider(provider)
      const activeOwner = await polyDeskProviderAccount(provider)

      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const walletCheck = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'verify-deposit-wallet',
          ownerAddress: activeOwner,
          depositWalletAddress: funderAddress,
        }),
      })
      const walletCheckBody = await walletCheck.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!walletCheck.ok || !walletCheckBody.ok) throw new Error(walletCheckBody.error || 'Wallet ownership verification failed.')

      const [{ ClobClient, Side, OrderType, SignatureTypeV2, createL1Headers, createL2Headers, orderToJsonV2 }, { createWalletClient, custom }, { polygon }] = await Promise.all([
        import('@polymarket/clob-client-v2'),
        import('viem'),
        import('viem/chains'),
      ])
      const walletClient = createWalletClient({
        account: activeOwner as `0x${string}`,
        chain: polygon,
        transport: custom(provider),
      })
      const signingClient = new ClobClient({
        host: 'https://clob.polymarket.com',
        chain: 137,
        signer: walletClient,
        signatureType: SignatureTypeV2.POLY_1271,
        funderAddress,
      })

      setNotice('Confirm the limit order in your wallet.')
      const signedOrder = await signingClient.createOrder({
        tokenID: plan.signingPlan.createOrder.tokenID,
        price: plan.signingPlan.createOrder.price,
        size: plan.signingPlan.createOrder.size,
        side: Side.BUY,
        builderCode: plan.signingPlan.client.builderConfig.builderCode,
      }, {
        tickSize: plan.market.tickSize as '0.1' | '0.01' | '0.001' | '0.0001',
        negRisk: plan.market.negRisk,
        version: 2,
      })
      const credentials = await polyDeskCreateOwnerApiKey(createL1Headers, walletClient, {
        providerChainId: await polyDeskProviderChainId(provider),
        ownerAddress: activeOwner,
        funderAddress,
      })
      if (!polyDeskValidClobCreds(credentials)) throw new Error('Polymarket API authorization failed.')
      const orderPayload = orderToJsonV2(signedOrder as any, credentials.key, OrderType.GTC, false, true)
      const handoffResponse = await fetch('/api/polymarket-builder-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: orderSource === 'watch-position' ? 'watch-position-limit' : 'lp-scout-limit',
          marketTitle,
          marketUrl,
          outcome: plan.market.outcome,
          tokenId: plan.market.tokenId,
          signer: funderAddress,
          orderType: OrderType.GTC,
          order: signedOrder,
          orderPayload,
        }),
      })
      const handoff = await handoffResponse.json().catch(() => ({})) as {
        ok?: boolean
        error?: string
        remoteBuilderSigner?: { url?: string; token?: string }
        handoff?: { orderPayload?: typeof orderPayload }
      }
      if (!handoffResponse.ok || !handoff.ok) throw new Error(handoff.error || 'PolyDesk could not authorize the builder handoff.')
      const finalPayload = handoff.handoff?.orderPayload ?? orderPayload
      const orderBody = JSON.stringify(finalPayload)
      const l2Headers = await createL2Headers(walletClient, credentials, {
        method: 'POST',
        requestPath: '/order',
        body: orderBody,
      })
      const result = await submitPolymarketOrderFromBrowser({
        orderBody,
        userHeaders: Object.fromEntries(Object.entries(l2Headers).map(([key, value]) => [key, String(value)])),
        remoteBuilderSigner: handoff.remoteBuilderSigner,
        fallbackMessage: 'Polymarket rejected the limit order.',
        debug: polyDeskOrderSubmitDebug({
          providerChainId: await polyDeskProviderChainId(provider),
          ownerAddress: activeOwner,
          l2PolyAddress: String(l2Headers.POLY_ADDRESS ?? ''),
          signedOrder,
          funderAddress,
          remoteBuilderSigner: handoff.remoteBuilderSigner,
        }),
      }) as Record<string, unknown>
      const submittedOrderId = typeof result.orderID === 'string' ? result.orderID : typeof result.orderId === 'string' ? result.orderId : ''
      setPlaced({
        orderId: submittedOrderId || undefined,
        price,
        amount,
        outcome,
      })
      if (submittedOrderId) setCancelContext({ orderId: submittedOrderId, walletClient, credentials })
      if (submittedOrderId) {
        try {
          await fetch('/api/polymarket-portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: 'register-lp-order',
              orderId: submittedOrderId,
              positionAddress: funderAddress,
              assetId: plan.market.tokenId,
              marketTitle,
              marketUrl,
              outcome: plan.market.outcome || outcome,
              side: 'BUY',
              price: plan.signingPlan.createOrder.price,
              originalSize: plan.signingPlan.createOrder.size,
              origin: orderSource,
            }),
          })
        } catch {
          // The order is already authoritative. Monitoring registration is
          // best-effort and must never turn a successful trade into an error.
        }
      }
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The limit order could not be placed.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelPlacedOrder() {
    if (!cancelContext) return
    setBusy(true)
    setNotice('')
    try {
      const { createL2Headers } = await import('@polymarket/clob-client-v2')
      const body = JSON.stringify({ orderID: cancelContext.orderId })
      const headers = await createL2Headers(cancelContext.walletClient, cancelContext.credentials, {
        method: 'DELETE',
        requestPath: '/order',
        body,
      })
      const response = await fetch('https://clob.polymarket.com/order', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
        },
        body,
      })
      const result = await response.json().catch(() => ({})) as { canceled?: string[]; not_canceled?: Record<string, string>; error?: string }
      if (!response.ok || !result.canceled?.includes(cancelContext.orderId)) {
        throw new Error(result.error || Object.values(result.not_canceled ?? {})[0] || 'Polymarket did not confirm cancellation.')
      }
      const token = await getAccessToken()
      if (token) {
        await fetch('/api/polymarket-portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'mark-lp-order-cancelled', orderId: cancelContext.orderId }),
        }).catch(() => undefined)
      }
      setCancelContext(null)
      setPlaced(null)
      setNotice('Limit order cancelled.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The order could not be cancelled.')
    } finally {
      setBusy(false)
    }
  }

  if (placed) {
    const pnl = Number(marketPosition?.cashPnl)
    const pnlPercent = Number(marketPosition?.percentPnl)
    const currentValue = Number(marketPosition?.currentValue)
    const costBasis = Number(marketPosition?.avgPrice) * Number(marketPosition?.size)
    const hasPosition = Boolean(marketPosition && Number.isFinite(currentValue) && Number.isFinite(pnl))
    const positivePnl = pnl >= 0
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#17171b]">
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              Limit order submitted
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${placed.outcome === 'YES' ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300'}`}>
              {placed.outcome}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{placed.amount} USDC at {placed.price} · resting until matched.</p>

          {hasPosition ? (
            <div className="mt-4 grid grid-cols-3 divide-x divide-gray-200 border-y border-gray-200 py-3 dark:divide-white/10 dark:border-white/10">
              <div className="pr-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Cost</p>
                <p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{costBasis.toFixed(2)} USDC</p>
              </div>
              <div className="px-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Value</p>
                <p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{currentValue.toFixed(2)} USDC</p>
              </div>
              <div className="pl-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">P&amp;L</p>
                <p className={`mt-1 text-sm font-semibold ${positivePnl ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {positivePnl ? '+' : ''}{pnl.toFixed(2)}
                  {Number.isFinite(pnlPercent) && <span className="ml-1 text-[10px]">({positivePnl ? '+' : ''}{pnlPercent.toFixed(1)}%)</span>}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 border-y border-gray-200 py-3 text-xs leading-5 text-gray-500 dark:border-white/10 dark:text-gray-400">
              No filled position yet. Live P&amp;L appears here after Polymarket matches the order.
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-3">
            {cancelContext && (
              <button type="button" onClick={() => void cancelPlacedOrder()} disabled={busy} className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {busy ? 'Cancelling' : 'Cancel order'}
              </button>
            )}
          </div>
        </div>
        <p className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-[10px] text-gray-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400">
          LP rewards settle separately after Polymarket scores eligible liquidity.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-white/10">
      <div className="grid grid-cols-2 gap-2">
        {(['YES', 'NO'] as const).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const nextPrice = cleanPrice(value === 'YES' ? yesQuote : noQuote, tickSize)
              const nextMinimum = minimumRewardSpend(rewardMinShares, nextPrice)
              setOutcome(value)
              if (nextMinimum > 0 && Number(amount) < nextMinimum) setAmount(amountInput(nextMinimum))
            }}
            className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
              outcome === value
                ? value === 'YES'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-red-600 bg-red-600 text-white'
                : value === 'YES'
                  ? 'border-gray-200 bg-white text-blue-700 hover:border-blue-300 dark:border-white/10 dark:bg-[#17171b] dark:text-blue-400'
                  : 'border-gray-200 bg-white text-red-700 hover:border-red-300 dark:border-white/10 dark:bg-[#17171b] dark:text-red-400'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.03]">
        <label className="px-3 py-3">
          <span className="block text-[10px] font-semibold uppercase text-gray-400">Your price</span>
          <input value={price} onChange={event => setPrice(event.target.value)} onBlur={() => setPrice(cleanPrice(price, tickSize))} inputMode="decimal" step={tickSize} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none" placeholder="0.50" />
        </label>
        <label className="px-3 py-3">
          <span className="block text-[10px] font-semibold uppercase text-gray-400">Amount</span>
          <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" className="mt-1 w-full bg-transparent text-sm font-semibold outline-none" placeholder="1" />
        </label>
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <span>Estimated {estimatedShares ? estimatedShares.toFixed(2) : '0'} shares</span>
        <span>Waits for a match</span>
      </div>
      {requiredRewardSpend > 0 && (
        <p className={`text-[11px] leading-5 ${belowRewardMinimum ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>
          This {outcome} order needs at least {amountInput(requiredRewardSpend)} USDC ({rewardShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares) to meet the displayed reward minimum.
          {Number.isFinite(combinedRewardSetup) && combinedRewardSetup > 0 ? ` Estimated two-sided setup: ≈${combinedRewardSetup.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC.` : ''}
        </p>
      )}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 dark:border-white/10 dark:bg-white/10">
        {[
          ['Max payout', projected.payout, 'text-gray-950 dark:text-white'],
          ['Potential profit', projected.profit, 'text-emerald-600 dark:text-emerald-400'],
          ['Amount at risk', projected.risk, 'text-rose-600 dark:text-rose-400'],
        ].map(([label, value, valueClass]) => (
          <div key={String(label)} className="bg-white px-3 py-3 dark:bg-[#17171b]">
            <p className="text-[9px] font-semibold uppercase leading-4 tracking-wider text-gray-400">{label}</p>
            <p className={`mt-1 text-sm font-semibold ${valueClass}`}>{Number(value).toFixed(2)}</p>
            <p className="text-[9px] text-gray-400">USDC</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-4 text-gray-400">Projection assumes a full fill and winning resolution; fees and LP rewards are excluded.</p>
      <button type="button" onClick={() => void placeLimitOrder()} disabled={busy || belowRewardMinimum} className="polydesk-primary-cta w-full disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? 'Reviewing order' : belowRewardMinimum ? `Minimum ${amountInput(requiredRewardSpend)} USDC` : authenticated ? 'Review and sign' : 'Sign in to place order'}
      </button>
      {notice && <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">{notice}</p>}
    </div>
  )
}

export function PolymarketOpenOrdersPanel() {
  const { authenticated, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const [profile, setProfile] = useState<TradingProfile | null>(null)
  const [orders, setOrders] = useState<OpenOrder[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [session, setSession] = useState<{
    walletClient: any
    credentials: { key: string; secret: string; passphrase: string }
  } | null>(null)

  useEffect(() => {
    if (!authenticated) {
      setProfile(null)
      setOrders(null)
      return
    }
    let cancelled = false
    void (async () => {
      const token = await getAccessToken()
      if (!token) return
      const response = await fetch('/api/polymarket-portfolio?action=profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await response.json().catch(() => ({})) as { ok?: boolean; profile?: TradingProfile }
      if (!cancelled && response.ok && body.ok) setProfile(body.profile ?? null)
    })()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken])

  async function authorize() {
    const ownerAddress = profile?.tradingAddress ?? ''
    const signingWallet = wallets.find(wallet => wallet.address?.toLowerCase() === ownerAddress.toLowerCase())
    if (!signingWallet || typeof signingWallet.getEthereumProvider !== 'function') {
      throw new Error('Reconnect the wallet that controls this Polymarket account.')
    }
    if (typeof signingWallet.switchChain === 'function') await signingWallet.switchChain(137)
    const provider = await signingWallet.getEthereumProvider()
    await polyDeskEnsurePolygonProvider(provider)
    const activeOwner = await polyDeskProviderAccount(provider)
    const [{ createL1Headers }, { createWalletClient, custom }, { polygon }] = await Promise.all([
      import('@polymarket/clob-client-v2'),
      import('viem'),
      import('viem/chains'),
    ])
    const walletClient = createWalletClient({
      account: activeOwner as `0x${string}`,
      chain: polygon,
      transport: custom(provider),
    })
    const credentials = await polyDeskCreateOwnerApiKey(createL1Headers, walletClient, {
      providerChainId: await polyDeskProviderChainId(provider),
      ownerAddress: activeOwner,
      funderAddress: profile?.depositWalletAddress,
    })
    if (!polyDeskValidClobCreds(credentials)) throw new Error('Polymarket API authorization failed.')
    const nextSession = { walletClient, credentials }
    setSession(nextSession)
    return nextSession
  }

  async function loadOrders() {
    setBusy(true)
    setNotice('')
    try {
      const auth = session ?? await authorize()
      const { createL2Headers } = await import('@polymarket/clob-client-v2')
      const headers = await createL2Headers(auth.walletClient, auth.credentials, {
        method: 'GET',
        requestPath: '/data/orders',
      })
      const response = await fetch('https://clob.polymarket.com/data/orders', {
        headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
      })
      const body = await response.json().catch(() => []) as unknown
      if (!response.ok) throw new Error('Open orders could not be loaded.')
      const rows = Array.isArray(body)
        ? body
        : body && typeof body === 'object' && Array.isArray((body as { data?: unknown[] }).data)
          ? (body as { data: unknown[] }).data
          : []
      setOrders(rows.filter(item => item && typeof item === 'object') as OpenOrder[])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Open orders could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelOrder(order: OpenOrder) {
    const orderId = String(order.id || order.orderID || '')
    if (!orderId) return
    setBusy(true)
    setNotice('')
    try {
      const auth = session ?? await authorize()
      const { createL2Headers } = await import('@polymarket/clob-client-v2')
      const body = JSON.stringify({ orderID: orderId })
      const headers = await createL2Headers(auth.walletClient, auth.credentials, {
        method: 'DELETE',
        requestPath: '/order',
        body,
      })
      const response = await fetch('https://clob.polymarket.com/order', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
        },
        body,
      })
      const result = await response.json().catch(() => ({})) as { canceled?: string[]; error?: string }
      if (!response.ok || !result.canceled?.includes(orderId)) throw new Error(result.error || 'Polymarket did not confirm cancellation.')
      const token = await getAccessToken()
      if (token) {
        await fetch('/api/polymarket-portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'mark-lp-order-cancelled', orderId }),
        }).catch(() => undefined)
      }
      setOrders(current => current?.filter(item => String(item.id || item.orderID || '') !== orderId) ?? [])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The order could not be cancelled.')
    } finally {
      setBusy(false)
    }
  }

  if (!authenticated || !profile?.tradingAddress || profile.depositWalletStatus !== 'ready') return null

  return (
    <section className="polydesk-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-950 dark:text-white">Open orders</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Live limit orders waiting on Polymarket.</p>
        </div>
        {!orders && (
          <button type="button" onClick={() => void loadOrders()} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-white/10">
            {busy ? 'Checking' : 'View'}
          </button>
        )}
      </div>
      {orders && (
        <div className="mt-3 space-y-2">
          {orders.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">No open orders.</p>
          ) : orders.map(order => {
            const orderId = String(order.id || order.orderID || '')
            const original = Number(order.original_size || 0)
            const matched = Number(order.size_matched || 0)
            return (
              <div key={orderId} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5 dark:border-white/10">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{order.outcome || order.side || 'Limit order'} · {order.price || '—'}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">{Math.max(0, original - matched).toLocaleString()} shares remaining</p>
                </div>
                <button type="button" onClick={() => void cancelOrder(order)} disabled={busy} className="shrink-0 text-xs font-semibold text-red-500">Cancel</button>
              </div>
            )
          })}
        </div>
      )}
      {notice && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{notice}</p>}
    </section>
  )
}
