import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
import { inspectPolymarketDepositWallet } from './polymarket-deposit-wallet.js'
import { preparePolymarketOpen } from './polymarket-open-prepare.js'
import { APPROVED_RESEARCH_POLICY, buildGovernedMandateAuthorization } from './a2mcp-polymarket-governed-open.js'
import { readDurableJson } from './render-durable-store.js'
import { runPolymarketSmartTrader, validateSmartTraderDecisionReceipt } from './polymarket-smart-trader.js'

const dependencies = {
  readDecision: (id: string): Promise<unknown> => readDurableJson(`polydesk:smart-trader:decision:${id}`),
  approve: (raw: unknown) => runPolymarketSmartTrader(raw),
  inspectWallet: inspectPolymarketDepositWallet, prepare: preparePolymarketOpen, now: Date.now,
}
const fields = new Set(['researchDecisionId', 'researchAnalysisHash', 'externalOrderId', 'ownerAddress', 'wallet', 'marketUrl', 'conditionId', 'tokenId', 'outcome', 'side', 'maxSpendUsdc', 'maximumPrice', 'orderType'])
const blocked = (error: string, status = 409) => ({ ok: false as const, status, error,
  state: 'RESEARCH_PREPARATION_BLOCKED', nextAction: 'REVIEW_EVIDENCE_AND_AUTHORITY',
  signingAuthorized: false, orderSubmitted: false, automaticRetryAllowed: false })

