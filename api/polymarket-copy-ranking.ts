export type CopyPositionCandidate = {
  proxyWallet: string
  asset: string
  conditionId: string
  size: number
  avgPrice: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  curPrice: number
  redeemable: boolean
  title: string
  eventSlug: string
  outcome: string
  endDate: string
  negativeRisk: boolean
}

export type CopyMarketState = {
  conditionId: string
  active: boolean
  closed: boolean
  enableOrderBook: boolean
  acceptingOrders: boolean
  endDate: string
}

export type CopyOrderBook = {
  market?: string
  asset_id?: string
  timestamp?: string | number
  bids?: Array<{ price?: string | number; size?: string | number }>
  asks?: Array<{ price?: string | number; size?: string | number }>
  min_order_size?: string | number
  tick_size?: string | number
  neg_risk?: boolean
}

export type CopySelectionPolicy = {
  maximumPrice: number
  maximumSpread: number
  minimumDepthUsdc: number
  minimumHoursToResolution: number
  maximumBookAgeSeconds: number
}

export type RankedCopyCandidate = {
  rank: number | null
  eligible: boolean
  score: number
  scoreLabel: 'execution-quality-not-profit-forecast'
  blockers: string[]
  market: {
    title: string
    url: string
    conditionId: string
    tokenId: string
    outcome: string
    endDate: string | null
    negativeRisk: boolean
  }
  watchedPosition: {
    size: number
    currentValue: number
    averageEntryPrice: number
    currentPrice: number
    cashPnl: number
    percentPnl: number
  }
  execution: {
    bestBid: number | null
    bestAsk: number | null
    spread: number | null
    boundaryPrice: number | null
    slippageFromBestAsk: number | null
    availableUsdcAtOrBelowMaximumPrice: number
    bookAgeSeconds: number | null
    minimumOrderSize: number | null
    tickSize: number | null
  }
  scoreComponents: {
    liquidity: number
    spread: number
    policyCompatibility: number
    resolutionBuffer: number
    watchedConviction: number
  }
}

