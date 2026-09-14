import { createHash } from 'node:crypto'
import type { AgentActivity } from './agent-activity.js'
import { authorizedLpScoutReceipt } from './lp-scout-access.js'
import { lpScoutEvidenceView } from './lp-scout-report-evidence.js'

export function lpCorrectionPlan(scout: AgentActivity, activity: AgentActivity[], priorId: unknown, receiptId: unknown) {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 409 }) }
  if (!authorizedLpScoutReceipt(scout, activity, receiptId)) fail('The original LP receipt is required for this correction.')
  const prior = activity.find(item => item.id === priorId && item.agentSlug === scout.agentSlug
    && item.type === 'scout_returned' && item.result?.sourceActivityId === scout.id && item.result?.zeroscout)
  if (!prior) fail('The correction must reference an AI delivery linked to this saved LP scout.')
  const evidence = lpScoutEvidenceView(scout.result ?? {})
  const version = 'lp-candidate-evidence-v1'
  const correctionKey = createHash('sha256').update(JSON.stringify([scout.id, prior!.id, evidence.originalReportHash, version])).digest('hex')
  const deliveries = activity.filter(item => item.agentSlug === scout.agentSlug && item.result?.sourceActivityId === scout.id && item.result?.zeroscout)
    .sort((a, b) => b.createdAt - a.createdAt)
  if (deliveries[0]?.id !== prior!.id && !deliveries.some(item => item.result?.correctionKey === correctionKey)) {
    fail('A newer AI delivery exists; review it before requesting another correction.')
  }
  return {
    correctionKey, correctionVersion: version, correctionOfActivityId: prior!.id,
    originalReportHash: evidence.originalReportHash,
    correctionReason: 'Restore retained candidate audit evidence omitted from the previous AI handoff; disclose missing records and historical timing.',
  }
}
