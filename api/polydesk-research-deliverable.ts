import { writeFile } from 'node:fs/promises'

type Json = Record<string, any>
const object = (v: unknown): v is Json => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

function matchesRequestedMarket(value: unknown, market: Json): boolean {
  if (!nonempty(value)) return false
  const reference = value.trim()
  if (/^0x[a-fA-F0-9]{64}$/.test(reference)) return reference.toLowerCase() === market.conditionId.toLowerCase()
  if (!reference.includes('://')) return [market.eventSlug, market.marketSlug].includes(reference)
  try {
    const url = new URL(reference)
    if (url.protocol !== 'https:' || !/^(www\.)?polymarket\.com$/i.test(url.hostname) || url.username || url.password || url.port) return false
    const parts = url.pathname.replace(/\/$/, '').split('/').slice(1).map(decodeURIComponent)
    return parts[0] === 'event' && parts[1] === market.eventSlug
      && (parts.length === 2 || (parts.length === 3 && parts[2] === market.marketSlug))
  } catch { return false }
}

// Keep the actual response at the JSON root so its handoff paths resolve.
export function serializeResearchDeliverable(raw: unknown, request: { jobId: unknown; buyerAgentId: unknown; research: unknown }): string {
  const fail = (): never => { throw new Error('Invalid research deliverable; reconcile the saved task without rerunning research.') }
  if (!object(raw) || !object(request.research)) return fail()
  const h = raw.agentHandoff
  const selected = raw.selected
  if (raw.ok !== true || raw.schema !== 'polydesk-a2a-market-research-v1'
    || raw.jobId !== String(request.jobId).toLowerCase() || raw.buyerAgentId !== request.buyerAgentId
    || !nonempty(raw.reportId) || !/^pdar_[a-f0-9]{64}$/.test(raw.reportId)
    || raw.orderAuthorized !== false || raw.orderSubmitted !== false || raw.additionalPaymentRequired !== false
    || !['AVAILABLE', 'UNAVAILABLE'].includes(raw.researchStatus)
    || !object(raw.evidence) || !Array.isArray(raw.blockers) || !nonempty(raw.opinion)
    || !object(selected?.market) || !object(selected?.outcome) || !object(h?.market)) return fail()
  if (!nonempty(raw.generatedAt) || !nonempty(raw.validUntil)) return fail()
  const generated = Date.parse(raw.generatedAt)
  const expires = Date.parse(raw.validUntil)
  if (!Number.isFinite(generated) || !Number.isFinite(expires) || expires <= generated) return fail()
  // Expired cached reports remain historical evidence; never refresh dates.
  if (!/^0x[a-fA-F0-9]{64}$/.test(selected.market.conditionId || '')
    || !nonempty(selected.outcome.tokenId) || !/^\d+$/.test(selected.outcome.tokenId) || !nonempty(selected.outcome.label)
    || h.schema !== 'polydesk-agent-handoff-v1' || h.recipient !== 'REQUESTING_AGENT'
    || h.state !== 'REVIEW_REQUIRED' || h.nextAction !== 'REVIEW_EVIDENCE'
    || h.orderAuthorized !== false || h.automaticResearchRetry !== false
    || !object(h.review) || h.review.required !== true || !Array.isArray(h.review.blockers)
    || h.researchStatus !== raw.researchStatus || h.decisionId !== null || h.analysisHash !== null
    || h.evidencePath !== '$.evidence' || h.selectionPath !== '$.selected'
    || h.market.conditionId !== selected.market.conditionId || h.market.tokenId !== selected.outcome.tokenId
    || h.market.outcome !== selected.outcome.label || h.market.url !== selected.market.url
    || h.market.marketSlug !== selected.market.marketSlug || h.market.side !== request.research.side) return fail()
  const researchOnly = !Object.prototype.hasOwnProperty.call(request.research, 'mandate')
  // Internal agreement is insufficient: a consistently wrong selection must
  // not escape under the original task's identifiers.
  if (!matchesRequestedMarket(request.research.marketId, selected.market)
    || !nonempty(request.research.outcome)
    || selected.outcome.label.trim().toLowerCase() !== request.research.outcome.trim().toLowerCase()) return fail()
  if (raw.researchOnly !== researchOnly || (researchOnly && raw.screeningMandate !== null)) return fail()
  if (raw.researchStatus === 'AVAILABLE') {
    const proof = raw.evidence.zeroScout?.proof
    if (!object(proof) || !/^0x[a-fA-F0-9]{64}$/.test(proof.storageRoot || '')
      || !/^0x[a-fA-F0-9]{64}$/.test(proof.contentHash || '')) return fail()
  }
  const json = JSON.stringify(raw, null, 2) + '\n'
  if (Buffer.byteLength(json) > 262144) return fail()
  return json
}

export async function writeResearchDeliverable(path: string, raw: unknown, request: Parameters<typeof serializeResearchDeliverable>[1]) {
  const json = serializeResearchDeliverable(raw, request)
  await writeFile(path, json, { flag: 'wx', mode: 0o600 })
}
