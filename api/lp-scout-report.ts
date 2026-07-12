import type { Request, Response } from 'express'
import { findAgentActivity, listAgentActivity } from './agent-activity.js'

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : []
}

function proofUrl(proof: Record<string, unknown>) {
  const tx = String(proof.storageTxHash || '').trim()
  if (/^0x[a-fA-F0-9]{64}$/.test(tx)) return `https://chainscan.0g.ai/tx/${tx}`
  const root = String(proof.storageRoot || proof.contentHash || '').trim()
  return root ? `https://storagescan.0g.ai/file?root=${encodeURIComponent(root)}` : ''
}

function marketLinksFromScout(result: Record<string, unknown>) {
  const scoutResult = asObject(result.result)
  const items = [
    ...asArray(scoutResult.opportunities),
    ...asArray(scoutResult.signals),
  ]
  const seen = new Set<string>()
  return items.map((item, index) => {
    const url = String(item.polymarketUrl || item.marketUrl || item.url || item.link || '').trim()
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return null
    seen.add(url)
    return {
      label: String(item.title || item.market || item.question || item.name || `Market ${index + 1}`).trim(),
      url,
      rewardDaily: item.rewardDaily ?? item.rewardsDaily ?? item.reward ?? undefined,
      spread: item.spread ?? item.spreadCents ?? undefined,
      depth: item.depthWithin2c ?? item.depth ?? undefined,
      daysLeft: item.daysLeft ?? item.timeLeftDays ?? undefined,
      yesQuote: item.yesQuote ?? item.yesEntry ?? item.yes ?? undefined,
      noQuote: item.noQuote ?? item.noEntry ?? item.no ?? undefined,
    }
  }).filter(Boolean).slice(0, 6)
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const id = String(req.query.id ?? req.query.activityId ?? '').trim()
  const receiptId = String(req.query.receipt ?? req.query.receiptId ?? '').trim()
  if (!id) return res.status(400).json({ ok: false, error: 'Missing LP Scout report id.' })

  try {
    const scout = await findAgentActivity(id)
    if (!scout || scout.type !== 'scout_returned') {
      return res.status(404).json({ ok: false, error: 'LP Scout report not found.' })
    }

    const activity = await listAgentActivity(scout.agentSlug, 80)
    const verified = activity.find(item => (
      item.type === 'scout_returned'
      && asObject(item.result).sourceActivityId === scout.id
      && asObject(item.result).zeroscout
    ))
    const queued = activity.find(item => (
      item.type === 'scout_verification_queued'
      && asObject(item.result).sourceActivityId === scout.id
    ))
    const failed = activity.find(item => (
      item.type === 'scout_verification_failed'
      && asObject(item.result).sourceActivityId === scout.id
    ))
    const x402 = receiptId
      ? activity.find(item => item.id === receiptId && item.type === 'x402_spent')
      : activity.find(item => item.id === asObject(verified?.result).receiptActivityId && item.type === 'x402_spent')
        ?? activity.find(item => item.id === asObject(queued?.result).receiptActivityId && item.type === 'x402_spent')
        ?? activity.find(item => item.type === 'x402_spent' && item.proof?.proofHash === asObject(verified?.result).x402ProofHash)
        ?? activity.find(item => item.type === 'x402_spent' && item.serviceUrl === scout.serviceUrl)

    const zeroScout = asObject(asObject(scout.result).zeroscout || asObject(verified?.result).zeroscout)
    const proof = asObject(zeroScout.proof)
    const scoutResult = asObject(scout.result)

    return res.json({
      ok: true,
      report: {
        id: scout.id,
        agentSlug: scout.agentSlug,
        title: scout.title || 'PolyDesk LP Scout report',
        createdAt: scout.createdAt,
        status: zeroScout.summary || zeroScout.suggestedAnswer ? 'verified' : failed ? 'needs_retry' : 'finalizing',
        detail: scout.detail,
        summary: zeroScout.suggestedAnswer || zeroScout.summary || scout.detail || 'LP Scout report is saved.',
        signals: Array.isArray(zeroScout.signals) ? zeroScout.signals : [],
        recommendedActions: Array.isArray(zeroScout.recommendedActions) ? zeroScout.recommendedActions : [],
        riskFlags: Array.isArray(zeroScout.riskFlags) ? zeroScout.riskFlags : [],
        safetyBoundaries: Array.isArray(zeroScout.safetyBoundaries) ? zeroScout.safetyBoundaries : [],
        marketLinks: marketLinksFromScout({ result: scoutResult }),
        scout: scoutResult,
        zeroscout: zeroScout,
        proof: {
          ...proof,
          url: proofUrl(proof),
        },
        x402: x402 ? {
          id: x402.id,
          title: x402.title,
          amount: x402.amount,
          asset: x402.asset,
          createdAt: x402.createdAt,
          proof: x402.proof,
          receiptUrl: `/receipt/${encodeURIComponent(x402.id)}`,
        } : undefined,
        retryState: failed ? {
          detail: failed.detail,
          result: failed.result,
        } : undefined,
      },
    })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'LP Scout report lookup failed.',
    })
  }
}
