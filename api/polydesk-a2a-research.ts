import { createHash } from 'node:crypto'
import { isAddress, getAddress } from 'viem'
import { prepareIndependentPolymarketTrade } from './polymarket-independent-prepare.js'
import { runPolymarketTaskResearch, taskResearchInputError } from './polymarket-smart-trader.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'

type Result = Awaited<ReturnType<typeof runPolymarketTaskResearch>>
type RecordState = { binding: string; buyerAgentId: string; result?: Result; resultHash?: string; preparationBinding?: string }
export type A2aResearchDependencies = {
  hasStore: () => boolean
  mutate: (key: string, change: (current: RecordState | undefined) => RecordState) => Promise<RecordState>
  research: typeof runPolymarketTaskResearch
}
const defaults: A2aResearchDependencies = {
  hasStore: hasRenderDurableStore,
  mutate: (key, change) => mutateDurableJson<RecordState>(key, change),
  research: runPolymarketTaskResearch,
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
  return JSON.stringify(value)
}
export const a2aResearchResultHash = (result: Result) => hash(canonical(result))
const researchKey = (jobId: string) => `polydesk:a2a:research:${hash(jobId.toLowerCase())}`
function validResult(record: RecordState) {
  return Boolean(record.result && record.resultHash && record.resultHash === a2aResearchResultHash(record.result))
}

// Invoked ONLY behind the existing private operator authentication. The trusted
// operator must obtain job_accepted from OKX; request text is not proof of it.
export async function researchA2aTask(raw: unknown, deps: A2aResearchDependencies = defaults) {
  const bad = (status: number, error: string) => ({ ok: false as const, status, error })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad(400, 'A research request object is required.')
  const input = raw as Record<string, unknown>
  if (Object.keys(input).some(key => !['action', 'agentId', 'serviceId', 'jobId', 'buyerAgentId', 'taskStatus', 'research'].includes(key))) return bad(400, 'Unsupported research request field.')
  if (input.action !== 'RESEARCH' || input.agentId !== '5427' || input.serviceId !== '38484' || input.taskStatus !== 'job_accepted') return bad(409, 'Research requires the accepted One-Off task and exact service identity.')
  if (typeof input.jobId !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(input.jobId) || typeof input.buyerAgentId !== 'string' || !/^\d{1,20}$/.test(input.buyerAgentId)) return bad(400, 'Valid task and buyer identifiers are required.')
  if (!input.research || typeof input.research !== 'object' || Array.isArray(input.research)) return bad(400, 'Exact research inputs are required.')
  const research = input.research as Record<string, unknown>
  const invalid = taskResearchInputError(research)
  if (invalid) return bad(400, invalid)
  if (!deps.hasStore()) return bad(503, 'Durable task research storage is required.')
  const jobId = input.jobId.toLowerCase()
  const binding = hash(canonical({ jobId, buyerAgentId: input.buyerAgentId, research }))
  const key = researchKey(jobId)
  let acquired = false
  let record: RecordState
  try {
    record = await deps.mutate(key, current => {
      if (current) return current
      acquired = true
      return { binding, buyerAgentId: input.buyerAgentId as string }
    })
  } catch { return bad(503, 'Task research storage unavailable. No research started.') }
  if (record.binding !== binding || record.buyerAgentId !== input.buyerAgentId) return bad(409, 'This task is already bound to different research inputs or buyer.')
  if (record.result && !validResult(record)) return bad(409, 'Stored research integrity check failed. Reconcile this task.')
  if (record.result) return record.result.ok
    ? { ...record.result, data: { ...record.result.data, reportId: `pdar_${record.resultHash}`, jobId, buyerAgentId: input.buyerAgentId, idempotentReplay: true } }
    : record.result
  if (!acquired) return bad(409, 'Research already started. Reconcile unfinished work; do not automatically charge or retry.')
  let result: Result
  try { result = await deps.research(research) } catch { result = bad(502, 'Research failed. No trade authorized; operator review required.') }
  try { await deps.mutate(key, current => {
    if (!current || current.binding !== binding) throw new Error('Binding changed')
    return { ...current, result, resultHash: a2aResearchResultHash(result) }
  }) } catch { return bad(503, 'Research result storage failed. Reconcile this task before retrying.') }
  return result.ok ? { ...result, data: { ...result.data, reportId: `pdar_${a2aResearchResultHash(result)}`, jobId, buyerAgentId: input.buyerAgentId, idempotentReplay: false } } : result
}

type PreparationDependencies = {
  read: (key: string) => Promise<RecordState | undefined>
  mutate: A2aResearchDependencies['mutate']
  prepare: typeof prepareIndependentPolymarketTrade
  now: () => number
}
const preparationDefaults: PreparationDependencies = {
  read: readDurableJson, mutate: defaults.mutate, prepare: prepareIndependentPolymarketTrade, now: Date.now,
}

