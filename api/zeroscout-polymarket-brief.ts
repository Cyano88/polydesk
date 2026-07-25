import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { appendAgentActivity, findAgentActivity, listAgentActivity, normalizeActivitySlug, type AgentActivity } from './agent-activity.js'
import { callZeroScoutIntelligence } from './zeroscout-intelligence.js'

const POLYMARKET_SCOUT_PATHS = new Set([
  '/api/x402/polymarket-scout',
  '/api/a2mcp/okx/polymarket-lp-scout',
])

function cleanText(value: unknown, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, 1200) : fallback
}

function safeScout(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const scout = value as Record<string, unknown>
  const opportunities = Array.isArray(scout.opportunities)
    ? scout.opportunities.slice(0, 10).map(item => sanitizeOpportunity(item))
    : []
  return {
    summary: cleanText(scout.summary),
    signals: Array.isArray(scout.signals) ? scout.signals.slice(0, 6).map(item => cleanText(item)).filter(Boolean) : [],
    highlights: Array.isArray(scout.highlights) ? scout.highlights.slice(0, 6).map(item => cleanText(item)).filter(Boolean) : [],
    opportunities,
    nextAction: cleanText(scout.nextAction),
    source: cleanText(scout.source),
    disclaimer: cleanText(scout.disclaimer, 'Educational LP research for human review only. Not financial advice and not an automated trading instruction.'),
  }
}

function sanitizeOpportunity(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const item = value as Record<string, unknown>
  return {
    title: cleanText(item.title),
    marketUrl: cleanText(item.marketUrl),
    daysToResolve: finiteNumber(item.daysToResolve),
    dailyReward: finiteNumber(item.dailyReward),
    maxSpread: finiteNumber(item.maxSpread),
    minSize: finiteNumber(item.minSize),
    estimatedRewardCapitalUsdc: finiteNumber(item.estimatedRewardCapitalUsdc),
    liquidity: finiteNumber(item.liquidity),
    bestBid: finiteNumber(item.bestBid),
    bestAsk: finiteNumber(item.bestAsk),
    liveSpread: finiteNumber(item.liveSpread),
    bidDepth: finiteNumber(item.bidDepth),
    askDepth: finiteNumber(item.askDepth),
    depthAtTwoCents: finiteNumber(item.depthAtTwoCents),
    suggestedYesBid: finiteNumber(item.suggestedYesBid),
    suggestedNoBid: finiteNumber(item.suggestedNoBid),
    eligible: typeof item.eligible === 'boolean' ? item.eligible : undefined,
    lpExecutionRisk: cleanText(item.lpExecutionRisk),
    outcomeRisk: cleanText(item.outcomeRisk),
    score: finiteNumber(item.score),
    scoutReason: cleanText(item.scoutReason),
    executionPlan: Array.isArray(item.executionPlan) ? item.executionPlan.slice(0, 6).map(step => cleanText(step)).filter(Boolean) : [],
    contextSignals: Array.isArray(item.contextSignals)
      ? item.contextSignals.slice(0, 2).map(signal => sanitizeContextSignal(signal)).filter(signal => signal.label)
      : [],
  }
}

