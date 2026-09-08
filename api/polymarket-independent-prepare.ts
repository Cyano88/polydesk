import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
import { inspectPolymarketDepositWallet } from './polymarket-deposit-wallet.js'
import { preparePolymarketOpen } from './polymarket-open-prepare.js'
import { buildGovernedMandateAuthorization } from './a2mcp-polymarket-governed-open.js'
import { independentExecutionDescriptor, INDEPENDENT_RESEARCH_POLICY, INDEPENDENT_RESEARCH_DISCLAIMER } from './polymarket-independent-policy.js'
import { verifyPreparedFeed } from './polymarket-feed-verification.js'

type Dependencies = {
  inspectWallet: typeof inspectPolymarketDepositWallet
  prepare: typeof preparePolymarketOpen
  now: () => number
  verifyFeed?: typeof verifyPreparedFeed
}
const dependencies: Dependencies = { inspectWallet: inspectPolymarketDepositWallet, prepare: preparePolymarketOpen, now: Date.now, verifyFeed: verifyPreparedFeed }
const allowedFields = new Set(['acknowledgeIndependentDecision', 'externalOrderId', 'ownerAddress', 'wallet', 'marketUrl', 'marketSlug', 'tokenId', 'outcome', 'side', 'maxSpendUsdc', 'maximumPrice', 'orderType'])

