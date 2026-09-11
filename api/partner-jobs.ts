import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'
import { discoverPolymarket } from './polymarket-discover.js'

type Scope = 'jobs:read' | 'jobs:create' | 'jobs:resume'
export type Partner = { keyId: string; tenantId: string; applicationId: string; scopes: Scope[] }
type KeyRecord = Partner & { secretHash: string; expiresAt: string; revoked?: boolean }
export class PartnerError extends Error { constructor(readonly status: number, readonly code: string) { super(code) } }
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
export function authenticatePartner(header: string | undefined, config = process.env.POLYDESK_PARTNER_KEYS_JSON, now = Date.now()): Partner {
  if (!config) throw new PartnerError(503, 'PARTNER_ACCESS_NOT_CONFIGURED')
  let keys: KeyRecord[]
  try {
    keys = JSON.parse(config)
    if (!Array.isArray(keys) || !keys.length || keys.length > 1000) throw new Error()
    const ids = new Set<string>()
    for (const key of keys) {
      if (!key || !/^[a-zA-Z0-9-]{1,64}$/.test(key.keyId) || ids.has(key.keyId)
        || !/^[a-zA-Z0-9_-]{1,100}$/.test(key.tenantId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(key.applicationId)
        || !/^[a-f0-9]{64}$/.test(key.secretHash) || !Number.isFinite(Date.parse(key.expiresAt))
        || (key.revoked !== undefined && typeof key.revoked !== 'boolean')
        || !Array.isArray(key.scopes) || !key.scopes.length || key.scopes.some(s => !['jobs:read', 'jobs:create', 'jobs:resume'].includes(s))) throw new Error()
      ids.add(key.keyId)
    }
  } catch { throw new PartnerError(503, 'PARTNER_ACCESS_NOT_CONFIGURED') }
  const match = /^Bearer pdp_([a-zA-Z0-9-]{1,64})_([a-f0-9]{64})$/.exec(header || '')
  const key = keys.find(k => k.keyId === match?.[1])
  const candidate = digest(match?.[2] || '')
  const valid = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(key?.secretHash || '0'.repeat(64), 'hex'))
  if (!match || !key || !valid || key.revoked || Date.parse(key.expiresAt) <= now) throw new PartnerError(401, 'AUTH_REQUIRED')
  return { keyId: key.keyId, tenantId: key.tenantId, applicationId: key.applicationId, scopes: key.scopes }
}

