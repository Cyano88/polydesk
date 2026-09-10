import { taskResearchInputError } from './polymarket-smart-trader.js'

const endpoint = 'https://polydesk.trade/api/a2a/polydesk-trading-agent'
type Json = Record<string, unknown>
function record(value: unknown): value is Json { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }

export function validateResearchOperatorRequest(raw: unknown): Json {
  if (!record(raw)) throw new Error('Research operator request must be an object.')
  const common = ['action', 'agentId', 'serviceId', 'taskStatus', 'jobId', 'buyerAgentId']
  const fields = raw.action === 'RESEARCH' ? [...common, 'research'] : raw.action === 'RESEARCH_PREPARE'
    ? [...common, 'reportId', 'acknowledgeIndependentDecision', 'ownerAddress', 'maxSpendUsdc', 'maximumPrice'] : []
  if (!fields.length || Object.keys(raw).some(key => !fields.includes(key))) throw new Error('Unsupported research operator action or fields.')
  if (raw.agentId !== '5427' || raw.serviceId !== '38484' || raw.taskStatus !== 'job_accepted'
    || typeof raw.jobId !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(raw.jobId)
    || typeof raw.buyerAgentId !== 'string' || !/^\d{1,20}$/.test(raw.buyerAgentId)) throw new Error('Exact accepted One-Off task identifiers required.')
  if (raw.action === 'RESEARCH') {
    const invalid = taskResearchInputError(raw.research)
    if (invalid) throw new Error(invalid)
  } else if (raw.acknowledgeIndependentDecision !== true || typeof raw.reportId !== 'string' || !/^pdar_[a-f0-9]{64}$/.test(raw.reportId)
    || typeof raw.ownerAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(raw.ownerAddress)
    || ![raw.maxSpendUsdc, raw.maximumPrice].every(value => typeof value === 'string' && /^\d+(?:\.\d{1,6})?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0)) throw new Error('Exact report, owner, limits and explicit independent decision required.')
  return raw
}

// The authoritative OKX event script must authorize invocation. A JSON field
// saying job_accepted is not independently verified by this transport.
export async function runResearchOperator(raw: unknown, options: {
  execute: boolean; operatorKey?: string; url?: string; fetch?: typeof fetch
}) {
  const request = validateResearchOperatorRequest(raw)
  if (!options.execute) return { ok: true, dryRun: true, action: request.action, jobId: request.jobId,
    taskAcceptanceVerified: false, paymentSubmitted: false, orderSubmitted: false,
    next: 'Run only from the authoritative accepted-task script; this dry run validates input only.' }
  // Never forward the operator secret to an arbitrary configured origin,
  // redirect, query string, or another route.
  if ((options.url || endpoint) !== endpoint) throw new Error('Research operator endpoint must be the exact trusted PolyDesk route.')
  if (!options.operatorKey?.trim()) throw new Error('Research operator access is not configured.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 240000)
  try {
    const response = await (options.fetch || fetch)(endpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${options.operatorKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok || !response.body) throw new Error('Research operator request did not complete. Reconcile the same task; do not pay or automatically retry.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 262144) { await reader.cancel(); throw new Error('Research response exceeds the allowed size.') }
      chunks.push(chunk.value)
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!record(result) || result.ok !== true || result.orderAuthorized !== false || result.orderSubmitted !== false) throw new Error('Research response violates the non-authorizing contract.')
    const correlation = request.action === 'RESEARCH' ? result : result.taskResearch
    if (!record(correlation) || correlation.jobId !== String(request.jobId).toLowerCase() || correlation.buyerAgentId !== request.buyerAgentId
      || typeof correlation.reportId !== 'string' || !/^pdar_[a-f0-9]{64}$/.test(correlation.reportId)
      || (request.action === 'RESEARCH_PREPARE' && correlation.reportId !== request.reportId)) throw new Error('Research response does not match the requested task, buyer or report.')
    return result
  } catch {
    // Never expose provider bodies, bearer values, or input parser snippets.
    throw new Error('Research operator result unavailable or invalid. Reconcile this task; no automatic payment, execution or retry was performed.')
  } finally { clearTimeout(timer) }
}
