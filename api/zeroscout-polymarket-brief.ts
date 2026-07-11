import type { Request, Response } from 'express'
import { appendAgentActivity, findAgentActivity, listAgentActivity, normalizeActivitySlug, type AgentActivity } from './agent-activity.js'
import { callZeroScoutIntelligence } from './zeroscout-intelligence.js'

const POLYMARKET_SCOUT_PATH = '/api/x402/polymarket-scout'

function cleanText(value: unknown, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, 1200) : fallback
}

function safeScout(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const scout = value as Record<string, unknown>
  const opportunities = Array.isArray(scout.opportunities)
    ? scout.opportunities.slice(0, 3).map(item => sanitizeOpportunity(item))
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

function isStoredPolymarketScoutActivity(activity: AgentActivity | undefined) {
  return Boolean(
    activity
    && activity.type === 'scout_returned'
    && !activity.result?.zeroscout
    && getScoutPath(activity.serviceUrl) === POLYMARKET_SCOUT_PATH
    && activity.result
    && typeof activity.result === 'object',
  )
}

function findMatchingPaidScoutProof(activity: AgentActivity, items: AgentActivity[]) {
  const serviceUrl = String(activity.serviceUrl ?? '')
  return items.find(item => (
    item.type === 'x402_spent'
    && item.proof?.proofHash
    && getScoutPath(item.serviceUrl) === POLYMARKET_SCOUT_PATH
    && String(item.serviceUrl ?? '') === serviceUrl
    && item.createdAt <= activity.createdAt
    && activity.createdAt - item.createdAt < 15 * 60 * 1000
  ))
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

export async function generateZeroScoutPolymarketBrief(agentSlugInput: unknown, activityIdInput: unknown, options: {
  includeClaudeReview?: boolean
  includeOpenAiReview?: boolean
} = {}) {
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
  const paidScout = findMatchingPaidScoutProof(scoutActivity, activity)
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
          'If proof is still finalizing, Agent Hash should show the saved paid scout result and explain that 0G verification is continuing.',
          'Agent Hash must never ask the user to pay again for the same saved scout activity.',
        ],
      },
      operatorRules: [
        'Prefer one clear primary opportunity over a long list.',
        'Explain the reward/spread/depth tradeoff in plain language.',
        'Call out shallow books, stale data, high headline risk, wide spread, and time-to-resolution risk.',
        'Tell the user to re-open the Polymarket market and confirm the live order book before placing any maker quote.',
        'Do not recommend market orders. Do not imply PolyDesk will place, cancel, or manage LP orders.',
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
      x402ProofHash: paidScout.proof.proofHash,
      zeroscout: result,
    } as Record<string, unknown>,
  })

  return { result, existed: false }
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
