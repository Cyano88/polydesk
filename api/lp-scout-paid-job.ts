import { createHash, randomUUID } from 'node:crypto'
import { mutateDurableJson } from './render-durable-store.js'

type Reply = { status: number; headers: Record<string, string>; body: unknown }
type Settlement = { payment: Record<string, unknown>; headers: Record<string, string> }
export type LpPaidJob = {
  id: string; requestHash: string; state: 'SETTLING' | 'PAID' | 'RUNNING' | 'DELIVERED' | 'REVIEW_REQUIRED'
  owner: string; createdAt: string; updatedAt: string; settlement?: Settlement; reply?: Reply
}
type Mutate = (key: string, fn: (row: LpPaidJob | undefined) => LpPaidJob) => Promise<LpPaidJob>
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export function stableLpRequest(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableLpRequest).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+stableLpRequest(v)).join(',') + '}'
  return JSON.stringify(value) ?? 'null'
}
export class LpPaidJobError extends Error {
  constructor(public status: number, public code: string, public jobId?: string) { super(code) }
}
// Store no reusable payment signature. Possession of the identical payment header
// is the replay capability; its digest is bound to the complete business request.
export async function runLpPaidJob(input: {
  paymentHeader: string; request: unknown
  settle: () => Promise<Settlement>
  deliver: (settlement: Settlement) => Promise<Reply>
}, mutate: Mutate = (key, fn) => mutateDurableJson<LpPaidJob>(key, fn)): Promise<Reply> {
  const id = 'lps_' + digest(input.paymentHeader)
  const key = 'polydesk:lp-paid-job:' + id
  const requestHash = digest(stableLpRequest(input.request))
  const owner = randomUUID()
  const now = () => new Date().toISOString()
  let row = await mutate(key, current => {
    if (current) {
      if (current.requestHash !== requestHash) throw new LpPaidJobError(409, 'LP_PAYMENT_REQUEST_MISMATCH', id)
      return current
    }
    return { id, requestHash, owner, state: 'SETTLING', createdAt: now(), updatedAt: now() }
  })
  if (row.state === 'DELIVERED' && row.reply) return row.reply
  if (row.state === 'SETTLING' && row.owner === owner) {
    // An uncertain settlement is never retried automatically. The durable intent
    // survives a process loss so operators can reconcile instead of charging again.
    let settlement: Settlement
    try { settlement = await input.settle() }
    catch (error) { throw new LpPaidJobError(error instanceof LpPaidJobError ? error.status : 503, error instanceof LpPaidJobError ? error.code : 'LP_SETTLEMENT_RECONCILIATION_REQUIRED', id) }
    row = await mutate(key, current => {
      if (!current || current.owner !== owner || current.state !== 'SETTLING') throw new LpPaidJobError(409, 'LP_JOB_CONFLICT', id)
      return { ...current, settlement, state: 'PAID', updatedAt: now() }
    })
  }
  row = await mutate(key, current => {
    if (!current || current.state !== 'PAID') throw new LpPaidJobError(409, 'LP_JOB_REVIEW_OR_IN_PROGRESS', id)
    return { ...current, owner, state: 'RUNNING', updatedAt: now() }
  })
  try {
    if (!row.settlement) throw new Error('LP_SETTLEMENT_MISSING')
    const reply = await input.deliver(row.settlement)
    await mutate(key, current => {
      if (!current || current.owner !== owner || current.state !== 'RUNNING') throw new LpPaidJobError(409, 'LP_JOB_CONFLICT', id)
      return { ...current, state: 'DELIVERED', reply, updatedAt: now() }
    })
    return reply
  } catch {
    await mutate(key, current => {
      if (!current || current.owner !== owner) throw new LpPaidJobError(409, 'LP_JOB_CONFLICT', id)
      return current.state === 'DELIVERED' ? current : { ...current, state: 'REVIEW_REQUIRED', updatedAt: now() }
    })
    throw new LpPaidJobError(503, 'LP_PAID_DELIVERY_REVIEW_REQUIRED', id)
  }
}
