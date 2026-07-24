import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { createPublicClient, formatUnits, getAddress, http, isAddress } from 'viem'
import { polygon } from 'viem/chains'

const GAMMA_ORIGIN = 'https://gamma-api.polymarket.com'
const CLOB_ORIGIN = 'https://clob.polymarket.com'
const REQUEST_TIMEOUT_MS = 12_000
const PLAN_TTL_MS = 60_000
const DEFAULT_MAX_USDC = '25'
const PUSD_DECIMALS = 6

const PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' as const
const CTF_EXCHANGE_V2 = '0xE111180000d2663C0091e4f400237545B87B996B' as const
const NEG_RISK_CTF_EXCHANGE_V2 = '0xe2222d279d744050d28e00520010520000310F59' as const

const erc20BalanceAbi = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

const erc20AllowanceAbi = [{
  type: 'function',
  name: 'allowance',
  stateMutability: 'view',
  inputs: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

type JsonRecord = Record<string, unknown>

type GammaMarket = {
  id?: string | number
  question?: string
  slug?: string
  conditionId?: string
  outcomes?: string | string[]
  clobTokenIds?: string | string[]
  active?: boolean
  closed?: boolean
  enableOrderBook?: boolean
  acceptingOrders?: boolean
  groupItemTitle?: string
}

type OrderBookLevel = { price?: string; size?: string }

type OrderBook = {
  market?: string
  asset_id?: string
  timestamp?: string
  hash?: string
  bids?: OrderBookLevel[]
  asks?: OrderBookLevel[]
  min_order_size?: string
  tick_size?: string
  neg_risk?: boolean
  last_trade_price?: string
}

export type PrepareOpenInput = {
  externalOrderId: string
  marketUrl: string
  outcome: string
  maxSpendUsdc: string
  wallet: string
  orderType: 'FAK' | 'FOK'
  marketSlug?: string
  tokenId?: string
}

type ResolvedMarket = {
  eventSlug: string
  marketId: string
  marketSlug: string
  marketTitle: string
  conditionId: string
  outcome: string
  tokenId: string
}

export type PrepareOpenDependencies = {
  fetchJson: (url: string) => Promise<unknown>
  readWallet: (wallet: `0x${string}`, spender: `0x${string}`) => Promise<{
    deployed: boolean
    balanceRaw: bigint
    allowanceRaw: bigint
  }>
  now: () => number
  builderCode: () => string
  maxUsdc: () => string
}

function clean(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(item => clean(item, 160)).filter(Boolean)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => clean(item, 160)).filter(Boolean) : []
  } catch {
    return []
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function configuredMaxUsdc() {
  const value = clean(process.env.POLYDESK_EXTERNAL_OPEN_MAX_USDC || DEFAULT_MAX_USDC, 32)
  return /^\d+(?:\.\d{1,6})?$/.test(value) && Number(value) > 0 ? value : DEFAULT_MAX_USDC
}

function usdcAtomic(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

function parseInput(value: unknown, maxUsdc: string): { ok: true; value: PrepareOpenInput } | { ok: false; status: number; error: string } {
  if (!isRecord(value)) return { ok: false, status: 400, error: 'OPEN preparation request must be a JSON object.' }
  const externalOrderId = clean(value.externalOrderId, 80)
  const marketUrl = clean(value.marketUrl, 320)
  const outcome = clean(value.outcome, 80)
  const maxSpendUsdc = clean(value.maxSpendUsdc ?? value.amount, 32)
  const wallet = clean(value.wallet ?? value.polymarketWallet, 80)
  const orderType = clean(value.orderType || 'FAK', 12).toUpperCase()
  const marketSlug = clean(value.marketSlug, 180)
  const tokenId = clean(value.tokenId, 96)

  if (!/^[a-zA-Z0-9:_-]{8,80}$/.test(externalOrderId)) {
    return { ok: false, status: 400, error: 'externalOrderId must be 8-80 letters, numbers, colons, underscores, or hyphens.' }
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(marketUrl)
  } catch {
    return { ok: false, status: 400, error: 'A canonical Polymarket event URL is required.' }
  }
  if (
    parsedUrl.protocol !== 'https:'
    || parsedUrl.hostname !== 'polymarket.com'
    || !parsedUrl.pathname.startsWith('/event/')
    || parsedUrl.username
    || parsedUrl.password
  ) {
    return { ok: false, status: 400, error: 'A canonical https://polymarket.com/event/... URL is required.' }
  }
  if (!outcome) return { ok: false, status: 400, error: 'Outcome is required.' }
  if (!/^\d+(?:\.\d{1,6})?$/.test(maxSpendUsdc) || Number(maxSpendUsdc) <= 0) {
    return { ok: false, status: 400, error: 'maxSpendUsdc must be a positive amount with at most 6 decimals.' }
  }
  if (usdcAtomic(maxSpendUsdc) > usdcAtomic(maxUsdc)) {
    return { ok: false, status: 400, error: `maxSpendUsdc exceeds the ${maxUsdc} USDC safety ceiling.` }
  }
  if (!isAddress(wallet)) return { ok: false, status: 400, error: 'A valid public Polymarket deposit-wallet address is required.' }
  if (orderType !== 'FAK' && orderType !== 'FOK') {
    return { ok: false, status: 400, error: 'orderType must be FAK or FOK.' }
  }
  if (tokenId && !/^\d+$/.test(tokenId)) return { ok: false, status: 400, error: 'tokenId must be a numeric CLOB token ID.' }
  return {
    ok: true,
    value: {
      externalOrderId,
      marketUrl,
      outcome,
      maxSpendUsdc,
      wallet: getAddress(wallet),
      orderType: orderType as 'FAK' | 'FOK',
      ...(marketSlug ? { marketSlug } : {}),
      ...(tokenId ? { tokenId } : {}),
    },
  }
}

async function defaultFetchJson(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return data
  } finally {
    clearTimeout(timeout)
  }
}

function polygonClient() {
  const rpcUrl = clean(process.env.POLYMARKET_RPC_URL || process.env.POLYGON_RPC_URL, 500)
  return createPublicClient({
    chain: polygon,
    transport: http(rpcUrl || undefined),
  })
}

async function defaultReadWallet(wallet: `0x${string}`, spender: `0x${string}`) {
  const client = polygonClient()
  const [bytecode, balanceRaw, allowanceRaw] = await Promise.all([
    client.getBytecode({ address: wallet }),
    client.readContract({ address: PUSD, abi: erc20BalanceAbi, functionName: 'balanceOf', args: [wallet] }),
    client.readContract({ address: PUSD, abi: erc20AllowanceAbi, functionName: 'allowance', args: [wallet, spender] }),
  ])
  return {
    deployed: Boolean(bytecode && bytecode !== '0x'),
    balanceRaw,
    allowanceRaw,
  }
}

const defaultDependencies: PrepareOpenDependencies = {
  fetchJson: defaultFetchJson,
  readWallet: defaultReadWallet,
  now: () => Date.now(),
  builderCode: () => clean(process.env.POLYMARKET_BUILDER_CODE, 80),
  maxUsdc: configuredMaxUsdc,
}

function marketCandidates(markets: GammaMarket[]) {
  return markets.slice(0, 20).map(market => ({
    marketId: clean(market.id, 80),
    marketSlug: clean(market.slug, 180),
    question: clean(market.question, 200),
    groupItemTitle: clean(market.groupItemTitle, 120) || null,
    outcomes: parseStringArray(market.outcomes),
  }))
}

function resolveToken(market: GammaMarket, requestedOutcome: string, explicitTokenId?: string) {
  const outcomes = parseStringArray(market.outcomes)
  const tokenIds = parseStringArray(market.clobTokenIds)
  if (!outcomes.length || outcomes.length !== tokenIds.length) return null
  if (explicitTokenId) {
    const index = tokenIds.indexOf(explicitTokenId)
    if (index < 0) return null
    return { outcome: outcomes[index], tokenId: tokenIds[index] }
  }
  const requested = normalize(requestedOutcome)
  const matches = outcomes
    .map((outcome, index) => ({ outcome, tokenId: tokenIds[index] }))
    .filter(item => normalize(item.outcome) === requested)
  return matches.length === 1 ? matches[0] : null
}

async function resolveMarket(input: PrepareOpenInput, fetchJson: PrepareOpenDependencies['fetchJson']) {
  const url = new URL(input.marketUrl)
  const eventSlug = decodeURIComponent(url.pathname.slice('/event/'.length).split('/')[0] || '')
  if (!eventSlug) return { ok: false as const, status: 400, error: 'Polymarket event URL is missing its slug.' }

  const event = await fetchJson(`${GAMMA_ORIGIN}/events/slug/${encodeURIComponent(eventSlug)}`)
  if (!isRecord(event) || !Array.isArray(event.markets)) {
    return { ok: false as const, status: 404, error: 'Polymarket event could not be resolved from the supplied URL.' }
  }
  const markets = (event.markets as unknown[]).filter(isRecord) as GammaMarket[]
  const tradable = markets.filter(market => market.active !== false && market.closed !== true && market.enableOrderBook !== false && market.acceptingOrders !== false)
  if (!tradable.length) return { ok: false as const, status: 409, error: 'This event has no active order-book market accepting orders.' }

  let selected: GammaMarket | undefined
  if (input.marketSlug) selected = tradable.find(market => clean(market.slug, 180) === input.marketSlug)
  if (!selected && input.tokenId) {
    const tokenMatches = tradable.filter(market => parseStringArray(market.clobTokenIds).includes(input.tokenId as string))
    if (tokenMatches.length === 1) selected = tokenMatches[0]
  }
  if (!selected && tradable.length === 1) selected = tradable[0]
  if (!selected) {
    const directMatches = tradable.filter(market => Boolean(resolveToken(market, input.outcome)))
    if (directMatches.length === 1) selected = directMatches[0]
  }
  if (!selected) {
    const marketNameMatches = tradable.filter(market => {
      const requested = normalize(input.outcome)
      return [market.groupItemTitle, market.question, market.slug].some(value => normalize(clean(value, 200)) === requested)
    })
    if (marketNameMatches.length === 1) selected = marketNameMatches[0]
  }
  if (!selected) {
    return {
      ok: false as const,
      status: 409,
      error: 'The event contains multiple markets. Supply marketSlug or tokenId; PolyDesk will not guess.',
      candidates: marketCandidates(tradable),
    }
  }

  let token = resolveToken(selected, input.outcome, input.tokenId)
  if (!token && !input.tokenId) {
    const marketName = [selected.groupItemTitle, selected.question, selected.slug].some(value => normalize(clean(value, 200)) === normalize(input.outcome))
    if (marketName) token = resolveToken(selected, 'Yes')
  }
  if (!token) {
    return {
      ok: false as const,
      status: 409,
      error: 'Outcome does not map uniquely to a CLOB token for the selected market.',
      candidates: marketCandidates([selected]),
    }
  }
  const conditionId = clean(selected.conditionId, 96)
  if (!/^0x[a-fA-F0-9]{64}$/.test(conditionId)) {
    return { ok: false as const, status: 502, error: 'Polymarket returned an invalid condition ID.' }
  }
  return {
    ok: true as const,
    value: {
      eventSlug,
      marketId: clean(selected.id, 80),
      marketSlug: clean(selected.slug, 180),
      marketTitle: clean(selected.question, 200),
      conditionId,
      outcome: token.outcome,
      tokenId: token.tokenId,
    } satisfies ResolvedMarket,
  }
}

function executionPrice(book: OrderBook, amount: number, orderType: 'FAK' | 'FOK') {
  const asks = (Array.isArray(book.asks) ? book.asks : [])
    .map(level => ({ price: Number(level.price), size: Number(level.size) }))
    .filter(level => Number.isFinite(level.price) && level.price > 0 && level.price < 1 && Number.isFinite(level.size) && level.size > 0)
    .sort((a, b) => a.price - b.price)
  if (!asks.length) return { ok: false as const, error: 'The selected outcome has no sell liquidity.' }
  let capacity = 0
  let boundaryPrice = asks[asks.length - 1].price
  for (const ask of asks) {
    capacity += ask.price * ask.size
    boundaryPrice = ask.price
    if (capacity >= amount) break
  }
  const sufficient = capacity >= amount
  if (!sufficient && orderType === 'FOK') {
    return {
      ok: false as const,
      error: `FOK liquidity is insufficient: about ${capacity.toFixed(6)} USDC is currently available.`,
      availableUsdc: capacity.toFixed(6),
    }
  }
  return {
    ok: true as const,
    price: boundaryPrice,
    sufficient,
    availableUsdc: capacity.toFixed(6),
    partialFillPossible: !sufficient && orderType === 'FAK',
  }
}

function priceString(value: number, tickSize: string) {
  const decimals = Math.max(0, (tickSize.split('.')[1] || '').length)
  return value.toFixed(decimals)
}

export async function preparePolymarketOpen(inputValue: unknown, dependencies: PrepareOpenDependencies = defaultDependencies) {
  const maxUsdc = dependencies.maxUsdc()
  const parsed = parseInput(inputValue, maxUsdc)
  if (!parsed.ok) return parsed
  const input = parsed.value
  const builderCode = dependencies.builderCode()
  if (!/^0x[a-fA-F0-9]{64}$/.test(builderCode)) {
    return { ok: false as const, status: 503, error: 'PolyDesk builder code is not configured.' }
  }

  let resolvedResult: Awaited<ReturnType<typeof resolveMarket>>
  try {
    resolvedResult = await resolveMarket(input, dependencies.fetchJson)
  } catch (error) {
    return { ok: false as const, status: 502, error: `Polymarket market lookup failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
  if (!resolvedResult.ok) return resolvedResult
  const resolved = resolvedResult.value

  let book: OrderBook
  try {
    const value = await dependencies.fetchJson(`${CLOB_ORIGIN}/book?token_id=${encodeURIComponent(resolved.tokenId)}`)
    if (!isRecord(value)) throw new Error('invalid order book')
    book = value as OrderBook
  } catch (error) {
    return { ok: false as const, status: 502, error: `Polymarket order-book lookup failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
  if (clean(book.asset_id, 96) !== resolved.tokenId) {
    return { ok: false as const, status: 502, error: 'Polymarket order book did not match the resolved outcome token.' }
  }
  const tickSize = clean(book.tick_size, 16)
  const minimumOrderSize = clean(book.min_order_size, 32)
  if (!/^(?:0\.)?\d+$/.test(tickSize) || Number(tickSize) <= 0 || !/^\d+(?:\.\d+)?$/.test(minimumOrderSize)) {
    return { ok: false as const, status: 502, error: 'Polymarket order book is missing valid tick-size or minimum-size metadata.' }
  }
  const fill = executionPrice(book, Number(input.maxSpendUsdc), input.orderType)
  if (!fill.ok) return { ok: false as const, status: 409, error: fill.error, ...(fill.availableUsdc ? { availableUsdc: fill.availableUsdc } : {}) }
  const estimatedShares = Number(input.maxSpendUsdc) / fill.price
  if (estimatedShares < Number(minimumOrderSize)) {
    return {
      ok: false as const,
      status: 409,
      error: `maxSpendUsdc is below this market's minimum order size at the current execution price.`,
      minimumOrderSize,
      estimatedShares: estimatedShares.toFixed(6),
    }
  }
  const negRisk = book.neg_risk === true
  const spender = negRisk ? NEG_RISK_CTF_EXCHANGE_V2 : CTF_EXCHANGE_V2

  let walletState: Awaited<ReturnType<PrepareOpenDependencies['readWallet']>>
  try {
    walletState = await dependencies.readWallet(input.wallet as `0x${string}`, spender)
  } catch (error) {
    return { ok: false as const, status: 502, error: `Polygon wallet-readiness check failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
  const amountRaw = usdcAtomic(input.maxSpendUsdc)
  const issues: string[] = []
  if (!walletState.deployed) issues.push('Deposit wallet is not deployed on Polygon.')
  if (walletState.balanceRaw < amountRaw) issues.push('pUSD balance is below maxSpendUsdc.')
  if (walletState.allowanceRaw < amountRaw) issues.push(`pUSD allowance to the ${negRisk ? 'Neg Risk ' : ''}CTF Exchange V2 is below maxSpendUsdc.`)
  if (fill.partialFillPossible) issues.push('Current liquidity can only partially fill this FAK order.')

  const now = dependencies.now()
  const expiresAtMs = now + PLAN_TTL_MS
  const planCore = {
    externalOrderId: input.externalOrderId,
    wallet: input.wallet.toLowerCase(),
    tokenId: resolved.tokenId,
    amount: input.maxSpendUsdc,
    orderType: input.orderType,
    price: priceString(fill.price, tickSize),
    bookHash: clean(book.hash, 96),
    builderCode: builderCode.toLowerCase(),
    expiresAtMs,
  }
  const planId = createHash('sha256').update(JSON.stringify(planCore)).digest('hex').slice(0, 24)

  return {
    ok: true as const,
    status: 200,
    data: {
      ok: true,
      readyForLocalSigning: issues.length === 0,
      planId,
      externalOrderId: input.externalOrderId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      market: {
        url: input.marketUrl,
        eventSlug: resolved.eventSlug,
        marketId: resolved.marketId,
        marketSlug: resolved.marketSlug,
        title: resolved.marketTitle,
        conditionId: resolved.conditionId,
        outcome: resolved.outcome,
        tokenId: resolved.tokenId,
        tickSize,
        minimumOrderSize,
        negRisk,
        bookHash: clean(book.hash, 96) || null,
        bookTimestamp: clean(book.timestamp, 64) || null,
        clobReportedLastTradePrice: clean(book.last_trade_price, 32) || null,
        executionPrice: priceString(fill.price, tickSize),
        executionPriceSource: 'current-asks',
        availableUsdc: fill.availableUsdc,
        partialFillPossible: fill.partialFillPossible,
      },
      wallet: {
        address: input.wallet,
        signatureType: 3,
        deployedOnPolygon: walletState.deployed,
        collateral: {
          symbol: 'pUSD',
          tokenAddress: PUSD,
          decimals: PUSD_DECIMALS,
          balance: formatUnits(walletState.balanceRaw, PUSD_DECIMALS),
          allowance: formatUnits(walletState.allowanceRaw, PUSD_DECIMALS),
          spender,
          required: input.maxSpendUsdc,
        },
        clobCredentials: 'buyer-local-unverified',
      },
      signingPlan: {
        sdk: '@polymarket/clob-client-v2',
        client: {
          host: CLOB_ORIGIN,
          chain: 137,
          signatureType: 3,
          funderAddress: input.wallet,
          builderConfig: { builderCode },
        },
        createMarketOrder: {
          tokenID: resolved.tokenId,
          amount: Number(input.maxSpendUsdc),
          price: Number(priceString(fill.price, tickSize)),
          side: 'BUY',
          orderType: input.orderType,
          userUSDCBalance: Number(formatUnits(walletState.balanceRaw, PUSD_DECIMALS)),
        },
        options: {
          tickSize,
          negRisk,
          version: 2,
        },
        submit: {
          method: 'postOrder',
          orderType: input.orderType,
          postOnly: false,
          deferExec: false,
        },
      },
      checks: {
        marketResolved: true,
        orderBookLive: true,
        walletDeployed: walletState.deployed,
        balanceSufficient: walletState.balanceRaw >= amountRaw,
        allowanceSufficient: walletState.allowanceRaw >= amountRaw,
        clobCredentialsVerified: false,
        cryptographicSignatureVerified: false,
      },
      issues,
      next: issues.length
        ? 'Fix the listed public readiness issues, then request a fresh plan.'
        : 'Create and sign this market order locally with the official SDK, then send only the signed order payload to the PolyDesk signed OPEN preflight.',
      privacy: {
        accepted: ['public wallet address', 'market intent', 'maximum spend'],
        neverSend: ['private key', 'seed phrase', 'CLOB secret', 'CLOB passphrase'],
      },
    },
  }
}

export default async function polymarketOpenPrepareHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const result = await preparePolymarketOpen(req.body)
  if (!result.ok) {
    const { status, ...body } = result
    return res.status(status).json(body)
  }
  return res.status(result.status).json(result.data)
}