type RankInput = {
  position: CopyPositionCandidate
  market: CopyMarketState | null
  book: CopyOrderBook | null
}

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function rounded(value: number, places = 4) {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function timestampMs(value: unknown) {
  const numeric = finiteNumber(value)
  if (numeric !== null && numeric > 0) return numeric > 10_000_000_000 ? numeric : numeric * 1000
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function bookMetrics(book: CopyOrderBook | null, maxSpendUsdc: number, maximumPrice: number, nowMs: number) {
  const bids = (book?.bids ?? [])
    .map(level => ({ price: finiteNumber(level.price), size: finiteNumber(level.size) }))
    .filter((level): level is { price: number; size: number } => (
      level.price !== null && level.price > 0 && level.price < 1
      && level.size !== null && level.size > 0
    ))
    .sort((a, b) => b.price - a.price)
  const asks = (book?.asks ?? [])
    .map(level => ({ price: finiteNumber(level.price), size: finiteNumber(level.size) }))
    .filter((level): level is { price: number; size: number } => (
      level.price !== null && level.price > 0 && level.price < 1
      && level.size !== null && level.size > 0
    ))
    .sort((a, b) => a.price - b.price)
  const bestBid = bids[0]?.price ?? null
  const bestAsk = asks[0]?.price ?? null
  const spread = bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null
  const eligibleAsks = asks.filter(level => level.price <= maximumPrice)
  const availableUsdc = eligibleAsks.reduce((sum, level) => sum + level.price * level.size, 0)
  let consumed = 0
  let boundaryPrice: number | null = null
  for (const ask of eligibleAsks) {
    consumed += ask.price * ask.size
    boundaryPrice = ask.price
    if (consumed >= maxSpendUsdc) break
  }
  const bookTime = timestampMs(book?.timestamp)
  return {
    bestBid,
    bestAsk,
    spread,
    boundaryPrice,
    slippage: bestAsk !== null && boundaryPrice !== null ? Math.max(0, boundaryPrice - bestAsk) : null,
    availableUsdc,
    bookAgeSeconds: bookTime === null ? null : Math.max(0, Math.floor((nowMs - bookTime) / 1000)),
    minimumOrderSize: finiteNumber(book?.min_order_size),
    tickSize: finiteNumber(book?.tick_size),
  }
}

export function rankCopyPositionCandidates(
  candidates: RankInput[],
  policy: CopySelectionPolicy,
  maxSpendUsdc: number,
  nowMs: number,
): RankedCopyCandidate[] {
  const maximumConviction = Math.max(1, ...candidates.map(candidate => candidate.position.currentValue))
  const ranked: RankedCopyCandidate[] = candidates.map(candidate => {
    const { position, market, book } = candidate
    const metrics = bookMetrics(book, maxSpendUsdc, policy.maximumPrice, nowMs)
    const blockers: string[] = []
    if (!market) blockers.push('Exact market metadata could not be resolved.')
    if (market && (!market.active || market.closed || !market.enableOrderBook || !market.acceptingOrders)) {
      blockers.push('Market is not active with order-book trading enabled and accepting orders.')
    }
    if (market && market.conditionId.toLowerCase() !== position.conditionId.toLowerCase()) {
      blockers.push('Market condition does not match the watched position.')
    }
    if (!book) blockers.push('Current order book is unavailable.')
    if (book && String(book.market ?? '').toLowerCase() !== position.conditionId.toLowerCase()) {
      blockers.push('Order book market does not match the watched position.')
    }
    if (book && String(book.asset_id ?? '') !== position.asset) {
      blockers.push('Order book token does not match the watched outcome.')
    }
    if (position.redeemable || position.size <= 0 || position.currentValue <= 0) {
      blockers.push('Watched position is no longer an open executable position.')
    }
    if (metrics.bestAsk === null || metrics.bestBid === null || metrics.spread === null) {
      blockers.push('Order book is missing an executable two-sided market.')
    }
    if (metrics.bestAsk !== null && metrics.bestAsk > policy.maximumPrice) {
      blockers.push(`Best ask ${rounded(metrics.bestAsk)} exceeds maximumPrice ${policy.maximumPrice}.`)
    }
    if (metrics.boundaryPrice === null || metrics.availableUsdc < maxSpendUsdc) {
      blockers.push('Liquidity at or below maximumPrice cannot cover maxSpendUsdc.')
    }
    if (metrics.availableUsdc < policy.minimumDepthUsdc) {
      blockers.push(`Available depth is below minimumDepthUsdc ${policy.minimumDepthUsdc}.`)
    }
    if (metrics.spread !== null && metrics.spread > policy.maximumSpread) {
      blockers.push(`Spread ${rounded(metrics.spread)} exceeds maximumSpread ${policy.maximumSpread}.`)
    }
    if (metrics.bookAgeSeconds === null || metrics.bookAgeSeconds > policy.maximumBookAgeSeconds) {
      blockers.push('Order book is missing a sufficiently fresh timestamp.')
    }
    const resolutionAt = Date.parse(market?.endDate || position.endDate)
    const hoursToResolution = Number.isFinite(resolutionAt) ? (resolutionAt - nowMs) / 3_600_000 : null
    if (hoursToResolution === null || hoursToResolution < policy.minimumHoursToResolution) {
      blockers.push(`Market has less than ${policy.minimumHoursToResolution} hours before its stated end time.`)
    }

    const eligible = blockers.length === 0
    const liquidityScore = eligible
      ? 30 * Math.min(1, metrics.availableUsdc / Math.max(policy.minimumDepthUsdc, maxSpendUsdc))
      : 0
    const spreadScore = eligible && metrics.spread !== null
      ? 25 * Math.max(0, 1 - metrics.spread / policy.maximumSpread)
      : 0
    const policyScore = eligible ? 20 : 0
    const resolutionScore = eligible && hoursToResolution !== null
      ? 15 * Math.min(1, hoursToResolution / Math.max(168, policy.minimumHoursToResolution))
      : 0
    const convictionScore = eligible ? 10 * Math.min(1, position.currentValue / maximumConviction) : 0
    const score = rounded(liquidityScore + spreadScore + policyScore + resolutionScore + convictionScore, 2)

    return {
      rank: null as number | null,
      eligible,
      score,
      scoreLabel: 'execution-quality-not-profit-forecast' as const,
      blockers,
      market: {
        title: position.title,
        url: `https://polymarket.com/event/${encodeURIComponent(position.eventSlug)}`,
        conditionId: position.conditionId,
        tokenId: position.asset,
        outcome: position.outcome,
        endDate: market?.endDate || position.endDate || null,
        negativeRisk: position.negativeRisk,
      },
      watchedPosition: {
        size: position.size,
        currentValue: position.currentValue,
        averageEntryPrice: position.avgPrice,
        currentPrice: position.curPrice,
        cashPnl: position.cashPnl,
        percentPnl: position.percentPnl,
      },
      execution: {
        bestBid: metrics.bestBid === null ? null : rounded(metrics.bestBid),
        bestAsk: metrics.bestAsk === null ? null : rounded(metrics.bestAsk),
        spread: metrics.spread === null ? null : rounded(metrics.spread),
        boundaryPrice: metrics.boundaryPrice === null ? null : rounded(metrics.boundaryPrice),
        slippageFromBestAsk: metrics.slippage === null ? null : rounded(metrics.slippage),
        availableUsdcAtOrBelowMaximumPrice: rounded(metrics.availableUsdc, 2),
        bookAgeSeconds: metrics.bookAgeSeconds,
        minimumOrderSize: metrics.minimumOrderSize,
        tickSize: metrics.tickSize,
      },
      scoreComponents: {
        liquidity: rounded(liquidityScore, 2),
        spread: rounded(spreadScore, 2),
        policyCompatibility: rounded(policyScore, 2),
        resolutionBuffer: rounded(resolutionScore, 2),
        watchedConviction: rounded(convictionScore, 2),
      },
    }
  })
  const eligible = ranked.filter(candidate => candidate.eligible).sort((a, b) => (
    b.score - a.score
    || b.watchedPosition.currentValue - a.watchedPosition.currentValue
    || a.market.tokenId.localeCompare(b.market.tokenId)
  ))
  eligible.forEach((candidate, index) => { candidate.rank = index + 1 })
  return [
    ...eligible,
    ...ranked.filter(candidate => !candidate.eligible).sort((a, b) => a.market.tokenId.localeCompare(b.market.tokenId)),
  ]
}
