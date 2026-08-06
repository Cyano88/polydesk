import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { CheckCircle2 } from './icons'
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
    conditionId: string
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
    createOrder?: {
      tokenID: string
      price: number
      size: number
    }
    createMarketOrder?: {
      tokenID: string
      amount: number
      price: number
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

type SubmittedRewardQuote = {
  orderId: string
  outcome: 'YES' | 'NO'
  price: string
  amount: string
}

type RewardScoringState = 'checking' | 'eligible' | 'not-eligible' | 'unknown'

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
  marketSlug: exactMarketSlug,
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
  marketSlug?: string
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
  const [journey, setJourney] = useState<'buy-now' | 'earn-rewards'>('earn-rewards')
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
    journey: 'buy-now' | 'earn-rewards'
  } | null>(null)
  const [marketPosition, setMarketPosition] = useState<MarketPosition | null>(null)
  const [rewardQuotes, setRewardQuotes] = useState<SubmittedRewardQuote[]>([])
  const [rewardScoring, setRewardScoring] = useState<Record<string, RewardScoringState>>({})
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
    setRewardQuotes([])
    setRewardScoring({})
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
  const belowRewardMinimum = journey === 'earn-rewards' && requiredRewardSpend > 0 && Number(amount) < requiredRewardSpend
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

  useEffect(() => {
    if (!cancelContext || !rewardQuotes.some(quote => quote.orderId)) return
    const timer = window.setTimeout(() => void refreshRewardScoring(), 4_500)
    return () => window.clearTimeout(timer)
  }, [cancelContext, rewardQuotes])

  async function refreshRewardScoring() {
    if (!cancelContext) return
    const quotes = rewardQuotes.filter(quote => quote.orderId)
    if (!quotes.length) return
    setRewardScoring(current => Object.fromEntries(quotes.map(quote => [quote.orderId, current[quote.orderId] === 'eligible' ? 'eligible' : 'checking'])))
    const { createL2Headers } = await import('@polymarket/clob-client-v2')
    const results = await Promise.all(quotes.map(async quote => {
      try {
        const headers = await createL2Headers(cancelContext.walletClient, cancelContext.credentials, {
          method: 'GET',
          requestPath: '/order-scoring',
        })
        const response = await fetch(`https://clob.polymarket.com/order-scoring?order_id=${encodeURIComponent(quote.orderId)}`, {
          headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
        })
        const body = await response.json().catch(() => ({})) as { scoring?: boolean }
        if (!response.ok || typeof body.scoring !== 'boolean') return [quote.orderId, 'unknown'] as const
        return [quote.orderId, body.scoring ? 'eligible' : 'not-eligible'] as const
      } catch {
        return [quote.orderId, 'unknown'] as const
      }
    }))
    setRewardScoring(Object.fromEntries(results))
  }

  async function placeOrder() {
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
    if (journey === 'earn-rewards' && (!/^\d+(?:\.\d{1,6})?$/.test(price) || Number(price) <= 0 || Number(price) >= 1)) {
      setNotice('Enter a limit price between 0 and 1.')
      return
    }
    if (belowRewardMinimum) {
      setNotice(`Enter at least ${amountInput(requiredRewardSpend)} USDC for this ${outcome} quote to meet the market's displayed reward minimum.`)
      return
    }

    setBusy(true)
    try {
      setNotice(journey === 'buy-now' ? 'Checking the live price and wallet.' : 'Checking your reward quote and wallet.')
      const planResponse = await fetch('/api/polymarket-open/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalOrderId: `${orderSource}:${Date.now()}`,
          marketUrl,
          outcome,
          maxSpendUsdc: amount,
          wallet: funderAddress,
          ...(exactMarketSlug ? { marketSlug: exactMarketSlug } : {}),
          orderType: journey === 'buy-now' ? 'FAK' : 'GTC',
          ...(journey === 'earn-rewards' ? { limitPrice: price } : {}),
        }),
      })
      const planBody = await planResponse.json().catch(() => ({})) as { ok?: boolean; error?: string } & Partial<PreparedLimit>
      if (!planResponse.ok || !planBody.ok) throw new Error(planBody.error || 'This action could not be prepared.')
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

      setNotice(journey === 'buy-now' ? 'Confirm the purchase in your wallet.' : 'Confirm the reward quote in your wallet.')
      const sdkOptions = {
        tickSize: plan.market.tickSize as '0.1' | '0.01' | '0.001' | '0.0001',
        negRisk: plan.market.negRisk,
        version: 2 as const,
      }
      const sdkOrderType = journey === 'buy-now' ? OrderType.FAK : OrderType.GTC
      const signedOrder = journey === 'buy-now'
        ? await signingClient.createMarketOrder({
            tokenID: plan.signingPlan.createMarketOrder!.tokenID,
            amount: plan.signingPlan.createMarketOrder!.amount,
            price: plan.signingPlan.createMarketOrder!.price,
            side: Side.BUY,
            orderType: OrderType.FAK,
            builderCode: plan.signingPlan.client.builderConfig.builderCode,
          }, sdkOptions)
        : await signingClient.createOrder({
            tokenID: plan.signingPlan.createOrder!.tokenID,
            price: plan.signingPlan.createOrder!.price,
            size: plan.signingPlan.createOrder!.size,
            side: Side.BUY,
            builderCode: plan.signingPlan.client.builderConfig.builderCode,
          }, sdkOptions)
      const credentials = await polyDeskCreateOwnerApiKey(createL1Headers, walletClient, {
        providerChainId: await polyDeskProviderChainId(provider),
        ownerAddress: activeOwner,
        funderAddress,
      })
      if (!polyDeskValidClobCreds(credentials)) throw new Error('Polymarket API authorization failed.')
      const orderPayload = orderToJsonV2(
        signedOrder as any,
        credentials.key,
        sdkOrderType,
        journey === 'earn-rewards',
        false,
      )
      const handoffResponse = await fetch('/api/polymarket-builder-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: journey === 'buy-now'
            ? orderSource === 'watch-position' ? 'watch-position-buy' : 'lp-scout-buy'
            : orderSource === 'watch-position' ? 'watch-position-limit' : 'lp-scout-limit',
          marketTitle,
          marketUrl,
          outcome: plan.market.outcome,
          tokenId: plan.market.tokenId,
          signer: funderAddress,
          orderType: sdkOrderType,
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
        fallbackMessage: 'Polymarket rejected the order.',
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
      if (submittedOrderId && journey === 'earn-rewards') {
        setRewardQuotes(current => [
          ...current.filter(quote => quote.outcome !== outcome),
          { orderId: submittedOrderId, outcome, price, amount },
        ])
        setRewardScoring(current => ({ ...current, [submittedOrderId]: 'checking' }))
      }
      setPlaced({
        orderId: submittedOrderId || undefined,
        price: journey === 'buy-now' ? plan.market.executionPrice : price,
        amount,
        outcome,
        journey,
      })
      if (submittedOrderId && journey === 'earn-rewards') setCancelContext({ orderId: submittedOrderId, walletClient, credentials })
      if (submittedOrderId && journey === 'earn-rewards') {
        try {
          await fetch('/api/polymarket-portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: 'register-lp-order',
              orderId: submittedOrderId,
              positionAddress: funderAddress,
              marketId: plan.market.conditionId,
              assetId: plan.market.tokenId,
              marketTitle,
              marketUrl,
              outcome: plan.market.outcome || outcome,
              side: 'BUY',
              price: plan.signingPlan.createOrder!.price,
              originalSize: plan.signingPlan.createOrder!.size,
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
      setNotice(error instanceof Error ? error.message : journey === 'buy-now' ? 'The purchase could not be completed.' : 'The reward quote could not be placed.')
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
      setRewardQuotes(current => current.filter(quote => quote.orderId !== cancelContext.orderId))
      setRewardScoring(current => Object.fromEntries(Object.entries(current).filter(([orderId]) => orderId !== cancelContext.orderId)))
      setCancelContext(null)
      setPlaced(null)
      setNotice('Reward quote cancelled.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The order could not be cancelled.')
    } finally {
      setBusy(false)
    }
  }

  function addComplementaryRewardQuote(currentOutcome: 'YES' | 'NO') {
    const nextOutcome = currentOutcome === 'YES' ? 'NO' : 'YES'
    const nextPrice = cleanPrice(nextOutcome === 'YES' ? yesQuote : noQuote, tickSize)
    const nextMinimum = minimumRewardSpend(rewardMinShares, nextPrice)
    setOutcome(nextOutcome)
    setPrice(nextPrice)
    setAmount(nextMinimum > 0 ? amountInput(nextMinimum) : '1')
    setPlaced(null)
    setNotice('The other side is ready. Review its price and amount before signing.')
  }

  if (placed) {
    const pnl = Number(marketPosition?.cashPnl)
    const pnlPercent = Number(marketPosition?.percentPnl)
    const currentValue = Number(marketPosition?.currentValue)
    const costBasis = Number(marketPosition?.avgPrice) * Number(marketPosition?.size)
    const hasPosition = Boolean(marketPosition && Number.isFinite(currentValue) && Number.isFinite(pnl))
    const positivePnl = pnl >= 0
    const complementaryOutcome = placed.outcome === 'YES' ? 'NO' : 'YES'
    const complementarySubmitted = rewardQuotes.some(quote => quote.outcome === complementaryOutcome)
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#17171b]">
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              {placed.journey === 'buy-now' ? 'Purchase submitted' : 'Reward quote submitted'}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${placed.outcome === 'YES' ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300'}`}>
              {placed.outcome}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {placed.journey === 'buy-now'
              ? `${placed.amount} USDC submitted at a protected live price.`
              : `${placed.amount} USDC at ${placed.price} · available until matched or cancelled.`}
          </p>

          {placed.journey === 'earn-rewards' && rewardQuotes.length > 0 && (
            <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Reward status</p>
                <button type="button" onClick={() => void refreshRewardScoring()} className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Check again</button>
              </div>
              {rewardQuotes.map(quote => {
                const status = rewardScoring[quote.orderId] || 'checking'
                const label = status === 'eligible'
                  ? 'Reward eligible'
                  : status === 'not-eligible' ? 'Not scoring yet'
                    : status === 'unknown' ? 'Status unavailable' : 'Checking eligibility'
                return (
                  <div key={quote.orderId} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{quote.outcome} · {quote.price} · {quote.amount} USDC</span>
                    <span className={status === 'eligible' ? 'text-emerald-600 dark:text-emerald-400' : status === 'not-eligible' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}>{label}</span>
                  </div>
                )
              })}
            </div>
          )}

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
              {placed.journey === 'buy-now'
                ? 'The purchase was submitted. Live P&L appears when Polymarket reports the position.'
                : 'No filled position yet. Live P&L appears after another trader matches your quote.'}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-3">
            {placed.journey === 'earn-rewards' && !complementarySubmitted && (
              <button type="button" onClick={() => addComplementaryRewardQuote(placed.outcome)} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
                Add {complementaryOutcome} reward quote
              </button>
            )}
            {placed.journey === 'earn-rewards' && complementarySubmitted && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Both sides submitted</span>
            )}
            {cancelContext && (
              <button type="button" onClick={() => void cancelPlacedOrder()} disabled={busy} className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {busy ? 'Cancelling' : 'Cancel order'}
              </button>
            )}
          </div>
        </div>
        <p className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-[10px] text-gray-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400">
          {placed.journey === 'buy-now'
            ? 'This is a market purchase, not a market-reward quote.'
            : 'Market rewards settle separately after Polymarket scores eligible liquidity.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-white/10">
      <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1 dark:bg-white/[0.06]">
        {([
          ['buy-now', 'Buy now'],
          ['earn-rewards', 'Earn market rewards'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setJourney(value)
              setPlaced(null)
              setNotice('')
              if (value === 'buy-now') setAmount('1')
              else if (requiredRewardSpend > 0) setAmount(amountInput(requiredRewardSpend))
            }}
            className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition ${journey === value ? 'bg-white text-gray-950 shadow-sm dark:bg-[#242429] dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
        {journey === 'buy-now'
          ? 'Buy available shares immediately. Any amount that cannot be filled now is cancelled automatically.'
          : 'Leave your price available for other traders. You can cancel it, and eligible quotes may share the market reward pool.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(['YES', 'NO'] as const).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const nextPrice = cleanPrice(value === 'YES' ? yesQuote : noQuote, tickSize)
              const nextMinimum = minimumRewardSpend(rewardMinShares, nextPrice)
              setOutcome(value)
              if (journey === 'earn-rewards' && nextMinimum > 0 && Number(amount) < nextMinimum) setAmount(amountInput(nextMinimum))
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
      <div className={`${journey === 'earn-rewards' ? 'grid-cols-2 divide-x' : 'grid-cols-1'} grid divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.03]`}>
        {journey === 'earn-rewards' && (
          <label className="px-3 py-3">
            <span className="block text-[10px] font-semibold uppercase text-gray-400">Your price</span>
            <input value={price} onChange={event => setPrice(event.target.value)} onBlur={() => setPrice(cleanPrice(price, tickSize))} inputMode="decimal" step={tickSize} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none" placeholder="0.50" />
          </label>
        )}
        <label className="px-3 py-3">
          <span className="block text-[10px] font-semibold uppercase text-gray-400">USDC to use</span>
          <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" className="mt-1 w-full bg-transparent text-sm font-semibold outline-none" placeholder="1" />
        </label>
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <span>{journey === 'earn-rewards' ? `Estimated ${estimatedShares ? estimatedShares.toFixed(2) : '0'} shares` : 'Final shares depend on available prices'}</span>
        <span>{journey === 'earn-rewards' ? 'Stays available' : 'Executes immediately'}</span>
      </div>
      {journey === 'earn-rewards' && requiredRewardSpend > 0 && (
        <p className={`text-[11px] leading-5 ${belowRewardMinimum ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>
          This {outcome} order needs at least {amountInput(requiredRewardSpend)} USDC ({rewardShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares) to meet the displayed reward minimum.
          {Number.isFinite(combinedRewardSetup) && combinedRewardSetup > 0 ? ` Estimated two-sided setup: ≈${combinedRewardSetup.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC.` : ''}
        </p>
      )}
      {journey === 'earn-rewards' ? <>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 dark:border-white/10 dark:bg-white/10">
        {[
          ['Max payout', projected.payout, 'text-gray-950 dark:text-white'],
          ['Profit if YES wins', projected.profit, 'text-emerald-600 dark:text-emerald-400'],
          ['Amount at risk', projected.risk, 'text-rose-600 dark:text-rose-400'],
        ].map(([label, value, valueClass]) => (
          <div key={String(label)} className="bg-white px-3 py-3 dark:bg-[#17171b]">
            <p className="text-[9px] font-semibold uppercase leading-4 tracking-wider text-gray-400">{label}</p>
            <p className={`mt-1 text-sm font-semibold ${valueClass}`}>{Number(value).toFixed(2)}</p>
            <p className="text-[9px] text-gray-400">USDC</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-4 text-gray-400">Projection assumes a full fill and winning resolution; fees and market rewards are excluded.</p>
      </> : (
        <p className="rounded-xl bg-blue-50 px-3 py-3 text-[11px] leading-5 text-blue-800 dark:bg-blue-400/10 dark:text-blue-200">
          PolyDesk checks the live order book before signing. You may receive fewer shares if only part of your purchase is available.
        </p>
      )}
      <button type="button" onClick={() => void placeOrder()} disabled={busy || belowRewardMinimum} className="polydesk-primary-cta w-full disabled:cursor-not-allowed disabled:opacity-50">
        {busy
          ? journey === 'buy-now' ? 'Checking live price' : 'Checking reward quote'
          : belowRewardMinimum ? `Minimum ${amountInput(requiredRewardSpend)} USDC`
          : authenticated ? journey === 'buy-now' ? 'Review purchase' : 'Review reward quote'
          : 'Sign in to continue'}
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
  const [orderScoring, setOrderScoring] = useState<Record<string, RewardScoringState>>({})
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

  async function loadOrderScoring(rows: OpenOrder[], auth: NonNullable<typeof session>) {
    const withIds = rows.map(order => ({ order, orderId: String(order.id || order.orderID || '') })).filter(item => item.orderId)
    setOrderScoring(Object.fromEntries(withIds.map(item => [item.orderId, 'checking'])))
    const { createL2Headers } = await import('@polymarket/clob-client-v2')
    const results = await Promise.all(withIds.map(async ({ orderId }) => {
      try {
        const headers = await createL2Headers(auth.walletClient, auth.credentials, { method: 'GET', requestPath: '/order-scoring' })
        const response = await fetch(`https://clob.polymarket.com/order-scoring?order_id=${encodeURIComponent(orderId)}`, {
          headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
        })
        const body = await response.json().catch(() => ({})) as { scoring?: boolean }
        if (!response.ok || typeof body.scoring !== 'boolean') return [orderId, 'unknown'] as const
        return [orderId, body.scoring ? 'eligible' : 'not-eligible'] as const
      } catch {
        return [orderId, 'unknown'] as const
      }
    }))
    setOrderScoring(Object.fromEntries(results))
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
      const openOrders = rows.filter(item => item && typeof item === 'object') as OpenOrder[]
      setOrders(openOrders)
      await loadOrderScoring(openOrders, auth)
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
      setOrderScoring(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== orderId)))
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
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Orders currently available for other traders to match.</p>
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
            const scoring = orderScoring[orderId] || 'checking'
            return (
              <div key={orderId} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5 dark:border-white/10">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{order.outcome || order.side || 'Limit order'} · {order.price || 'N/A'}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">{Math.max(0, original - matched).toLocaleString()} shares remaining</p>
                  <p className={`mt-1 text-[10px] font-semibold ${scoring === 'eligible' ? 'text-emerald-600 dark:text-emerald-400' : scoring === 'not-eligible' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400'}`}>
                    {scoring === 'eligible' ? 'Reward eligible' : scoring === 'not-eligible' ? 'Not scoring yet' : scoring === 'unknown' ? 'Status unavailable' : 'Checking eligibility'}
                  </p>
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