function sanitizeContextSignal(value: unknown) {
  if (!value || typeof value !== 'object') return { label: '' }
  const item = value as Record<string, unknown>
  return {
    kind: cleanText(item.kind),
    label: cleanText(item.label),
    source: cleanText(item.source),
    title: cleanText(item.title),
    publishedAt: cleanText(item.publishedAt),
  }
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getScoutPath(serviceUrl: string | undefined) {
  if (!serviceUrl) return ''
  try {
    return new URL(serviceUrl).pathname
  } catch {
    return serviceUrl.split('?')[0]
  }
}

function isPolymarketScoutPath(serviceUrl: string | undefined) {
  if (!serviceUrl) return false
  if (!/^https?:\/\//i.test(serviceUrl)) return POLYMARKET_SCOUT_PATHS.has(getScoutPath(serviceUrl))
  try {
    const url = new URL(serviceUrl)
    const allowedOrigins = [
      process.env.PUBLIC_APP_URL,
      process.env.RENDER_EXTERNAL_URL,
      'https://polydesk.trade',
    ].flatMap(value => {
      try {
        return value ? [new URL(value).origin] : []
      } catch {
        return []
      }
    })
    return allowedOrigins.includes(url.origin) && POLYMARKET_SCOUT_PATHS.has(url.pathname)
  } catch {
    return false
  }
}

function hashPayLinkOrigin() {
  try {
    return new URL(process.env.HASH_PAYLINK_BASE_URL || 'https://app.hashpaylink.com').origin
  } catch {
    return 'https://app.hashpaylink.com'
  }
}

export function isTrustedLegacyHashPayLinkScout(activity: AgentActivity | undefined) {
  if (!activity?.proof || activity.proof.kind !== 'circle_gateway_x402') return false
  if (activity.proof.service !== 'polymarket-lp-scout' || activity.proof.sellerAgent !== 'polydesk') return false
  if (!/hash paylink|circle gateway/i.test(String(activity.proof.provider ?? ''))) return false
  try {
    const service = new URL(String(activity.serviceUrl ?? ''))
    const receipt = new URL(String(activity.proof.receiptUrl ?? ''))
    return (
      service.origin === hashPayLinkOrigin()
      && service.pathname === '/api/v2/checkouts/agent'
      && receipt.origin === hashPayLinkOrigin()
      && receipt.pathname.startsWith('/pay/a/')
    )
  } catch {
    return false
  }
}

export function hasIntactAttachedPaymentProof(activity: AgentActivity) {
  const proof = activity.proof
  if (!proof?.proofHash || !/^[a-f0-9]{64}$/i.test(proof.proofHash)) return false
  if (!proof.payer || !proof.amount || !proof.network || !proof.transaction || !proof.serviceUrl) return false
  const expected = crypto.createHash('sha256').update(JSON.stringify({
    kind: proof.kind,
    provider: proof.provider,
    service: proof.service,
    buyerAgent: proof.buyerAgent,
    sellerAgent: proof.sellerAgent,
    payer: proof.payer,
    amount: proof.amount,
    network: proof.network,
    transaction: proof.transaction,
    serviceUrl: proof.serviceUrl,
  })).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(proof.proofHash, 'hex'))
}

export function canonicalScoutServiceUrl(activity: AgentActivity) {
  return isPolymarketScoutPath(activity.serviceUrl)
    ? String(activity.serviceUrl)
    : '/api/x402/polymarket-scout'
}

function requestFromServiceUrl(serviceUrl: string | undefined) {
  if (!serviceUrl) return {}
  try {
    const url = new URL(serviceUrl)
    return {
      mode: cleanText(url.searchParams.get('scoutMode'), 'best'),
      context: cleanText(url.searchParams.get('context')),
      budget: cleanText(url.searchParams.get('budget')),
    }
  } catch {
    return { mode: 'best', context: '', budget: '' }
  }
}

export function isStoredPolymarketScoutActivity(activity: AgentActivity | undefined) {
  return Boolean(
    activity
    && activity.type === 'scout_returned'
    && !activity.result?.zeroscout
    && (isPolymarketScoutPath(activity.serviceUrl) || isTrustedLegacyHashPayLinkScout(activity))
    && activity.result
    && typeof activity.result === 'object',
  )
}

function findMatchingPaidScoutProof(activity: AgentActivity, items: AgentActivity[]) {
  const receiptActivityId = String(activity.result?.receiptActivityId ?? '')
  const proofHash = String(activity.proof?.proofHash ?? '')
  const serviceUrl = canonicalScoutServiceUrl(activity)
  return items.find(item => (
    item.type === 'x402_spent'
    && item.proof?.proofHash
    && item.proof.service === 'polymarket-lp-scout'
    && item.proof.sellerAgent === 'polydesk'
    && isPolymarketScoutPath(item.serviceUrl)
    && (!proofHash || item.proof.proofHash === proofHash)
    && (
      (receiptActivityId && item.id === receiptActivityId)
      || (proofHash && item.proof.proofHash === proofHash)
      || (
        String(item.serviceUrl ?? '') === serviceUrl
        && item.createdAt <= activity.createdAt
        && activity.createdAt - item.createdAt < 15 * 60 * 1000
      )
    )
  ))
}

async function recoverAttachedPaidScoutProof(activity: AgentActivity, items: AgentActivity[]) {
  const existing = findMatchingPaidScoutProof(activity, items)
  if (existing) return existing
  if (!activity.proof || !hasIntactAttachedPaymentProof(activity)) return undefined
  if (!isPolymarketScoutPath(activity.serviceUrl) && !isTrustedLegacyHashPayLinkScout(activity)) return undefined
  const amount = String(activity.proof.amount ?? '').trim()
  return appendAgentActivity({
    agentSlug: activity.agentSlug,
    type: 'x402_spent',
    title: 'PolyDesk LP Scout payment',
    amount: amount.replace(/\s+USDC$/i, ''),
    asset: 'USDC',
    direction: 'out',
    network: activity.proof.network,
    wallet: activity.proof.payer,
    txHash: activity.proof.transaction,
    serviceUrl: canonicalScoutServiceUrl(activity),
    detail: 'Recovered the verified Hash PayLink payment proof attached to this saved LP Scout result.',
    proof: activity.proof,
  })
}

function topOpportunitySummary(scout: ReturnType<typeof safeScout>) {
  const first = Array.isArray(scout.opportunities) ? scout.opportunities[0] : undefined
  if (!first || typeof first !== 'object') return undefined
  return {
    title: first.title,
    marketUrl: first.marketUrl,
    score: first.score,
    rewardPerDay: first.dailyReward,
    bestBid: first.bestBid,
    bestAsk: first.bestAsk,
    liveSpread: first.liveSpread,
    depthAtTwoCents: first.depthAtTwoCents,
    suggestedYesBid: first.suggestedYesBid,
    suggestedNoBid: first.suggestedNoBid,
    lpExecutionRisk: first.lpExecutionRisk,
    outcomeRisk: first.outcomeRisk,
    reason: first.scoutReason,
  }
}

type ZeroScoutBriefOptions = {
  includeClaudeReview?: boolean
  includeOpenAiReview?: boolean
}

async function generateZeroScoutPolymarketBriefOnce(agentSlugInput: unknown, activityIdInput: unknown, options: ZeroScoutBriefOptions = {}) {
  const agentSlug = normalizeActivitySlug(agentSlugInput)
  const activityId = String(activityIdInput ?? '').trim()
  if (!agentSlug || !activityId) {
    const error = new Error('Run a paid LP Scout first, then generate a ZeroScout operator signal from that saved result.') as Error & { status?: number }
    error.status = 400
    throw error
  }

  const scoutActivity = await findAgentActivity(activityId)
  if (!isStoredPolymarketScoutActivity(scoutActivity) || scoutActivity?.agentSlug !== agentSlug) {
    const error = new Error('ZeroScout can only review a saved Polymarket LP Scout result from this agent.') as Error & { status?: number }
    error.status = 403
    throw error
  }

  const activity = await listAgentActivity(agentSlug, 80)
  const paidScout = await recoverAttachedPaidScoutProof(scoutActivity, activity)
  if (!paidScout?.proof?.proofHash) {
    const error = new Error('No matching x402 payment proof was found for this LP Scout result.') as Error & { status?: number }
    error.status = 403
    throw error
  }

  const existing = activity.find(item => (
    item.type === 'scout_returned'
    && item.result?.zeroscout
    && item.result?.sourceActivityId === scoutActivity.id
  ))
  if (existing?.result?.zeroscout) return { result: existing.result.zeroscout, existed: true }

  const scout = safeScout(scoutActivity.result)
  const request = requestFromServiceUrl(scoutActivity.serviceUrl)
  const topOpportunity = topOpportunitySummary(scout)
  const payload = {
    partner: 'PolyDesk',
    productType: 'prediction-market',
    analysisType: 'lp-market-intelligence',
    proofClass: 'paid_lp_scout_proof',
    objective: [
      'Verify and enrich a paid PolyDesk LP Scout result for Agent Hash to deliver to a human Polymarket liquidity provider.',
      'Use only the supplied scout data, x402 payment proof, and market/order-book fields. Do not invent live odds, balances, fills, outcomes, or guarantees.',
      'Compare the selected opportunities against scout.candidateAudit.reviewedCandidates and scout.candidateAudit.rejectedCandidates when present. Confirm whether the selected shortlist is stronger, or explain why a runner-up is safer.',
      'Produce a concise operator brief that explains why the candidate was selected, what must be rechecked on Polymarket before quoting, what can go wrong, and what a cautious human next step is.',
      'The output must be educational research only. It must not be financial advice, automated trading instruction, or a promise of rewards.',
    ].join(' '),
    outputStyle: 'agent-handoff-operator-brief',
    data: {
      request: {
        mode: request.mode,
        context: request.context,
        budget: request.budget,
      },
      proofClass: 'paid_lp_scout_proof',
      source: 'PolyDesk LP Scout using Polymarket Gamma, CLOB rewards, and order book APIs.',
      scout,
      topOpportunity,
      paymentValidation: {
        status: 'x402-paid',
        provider: paidScout.proof.provider ?? 'Circle Gateway x402',
        proofHash: paidScout.proof.proofHash,
        paymentNetwork: paidScout.proof.network,
        transaction: paidScout.proof.transaction,
        payer: paidScout.proof.payer,
        amount: paidScout.proof.amount,
        paidActivityId: paidScout.id,
        scoutActivityId: scoutActivity.id,
        paidAt: paidScout.createdAt,
        scoutReturnedAt: scoutActivity.createdAt,
        serviceUrl: scoutActivity.serviceUrl,
      },
      agentHandoff: {
        agent: 'Agent Hash',
        userMessage: 'View LP Scout result',
        expectedBehavior: [
          'If ZeroScout proof is ready, Agent Hash should deliver the verified LP Scout result immediately.',
          'If proof is not attached yet, Agent Hash should show the saved paid scout result and explain that 0G is being archived in the background.',
          'Agent Hash must never ask the user to pay again for the same saved scout activity.',
        ],
      },
      operatorRules: [
        'Prefer one clear primary opportunity over a long list.',
        'Use candidateAudit to sanity-check ranking quality before endorsing the visible shortlist.',
        'Explain the reward/spread/depth tradeoff in plain language.',
        'Call out shallow books, stale data, high headline risk, wide spread, and time-to-resolution risk.',
        'Tell the user to re-open the Polymarket market and confirm the live order book before placing any maker quote.',
        'Do not recommend market orders or imply automatic execution. PolyDesk may offer a separate human-initiated GTC maker-order ticket, but the user must recheck the live book and approve a distinct wallet signature.',
        'If the supplied data is insufficient, say what is missing instead of forcing a recommendation.',
      ],
      desiredFields: {
        summary: 'One or two sentence human-ready answer.',
        signals: 'Three concise bullets: opportunity, execution check, risk.',
        riskFlags: 'Specific risk flags from supplied data.',
        recommendedActions: 'Human review steps only, including live order-book confirmation.',
        dataGaps: 'Missing or stale fields ZeroScout could not verify from supplied data.',
        safetyBoundaries: 'No financial advice, no auto-trading, no guaranteed rewards.',
      },
      disclaimer: 'Educational LP research for human review only. Not financial advice and not an automated trading instruction.',
    },
    includeClaudeReview: options.includeClaudeReview !== false,
    includeOpenAiReview: options.includeOpenAiReview !== false,
  }
  const result = await callZeroScoutIntelligence(payload, { requireProof: true })

  await appendAgentActivity({
    agentSlug,
    type: 'scout_returned',
    title: 'ZeroScout LP operator signal',
    direction: 'result',
    network: result.network || 'ZeroScout',
    serviceUrl: scoutActivity.serviceUrl,
    detail: result.summary || 'ZeroScout generated a stored LP intelligence signal.',
    result: {
      sourceActivityId: scoutActivity.id,
      receiptActivityId: paidScout.id,
      x402ProofHash: paidScout.proof.proofHash,
      zeroscout: result,
    } as Record<string, unknown>,
  })

  return { result, existed: false }
}

const pendingZeroScoutBriefs = new Map<string, ReturnType<typeof generateZeroScoutPolymarketBriefOnce>>()

export function generateZeroScoutPolymarketBrief(agentSlugInput: unknown, activityIdInput: unknown, options: ZeroScoutBriefOptions = {}) {
  const key = `${normalizeActivitySlug(agentSlugInput)}:${String(activityIdInput ?? '').trim()}`
  const pending = pendingZeroScoutBriefs.get(key)
  if (pending) return pending
  const started = generateZeroScoutPolymarketBriefOnce(agentSlugInput, activityIdInput, options)
  pendingZeroScoutBriefs.set(key, started)
  void started.finally(() => {
    if (pendingZeroScoutBriefs.get(key) === started) pendingZeroScoutBriefs.delete(key)
  }).catch(() => undefined)
  return started
}

export default async function zeroScoutPolymarketBriefHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const generated = await generateZeroScoutPolymarketBrief(req.body?.agentSlug, req.body?.activityId, {
      includeClaudeReview: req.body?.includeClaudeReview !== false,
      includeOpenAiReview: req.body?.includeOpenAiReview !== false,
    })
    res.status(generated.existed ? 200 : 201).json({ ok: true, zeroscout: generated.result })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : 'ZeroScout operator signal failed' })
  }
}