export async function prepareResearchedPolymarketTrade(raw: unknown, deps = dependencies) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blocked('A JSON object is required.', 400)
  const i = raw as Record<string, unknown>
  if (Object.keys(i).some(k => !fields.has(k))) return blocked('Unsupported research preparation fields. Do not send receipts, signatures or credentials.', 400)
  if (typeof i.researchDecisionId !== 'string' || !/^pstd_[a-f0-9]{24,64}$/.test(i.researchDecisionId)
    || typeof i.researchAnalysisHash !== 'string' || !/^[a-f0-9]{64}$/.test(i.researchAnalysisHash)
    || typeof i.conditionId !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(i.conditionId)
    || i.side !== 'BUY' || !['FAK', 'FOK'].includes(String(i.orderType))) return blocked('Exact research binding and immediate BUY order required.', 400)
  const owner = String(i.ownerAddress ?? ''), spend = String(i.maxSpendUsdc ?? ''), cap = String(i.maximumPrice ?? '')
  if (!isAddress(owner) || !/^\d+(?:\.\d{1,6})?$/.test(spend) || !Number.isFinite(Number(spend)) || Number(spend) <= 0
    || !/^\d+(?:\.\d{1,6})?$/.test(cap) || Number(cap) <= 0 || Number(cap) >= 1) return blocked('Invalid owner or six-decimal buyer limits.', 400)
  let stored: unknown
  try { stored = await deps.readDecision(i.researchDecisionId) } catch { return blocked('Research storage unavailable.', 503) }
  const validated = validateSmartTraderDecisionReceipt(stored, i.researchDecisionId, deps.now())
  if (!validated.ok) return blocked(validated.error, validated.status)
  const r = validated.value
  if (r.decision !== 'APPROVE' || Date.parse(r.createdAt) > deps.now() || r.analysisHash !== i.researchAnalysisHash
    || r.side !== 'BUY' || r.blockers.length || r.evidence.tradeStance !== 'SUPPORT'
    || r.evidence.researchStatus === 'UNAVAILABLE' || !['HIGH', 'MEDIUM'].includes(r.evidence.evidenceQuality || '')
    || !(r.evidence.newsCount > 0)) return blocked('Stored research does not authorize researched preparation.')
  if (r.market.url !== i.marketUrl || r.market.conditionId.toLowerCase() !== i.conditionId.toLowerCase()
    || r.market.tokenId !== i.tokenId || r.market.outcome !== i.outcome) return blocked('Exact market and outcome do not match the stored approval.')
  if (Number(spend) > r.mandate.maximumSpendUsdc || Number(cap) > r.mandate.maximumPrice
    || r.executionSnapshot.bestAsk === null || Number(cap) > r.executionSnapshot.bestAsk + r.mandate.maximumPriceDrift) return blocked('Buyer limits exceed stored research limits.')
  // Reuse PREPARE spread, liquidity, resolution, book-age and drift checks.
  const approval = await deps.approve({ action: 'PREPARE', decisionId: r.decisionId, marketId: r.market.conditionId,
    outcome: r.market.outcome, side: 'BUY', amountUsdc: Number(spend), ...(i.orderType === 'FAK' ? { limitPrice: Number(cap) } : {}), orderType: i.orderType })
  if (!approval.ok) return blocked(approval.error, approval.status)
  if (approval.data.analysisHash !== r.analysisHash) return blocked('Stored approval changed during preparation.')
  let wallet: Awaited<ReturnType<typeof inspectPolymarketDepositWallet>>
  try { wallet = await deps.inspectWallet(owner) } catch { return blocked('Could not verify owner-derived wallet.', 502) }
  if (!wallet.deployed || (i.wallet !== undefined && (!isAddress(String(i.wallet)) || getAddress(String(i.wallet)) !== getAddress(wallet.depositWalletAddress)))) return blocked('Owner-derived wallet is not ready or does not match.')
  const result = await deps.prepare({ externalOrderId: i.externalOrderId, marketUrl: i.marketUrl,
    tokenId: i.tokenId, outcome: i.outcome, maxSpendUsdc: spend, wallet: wallet.depositWalletAddress, orderType: i.orderType })
  if (!result.ok) return blocked(result.error, result.status)
  const p = result.data, now = deps.now()
  const current = validateSmartTraderDecisionReceipt(r, r.decisionId, now)
  if (!current.ok) return blocked(current.error, current.status)
  if (!p.readyForLocalSigning || p.market.conditionId.toLowerCase() !== r.market.conditionId.toLowerCase()
    || p.market.tokenId !== r.market.tokenId || p.market.url !== r.market.url || p.market.outcome !== r.market.outcome) return blocked('Live preparation does not match approved market readiness.')
  const price = Number(p.market.executionPrice)
  if (!Number.isFinite(price) || price <= 0 || price > Number(cap)
    || Math.abs(price - r.executionSnapshot.bestAsk!) > r.mandate.maximumPriceDrift
    || !(r.mandate.maximumShares > 0) || Number(spend) / price > r.mandate.maximumShares) return blocked('Live execution exceeds research price, drift or share limits.')
  const rawTime = p.market.bookTimestamp, numeric = Number(rawTime)
  const bookTime = rawTime && Number.isFinite(numeric) ? numeric < 1e12 ? numeric * 1000 : numeric : Date.parse(rawTime || '')
  if (!Number.isFinite(bookTime) || now - bookTime > Math.min(30_000, r.mandate.maximumBookAgeSeconds * 1000) || bookTime - now > 5000) return {
    ...blocked('A verified fresh order book is required.'), code: 'ORDER_BOOK_FRESHNESS_REQUIRED', state: 'EXECUTION_BLOCKED',
    nextAction: 'WAIT_FOR_FRESH_MARKET_DATA_AND_REPREPARE', readyForLocalSigning: false, manualReviewCanOverride: false,
  }
  const expiresAt = new Date(Math.min(Date.parse(p.expiresAt), Date.parse(r.expiresAt))).toISOString()
  const authorization = buildGovernedMandateAuthorization(p.externalOrderId, {
    maximumAmountUsdc: spend, maximumPrice: cap, allowedTokenIds: [p.market.tokenId], allowedMarketUrls: [p.market.url],
    allowedSigner: wallet.depositWalletAddress, authoritySigner: wallet.ownerAddress, validUntil: expiresAt,
    researchPolicy: APPROVED_RESEARCH_POLICY, researchDecisionId: r.decisionId, researchAnalysisHash: r.analysisHash,
  }, now)
  if (!authorization.ok) return blocked(authorization.error, authorization.status)
  return { ok: true as const, status: 200, data: { ...p, expiresAt, mode: APPROVED_RESEARCH_POLICY,
    zeroScoutApproval: true, orderSubmitted: false, authoritySignatureRequired: true, signingAuthorized: false,
    mandate: authorization.canonicalMandate, mandateHash: authorization.mandateHash, authorizationMessage: authorization.authorizationMessage,
    next: 'Review the exact research-bound plan. Separate buyer authorization and fresh execution checks remain required. No trade has been signed or submitted.',
  } }
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const result = await prepareResearchedPolymarketTrade(req.body)
    if (result.ok) return res.status(200).json(result.data)
    const { status, ...body } = result
    return res.status(status).json(body)
  } catch { return res.status(502).json(blocked('Research preparation could not verify current readiness.', 502)) }
}
