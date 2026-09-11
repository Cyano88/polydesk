import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import express from 'express'
import { authenticatePartner, PartnerJobs, PartnerError, jobInput, createPartnerJobsRouter, type Job, type JobStore, type Partner } from '../api/partner-jobs.js'
import { discoverPolymarket } from '../api/polymarket-discover.js'
const secret = 'a'.repeat(64)
const record = { keyId: 'test', tenantId: 'tenant1', applicationId: 'app1', scopes: ['jobs:create', 'jobs:read', 'jobs:resume'], secretHash: createHash('sha256').update(secret).digest('hex'), expiresAt: '2099-01-01T00:00:00Z' }
const config = JSON.stringify([record])
const header = `Bearer pdp_test_${secret}`
const partner = authenticatePartner(header, config)
const input = jobInput({ capability: 'market-discovery', input: { q: 'United' } })
const search = (i: Parameters<typeof discoverPolymarket>[0]) => discoverPolymarket(i, async () => ({ events: [], pagination: { hasMore: false } }))
function store(): JobStore {
  const data = new Map<string, Job>(); let lock = Promise.resolve()
  return { read: async k => structuredClone(data.get(k)), mutate: async (k, fn) => {
    let result!: Job
    const update = lock.then(() => { result = fn(structuredClone(data.get(k))); data.set(k, structuredClone(result)) })
    lock = update.catch(() => undefined); await update; return structuredClone(result)
  } }
}
const code = (expected: string) => (e: unknown) => e instanceof PartnerError && e.code === expected

test('credentials fail closed for expired, revoked, malformed and unknown keys', () => {
  assert.equal(partner.tenantId, 'tenant1')
  for (const h of [undefined, 'Bearer operator-secret', header + 'x', header.replace('test', 'other')]) assert.throws(() => authenticatePartner(h, config), code('AUTH_REQUIRED'))
  for (const extra of [{ revoked: true }, { expiresAt: '2000-01-01T00:00:00Z' }]) assert.throws(() => authenticatePartner(header, JSON.stringify([{ ...record, ...extra }])), code('AUTH_REQUIRED'))
  assert.throws(() => authenticatePartner(header, '[]'), code('PARTNER_ACCESS_NOT_CONFIGURED'))
  assert.throws(() => authenticatePartner(header, JSON.stringify([record, record])), code('PARTNER_ACCESS_NOT_CONFIGURED'))
})

test('concurrent creates bind one key to one input and isolate tenant/application', async () => {
  const jobs = new PartnerJobs(store(), search)
  const rows = await Promise.all(Array.from({ length: 10 }, () => jobs.create(partner, 'same-key-1', input)))
  assert.equal(new Set(rows.map(r => r.id)).size, 1)
  await assert.rejects(jobs.create(partner, 'same-key-1', jobInput({ capability: 'market-discovery', input: { q: 'City' } })), code('IDEMPOTENCY_CONFLICT'))
  for (const other of [{ ...partner, tenantId: 'tenant2' }, { ...partner, applicationId: 'app2' }]) await assert.rejects(jobs.get(other, rows[0].id), code('NOT_FOUND'))
  assert.throws(() => jobInput({ capability: 'trade', input: {} }), code('UNSUPPORTED_CAPABILITY'))
  assert.throws(() => jobInput({ ...input, tenantId: 'tenant2' }), code('INVALID_INPUT'))
})

test('new process instance recovers durable result without another search', async () => {
  const db = store(); let calls = 0
  const jobs = new PartnerJobs(db, async i => { calls++; return search(i) })
  const created = await jobs.create(partner, 'recovery-key', input)
  const completed = await jobs.resume(partner, created.id)
  assert.equal(completed.state, 'COMPLETED')
  const restarted = new PartnerJobs(db, async () => { throw new Error('must not run') })
  assert.deepEqual((await restarted.get(partner, created.id)).result, completed.result)
  assert.equal((await restarted.resume(partner, created.id)).state, 'COMPLETED')
  assert.equal((await restarted.create(partner, 'recovery-key', input)).id, created.id)
  assert.equal(calls, 1)
})

test('lease fences stale worker completion after crash recovery', async () => {
  const db = store(); let now = 100000; let release!: () => void
  const waiting = new Promise<void>(r => { release = r })
  let started!: () => void; const begun = new Promise<void>(r => { started = r })
  const old = new PartnerJobs(db, async i => { started(); await waiting; return search(i) }, () => now)
  const created = await old.create(partner, 'lease-test-key', input)
  const pending = old.resume(partner, created.id); await begun
  const next = new PartnerJobs(db, search, () => now)
  assert.equal((await next.resume(partner, created.id)).attempts, 1)
  now += 60001
  const recovered = await next.resume(partner, created.id)
  assert.equal(recovered.attempts, 2)
  release(); const late = await pending
  assert.deepEqual(late, recovered)
})

test('upstream failures persist, bound retries and never become payment attempts', async () => {
  const jobs = new PartnerJobs(store(), async () => { throw new Error('secret') })
  const job = await jobs.create(partner, 'failed-job-key', input)
  for (let i = 0; i < 3; i++) assert.equal((await jobs.resume(partner, job.id)).state, 'FAILED')
  await assert.rejects(jobs.resume(partner, job.id), code('RETRY_LIMIT_REACHED'))
  assert.doesNotMatch(JSON.stringify(await jobs.get(partner, job.id)), /secret/)
})

test('HTTP scopes, private results and recovery body restrictions', async () => {
  const app = express(); app.use(express.json())
  app.use('/jobs', createPartnerJobsRouter({ jobs: new PartnerJobs(store(), search), ready: () => true,
    authenticate: h => h === 'read' ? { ...partner, scopes: ['jobs:read'] } : h === 'other' ? { ...partner, applicationId: 'other' } : authenticatePartner(h, config) }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/jobs`
  const create = (auth: string) => fetch(base, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json', 'Idempotency-Key': 'http-test-key' }, body: JSON.stringify(input) })
  try {
    assert.equal((await create('read')).status, 403)
    assert.equal((await create('invalid')).status, 401)
    const response = await create(header); assert.equal(response.status, 200)
    const job = await response.json()
    assert.equal(job.payment.required, false)
    assert.equal(job.signingAuthorized, false)
    assert.equal((await fetch(base + '/' + job.jobId, { headers: { Authorization: 'other' } })).status, 404)
    assert.equal((await fetch(base + '/' + job.jobId, { headers: { Authorization: 'read' } })).status, 200)
    assert.equal((await fetch(base + '/' + job.jobId + '/resume', { method: 'POST', headers: { Authorization: header, 'Content-Type': 'application/json' }, body: '{"trade":true}' })).status, 400)
    assert.equal((await create(header)).status, 200)
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())) }
})


test('lost completion write leaves recoverable lease without inventing success', async () => {
  const db = store(); let mutations = 0; let now = 100000
  const flaky: JobStore = { read: db.read, mutate: (key, fn) => { mutations++; if (mutations === 3) throw new Error('commit unavailable'); return db.mutate(key, fn) } }
  const first = new PartnerJobs(flaky, search, () => now)
  const created = await first.create(partner, 'commit-failure-key', input)
  await assert.rejects(first.resume(partner, created.id))
  assert.equal((await first.get(partner, created.id)).state, 'RUNNING')
  now += 60001
  const recovered = await new PartnerJobs(db, search, () => now).resume(partner, created.id)
  assert.equal(recovered.state, 'COMPLETED')
  assert.equal(recovered.attempts, 2)
})