// Private operator only. Generates a plan; owner signatures and the existing
// governed verification remain mandatory. An AI opinion is not authorization.
export async function prepareA2aResearchedTask(raw: unknown, deps: PreparationDependencies = preparationDefaults) {
  const bad = (status: number, error: string) => ({ ok: false as const, status, error })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad(400, 'A preparation request is required.')
  const i = raw as Record<string, unknown>
  if (Object.keys(i).some(key => !['action', 'agentId', 'serviceId', 'taskStatus', 'jobId', 'buyerAgentId', 'reportId', 'acknowledgeIndependentDecision', 'ownerAddress', 'maxSpendUsdc', 'maximumPrice'].includes(key))) return bad(400, 'Unsupported preparation fields.')
  if (i.action !== 'RESEARCH_PREPARE' || i.agentId !== '5427' || i.serviceId !== '38484' || i.taskStatus !== 'job_accepted') return bad(409, 'Accepted One-Off task identity required.')
  if (typeof i.jobId !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(i.jobId) || typeof i.buyerAgentId !== 'string' || !/^\d{1,20}$/.test(i.buyerAgentId) || typeof i.reportId !== 'string' || !/^pdar_[a-f0-9]{64}$/.test(i.reportId)) return bad(400, 'Exact task, buyer, and research report identifiers required.')
  if (i.acknowledgeIndependentDecision !== true) return bad(428, 'Explicit independent decision after reviewing research is required.')
  if (typeof i.ownerAddress !== 'string' || !isAddress(i.ownerAddress)) return bad(400, 'Buyer owner EOA required.')
  if (![i.maxSpendUsdc, i.maximumPrice].every(value => typeof value === 'string' && /^\d+(?:\.\d{1,6})?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0)) return bad(400, 'Exact positive decimal-string limits required.')
  const key = researchKey(i.jobId)
  let record: RecordState | undefined
  try { record = await deps.read(key) } catch { return bad(503, 'Research storage unavailable.') }
  if (!record || record.buyerAgentId !== i.buyerAgentId || !validResult(record) || `pdar_${record.resultHash}` !== i.reportId || !record.result?.ok) return bad(409, 'Research report does not match this task and buyer.')
  const report = record.result.data
  if (!report.screeningMandate) return bad(409, 'Research-only reports cannot prepare orders. A separately authorized capped trade review is required.')
  const expiry = Date.parse(report.validUntil)
  if (!Number.isFinite(expiry) || expiry <= deps.now()) return bad(409, 'Research report expired. Review fresh evidence before preparation.')
  if (report.agentHandoff.market.side !== 'BUY' || !report.selected.market.url) return bad(409, 'Independent preparation supports an exact BUY market only.')
  if (Number(i.maxSpendUsdc) > report.screeningMandate.maximumSpendUsdc || Number(i.maximumPrice) > report.screeningMandate.maximumPrice || Number(i.maximumPrice) >= 1) return bad(409, 'Preparation must not widen the reviewed spend or price limits.')
  const ownerAddress = getAddress(i.ownerAddress)
  const binding = hash(canonical({ jobId: i.jobId.toLowerCase(), buyerAgentId: i.buyerAgentId, reportId: i.reportId, ownerAddress, maxSpendUsdc: i.maxSpendUsdc, maximumPrice: i.maximumPrice }))
  try {
    const locked = await deps.mutate(key, current => {
      if (!current || current.binding !== record!.binding || current.buyerAgentId !== i.buyerAgentId || current.resultHash !== record!.resultHash || !validResult(current)) throw new Error('Research changed')
      return current.preparationBinding ? current : { ...current, preparationBinding: binding }
    })
    if (locked.preparationBinding !== binding) return bad(409, 'This task is already bound to a different owner or execution choice.')
  } catch { return bad(503, 'Preparation binding could not be persisted.') }
  // The existing owner authorization message signs externalOrderId. Keep the
  // same ID on refresh; changed inputs cannot create another order for this task.
  const externalOrderId = `a2a_${binding}`
  const result = await deps.prepare({ acknowledgeIndependentDecision: true, externalOrderId, ownerAddress,
    marketUrl: report.selected.market.url, marketSlug: report.selected.market.marketSlug,
    tokenId: report.selected.outcome.tokenId, outcome: report.selected.outcome.label,
    side: 'BUY', maxSpendUsdc: i.maxSpendUsdc, maximumPrice: i.maximumPrice, orderType: 'FOK',
  })
  if (!result.ok) return result
  if (expiry <= deps.now() || result.data.externalOrderId !== externalOrderId || result.data.market.tokenId !== report.selected.outcome.tokenId || result.data.market.conditionId !== report.selected.market.conditionId) return bad(409, 'Prepared market changed or reviewed research expired during preparation.')
  return { ...result, data: { ...result.data,
    taskResearch: { jobId: i.jobId.toLowerCase(), buyerAgentId: i.buyerAgentId, reportId: i.reportId, binding, externalOrderId },
    orderAuthorized: false, orderSubmitted: false,
  } }
}
