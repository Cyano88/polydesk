import { createHash } from 'node:crypto'
type Row = Record<string, unknown>
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) as Row[] : []
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
export function lpScoutEvidenceView(original: Row) {
  const audit = object(original.candidateAudit)
  const rejected = rows(audit.rejectedCandidates).map(row => {
    const { eligible, ...rest } = row
    const observedRejectionReasons: string[] = []
    const mode = object(original.request).mode
    if (mode !== 'football' && typeof row.daysToResolve === 'number') {
      if (row.daysToResolve < 7) observedRejectionReasons.push('Less than the required 7 days to resolution.')
      if (row.daysToResolve > 180) observedRejectionReasons.push('More than the allowed 180 days to resolution.')
    }
    if (typeof row.depthAtTwoCents === 'number' && row.depthAtTwoCents < 5000) observedRejectionReasons.push('Book depth within 2 cents is below 5,000 shares.')
    if (typeof row.midpoint === 'number' && (row.midpoint < 0.15 || row.midpoint > 0.85)) observedRejectionReasons.push('Midpoint is outside the 0.15 to 0.85 screening range.')
    if (row.lpExecutionRisk === 'high') observedRejectionReasons.push('The saved report marks LP execution risk as high.')
    if (row.bookVerified === false) observedRejectionReasons.push('Book validation did not pass.')
    if (row.rewardPoolVerified === false) observedRejectionReasons.push('Reward pool was not verified.')
    if (typeof row.liveSpread === 'number' && row.liveSpread > 0.025) observedRejectionReasons.push('Spread exceeds the 2.5-cent screening ceiling.')
    if (!observedRejectionReasons.length) observedRejectionReasons.push('Rejected by the original screen; the retained fields do not establish the exact failed rule.')
    return { ...rest, rewardSpreadEligible: typeof eligible === 'boolean' ? eligible : undefined,
      safetyScreenPassed: false, observedRejectionReasons }
  })
  const scanned = count(audit.scanned)
  const passed = count(audit.conservativePassed)
  const undisclosed = scanned !== undefined && passed !== undefined ? Math.max(0, scanned - passed - rejected.length) : undefined
  return {
    presentationVersion: 'lp-evidence-v1',
    originalReportHash: createHash('sha256').update(JSON.stringify(original)).digest('hex'),
    originalPreserved: true,
    researchRerun: false,
    scope: { scanned, passed, disclosedRejections: rejected.length, undisclosedRejections: undisclosed,
      note: scanned === undefined ? 'The saved report does not record scan coverage.' : `The report records ${scanned} scanned candidates and ${passed ?? 'an unknown number of'} passing candidates. ${rejected.length} rejection records are available. This is a limited scan, not an exhaustive survey of Polymarket.`,
      limitation: undisclosed ? `${undisclosed} rejection records were not retained in this delivery; their individual failed rules cannot be reconstructed without new research.` : undefined },
    eligibilityExplanation: 'Reward-spread eligibility only compares spread with the reward spread limit. It is not a pass of the full safety screen or permission to trade.',
    evidenceTiming: 'These are saved observations at delivery time, not refreshed prices or a current trade preview.',
    rejectedCandidates: rejected,
  }
}

export function lpVerificationStatus(completed: boolean, failed: boolean, queuedResult: Record<string, unknown> = {}) {
  if (completed) return { reportStatus: 'verified', aiStatus: 'complete' }
  // Older timeout handlers wrote queued+retryable even though their promise ended.
  if (failed || queuedResult.retryable === true || queuedResult.upstreamCompletionUnknown === true) return { reportStatus: 'needs_retry', aiStatus: 'needs_attention' }
  return { reportStatus: 'finalizing', aiStatus: 'pending' }
}