export async function prepareIndependentPolymarketTrade(raw: unknown, deps: Dependencies = dependencies) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false as const, status: 400, error: 'A JSON object is required.' }
  const input = raw as Record<string, unknown>
  if (Object.keys(input).some(key => !allowedFields.has(key))) return { ok: false as const, status: 400, error: 'Unsupported independent preparation fields. Never send private keys or reusable credentials.' }
  if (input.acknowledgeIndependentDecision !== true) return { ok: false as const, status: 428, error: 'Explicit acknowledgeIndependentDecision=true is required.', independentExecution: independentExecutionDescriptor() }
  if (input.side !== 'BUY' || (input.orderType !== undefined && !['FAK', 'FOK'].includes(String(input.orderType)))) return { ok: false as const, status: 400, error: 'Independent governed preparation supports immediate FAK or FOK BUY orders only.' }
  const owner = String(input.ownerAddress ?? '')
  const maximumPrice = String(input.maximumPrice ?? '')
  const maxSpendUsdc = String(input.maxSpendUsdc ?? '')
  if (!isAddress(owner)) return { ok: false as const, status: 400, error: 'ownerAddress must be the buyer owner EOA.' }
  if (!/^\d+(?:\.\d{1,6})?$/.test(maximumPrice) || Number(maximumPrice) <= 0 || Number(maximumPrice) >= 1) return { ok: false as const, status: 400, error: 'maximumPrice must be between 0 and 1, with at most 6 decimals.' }
  if (!/^\d+(?:\.\d{1,6})?$/.test(maxSpendUsdc) || Number(maxSpendUsdc) <= 0 || !Number.isFinite(Number(maxSpendUsdc))) return { ok: false as const, status: 400, error: 'maxSpendUsdc must be a positive finite amount with at most 6 decimals.' }
  let wallet: Awaited<ReturnType<typeof inspectPolymarketDepositWallet>>
  try { wallet = await deps.inspectWallet(owner) } catch {
    return { ok: false as const, status: 502, error: 'Could not verify the owner-derived Deposit Wallet.' }
  }
  if (input.wallet !== undefined && (!isAddress(String(input.wallet)) || getAddress(String(input.wallet)) !== getAddress(wallet.depositWalletAddress))) return { ok: false as const, status: 409, error: 'wallet does not match the Deposit Wallet derived from ownerAddress.' }
  if (!wallet.deployed) return { ok: false as const, status: 409, error: 'The owner-derived Deposit Wallet must be deployed before preparation.', nextAction: 'SETUP_DEPOSIT_WALLET' }
  const result = await deps.prepare({
    externalOrderId: input.externalOrderId, marketUrl: input.marketUrl, marketSlug: input.marketSlug,
    tokenId: input.tokenId, outcome: input.outcome, maxSpendUsdc,
    wallet: wallet.depositWalletAddress, orderType: input.orderType || 'FAK',
  })
  if (!result.ok) return result
  const plan = result.data
  if (!plan.readyForLocalSigning) return { ok: false as const, status: 409, error: 'The live wallet or order book is not ready for independent preparation.', issues: plan.issues, readinessEndpoint: '/api/polymarket-account/readiness' }
  const price = Number(plan.market.executionPrice)
  if (!Number.isFinite(price) || price <= 0 || price > Number(maximumPrice)) return { ok: false as const, status: 409, error: 'The current execution price exceeds maximumPrice.' }
  const rawTimestamp = plan.market.bookTimestamp
  const numericTimestamp = Number(rawTimestamp)
  const bookTimestamp = rawTimestamp && Number.isFinite(numericTimestamp)
    ? (numericTimestamp < 1_000_000_000_000 ? numericTimestamp * 1000 : numericTimestamp)
    : Date.parse(rawTimestamp || '')
  let now = deps.now()
  const validTimestamp = typeof rawTimestamp === 'string' && /^[1-9][0-9]{12,15}$/.test(rawTimestamp) && Number.isSafeInteger(numericTimestamp)
  const quietFeedVerified = validTimestamp && now - bookTimestamp > 30_000
    && deps.verifyFeed !== undefined && await deps.verifyFeed(plan, deps.now)
  now = deps.now()
  if (!validTimestamp || (!quietFeedVerified && now - bookTimestamp > 30_000) || bookTimestamp - now > 5_000) return {
    ok: false as const, status: 409, error: 'A verified order book timestamp within 30 seconds is required.',
    code: 'ORDER_BOOK_FRESHNESS_REQUIRED', state: 'EXECUTION_BLOCKED',
    nextAction: 'WAIT_FOR_FRESH_MARKET_DATA_AND_REPREPARE',
    readyForLocalSigning: false, signingAuthorized: false, orderSubmitted: false,
    automaticRetryAllowed: false, manualReviewCanOverride: false,
  }
  if (Date.parse(plan.expiresAt) <= now || now - Date.parse(plan.createdAt) > 30_000 || Date.parse(plan.createdAt) > now) return { ok: false as const, status: 409, error: 'The preparation plan expired. Request a fresh plan.' }
  const authorization = buildGovernedMandateAuthorization(plan.externalOrderId, {
    maximumAmountUsdc: maxSpendUsdc, maximumPrice,
    allowedTokenIds: [plan.market.tokenId], allowedMarketUrls: [plan.market.url],
    allowedSigner: wallet.depositWalletAddress, authoritySigner: wallet.ownerAddress,
    validUntil: plan.expiresAt, researchPolicy: INDEPENDENT_RESEARCH_POLICY,
  }, now)
  if (!authorization.ok) return authorization
  return {
    ok: true as const, status: 200,
    data: {
      ...plan,
      mode: INDEPENDENT_RESEARCH_POLICY,
      disclaimer: INDEPENDENT_RESEARCH_DISCLAIMER,
      zeroScoutApproval: false,
      orderSubmitted: false,
      authoritySignatureRequired: true,
      mandate: authorization.canonicalMandate,
      authorizationMessage: authorization.authorizationMessage,
      mandateHash: authorization.mandateHash,
      governedHandoff: {
        validateEndpoint: '/api/polymarket-governed-open/validate',
        executionEndpoint: '/api/a2mcp/polymarket-agent-flow',
        serviceAccess: 'Inspect the existing governed service payment or marketplace-free terms separately before proceeding.',
      },
      next: 'Review the independent-decision disclaimer and exact order. Sign authorizationMessage with the owner EOA and the order locally with the official SDK. Put authoritySignature inside this mandate, validate the exact governed request, then use the governed handoff only after APPROVE. Refresh wallet, market, and access checks before submission.',
    },
  }
}

export default async function independentPolymarketPrepareHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') return res.status(200).json({ ok: true, ...independentExecutionDescriptor() })
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Use POST to prepare an independent decision.' }) }
  try {
    const result = await prepareIndependentPolymarketTrade(req.body)
    if (!result.ok) { const { status, ...body } = result; return res.status(status).json(body) }
    return res.status(result.status).json(result.data)
  } catch { return res.status(502).json({ ok: false, error: 'Independent preparation failed to verify current execution readiness.' }) }
}