type Input = { capability: 'market-discovery'; input: { q: string; intent: string } }
export function jobInput(body: unknown): Input {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PartnerError(400, 'INVALID_INPUT')
  const b = body as Record<string, unknown>
  if (Object.keys(b).some(k => !['capability', 'input'].includes(k))) throw new PartnerError(400, 'INVALID_INPUT')
  if (b.capability !== 'market-discovery') throw new PartnerError(400, 'UNSUPPORTED_CAPABILITY')
  const i = b.input as Record<string, unknown>
  if (!i || typeof i !== 'object' || Array.isArray(i) || Object.keys(i).some(k => !['q', 'intent'].includes(k))
    || typeof i.q !== 'string' || !i.q.trim() || i.q.length > 200 || (i.intent !== undefined && (typeof i.intent !== 'string' || i.intent.length > 500))) throw new PartnerError(400, 'INVALID_INPUT')
  return { capability: 'market-discovery', input: { q: i.q.trim(), intent: typeof i.intent === 'string' ? i.intent.trim() : i.q.trim() } }
}
export type Job = { id: string; tenantId: string; applicationId: string; binding: string; request: Input; state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'; createdAt: string; updatedAt: string; attempts: number; leaseToken?: string; leaseUntil?: number; result?: unknown; error?: string }
export interface JobStore { read(key: string): Promise<Job | undefined>; mutate(key: string, fn: (current: Job | undefined) => Job): Promise<Job> }
const defaultStore: JobStore = { read: readDurableJson, mutate: mutateDurableJson }
const storageKey = (p: Partner, id: string) => `polydesk:partner-job:${digest(JSON.stringify([p.tenantId, p.applicationId]))}:${id}`
export class PartnerJobs {
  constructor(private store: JobStore = defaultStore, private search = discoverPolymarket, private now = () => Date.now()) {}
  async create(p: Partner, key: string, request: Input) {
    if (!/^[a-zA-Z0-9_.:-]{8,128}$/.test(key)) throw new PartnerError(400, 'IDEMPOTENCY_KEY_REQUIRED')
    const id = 'pdj_' + digest(JSON.stringify([p.tenantId, p.applicationId, 'create-job-v1', key]))
    const binding = digest(JSON.stringify(request))
    return this.store.mutate(storageKey(p, id), current => {
      if (current) {
        if (current.tenantId !== p.tenantId || current.applicationId !== p.applicationId || current.binding !== binding) throw new PartnerError(409, 'IDEMPOTENCY_CONFLICT')
        return current
      }
      const at = new Date(this.now()).toISOString()
      return { id, tenantId: p.tenantId, applicationId: p.applicationId, binding, request, state: 'QUEUED', createdAt: at, updatedAt: at, attempts: 0 }
    })
  }
  async get(p: Partner, id: string) {
    if (!/^pdj_[a-f0-9]{64}$/.test(id)) throw new PartnerError(404, 'NOT_FOUND')
    const job = await this.store.read(storageKey(p, id))
    if (!job || job.id !== id || job.tenantId !== p.tenantId || job.applicationId !== p.applicationId) throw new PartnerError(404, 'NOT_FOUND')
    return job
  }
  async resume(p: Partner, id: string) {
    await this.get(p, id)
    const token = randomUUID()
    const job = await this.store.mutate(storageKey(p, id), current => {
      if (!current || current.tenantId !== p.tenantId || current.applicationId !== p.applicationId) throw new PartnerError(404, 'NOT_FOUND')
      if (current.state === 'COMPLETED' || (current.state === 'RUNNING' && (current.leaseUntil || 0) > this.now())) return current
      if (current.attempts >= 3) throw new PartnerError(409, 'RETRY_LIMIT_REACHED')
      return { ...current, state: 'RUNNING', attempts: current.attempts + 1, leaseToken: token, leaseUntil: this.now() + 60000, updatedAt: new Date(this.now()).toISOString() }
    })
    if (job.leaseToken !== token) return job
    // Only repeatable, free public reads are permitted. Never add paid or financial effects here.
    let result: Awaited<ReturnType<typeof discoverPolymarket>> | undefined
    try { result = await this.search(job.request.input) } catch { /* Persist a sanitized failure below. */ }
    return this.store.mutate(storageKey(p, id), current => {
      if (!current) throw new PartnerError(503, 'STORAGE_UNAVAILABLE')
      if (current.leaseToken !== token) return current // Fencing prevents a stale worker replacing newer evidence.
      return { ...current, state: result?.status === 200 ? 'COMPLETED' : 'FAILED', result: result?.status === 200 ? result.body : undefined,
        error: result?.status === 200 ? undefined : 'UPSTREAM_UNAVAILABLE', leaseToken: undefined, leaseUntil: undefined, updatedAt: new Date(this.now()).toISOString() }
    })
  }
}
export function jobView(job: Job) {
  return { jobId: job.id, status: job.state, createdAt: job.createdAt, updatedAt: job.updatedAt, attempts: job.attempts,
    capability: job.request.capability, result: job.result ?? null, error: job.error ?? null,
    payment: { required: false, status: 'NOT_APPLICABLE' }, signingAuthorized: false, orderSubmitted: false,
    links: { status: `/api/v1/jobs/${job.id}`, resume: `/api/v1/jobs/${job.id}/resume` },
    nextActions: job.state === 'COMPLETED' ? [{ action: 'SHOW_RESULTS', label: 'Show market findings before choosing a market', authorizationRequired: false }]
      : [{ action: job.state === 'RUNNING' ? 'CHECK_STATUS' : job.attempts >= 3 ? 'CONTACT_OPERATOR' : 'RESUME_JOB', label: job.state === 'RUNNING' ? 'Check this job; resume after lease expiry if interrupted' : job.attempts >= 3 ? 'Contact the operator; retry limit reached' : 'Resume this free discovery job', authorizationRequired: false }],
  }
}
export const partnerJobSchema = { type: 'object', required: ['capability', 'input'], additionalProperties: false, properties: { capability: { const: 'market-discovery' }, input: { type: 'object', required: ['q'], additionalProperties: false, properties: { q: { type: 'string', minLength: 1, maxLength: 200 }, intent: { type: 'string', maxLength: 500 } } } } }
export function partnerJobPaths() {
  const responses = { '200': { description: 'Existing or completed job, with result and safe next actions.' }, '202': { description: 'Durably stored job; not proof of completed work.' }, '400': { description: 'Invalid input or unsupported capability.' }, '401': { description: 'Missing, expired or revoked credential.' }, '403': { description: 'Insufficient scope.' }, '404': { description: 'Job unavailable to this application.' }, '409': { description: 'Idempotency conflict or retry limit.' }, '503': { description: 'Authentication configuration or durable storage unavailable; retry with the same key.' } }
  const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^pdj_[a-f0-9]{64}$' } }
  return {
    '/jobs': { post: { operationId: 'createPartnerJob', security: [{ PartnerKey: [] }], description: 'Requires jobs:create and jobs:read. Persists a free discovery job; no financial authority.', parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[a-zA-Z0-9_.:-]+$' } }], requestBody: { required: true, content: { 'application/json': { schema: partnerJobSchema } } }, responses } },
    '/jobs/{id}': { get: { operationId: 'getPartnerJob', security: [{ PartnerKey: [] }], description: 'Requires jobs:read. Reads persisted state; does not restart work.', parameters: [id], responses } },
    '/jobs/{id}/resume': { post: { operationId: 'resumePartnerJob', security: [{ PartnerKey: [] }], description: 'Requires jobs:resume and jobs:read. Resumes free discovery only, with an exclusive 60-second lease and three-attempt limit. Empty body required.', parameters: [id], responses } },
  }
}
export function createPartnerJobsRouter(options: { jobs?: PartnerJobs; authenticate?: typeof authenticatePartner; ready?: () => boolean } = {}) {
  const router = Router()
  const jobs = options.jobs || new PartnerJobs()
  router.use((req, res, next) => {
    try { res.locals.partner = (options.authenticate || authenticatePartner)(req.headers.authorization); next() }
    catch (error) { const e = error instanceof PartnerError ? error : new PartnerError(503, 'SERVICE_UNAVAILABLE'); if (e.status === 401) res.setHeader('WWW-Authenticate', 'Bearer'); res.status(e.status).json({ ok: false, schemaVersion: '1.0.0', requestId: res.locals.requestId, error: { code: e.code, retryable: e.status === 503 }, nextActions: [{ action: 'CHECK_PARTNER_ACCESS', label: 'Check partner provisioning or credentials', authorizationRequired: false }] }) }
  })
  const handle = (scope: Scope, action: (p: Partner, req: import('express').Request) => Promise<Job>) => async (req: import('express').Request, res: import('express').Response) => {
    try {
      const p = res.locals.partner as Partner
      if (!p.scopes.includes(scope) || !p.scopes.includes('jobs:read')) throw new PartnerError(403, 'FORBIDDEN')
      if (!(options.ready || hasRenderDurableStore)()) throw new PartnerError(503, 'STORAGE_UNAVAILABLE')
      if (Object.keys(req.query).length) throw new PartnerError(400, 'INVALID_INPUT')
      const job = await action(p, req)
      res.setHeader('Location', `/api/v1/jobs/${job.id}`)
      if (job.state === 'RUNNING') res.setHeader('Retry-After', '5')
      res.status(job.state === 'RUNNING' || job.state === 'QUEUED' ? 202 : 200).json({ ok: true, schemaVersion: '1.0.0', requestId: res.locals.requestId, ...jobView(job) })
    } catch (error) { const e = error instanceof PartnerError ? error : new PartnerError(503, 'STORAGE_UNAVAILABLE'); res.status(e.status).json({ ok: false, schemaVersion: '1.0.0', requestId: res.locals.requestId, error: { code: e.code, retryable: e.status === 503 }, nextActions: [{ action: e.status === 503 ? 'RETRY_SAME_OPERATION' : 'REVIEW_REQUEST', label: e.status === 503 ? 'Recover using the same job ID or idempotency key' : 'Review credentials, scope and request', authorizationRequired: false }] }) }
  }
  router.post('/', handle('jobs:create', async (p, req) => {
    const job = await jobs.create(p, req.get('Idempotency-Key') || '', jobInput(req.body))
    return job.state === 'QUEUED' ? jobs.resume(p, job.id) : job
  }))
  router.get('/:id', handle('jobs:read', (p, req) => jobs.get(p, req.params.id)))
  router.post('/:id/resume', handle('jobs:resume', (p, req) => {
    if (req.body !== undefined && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) throw new PartnerError(400, 'INVALID_INPUT')
    return jobs.resume(p, req.params.id)
  }))
  return router
}
