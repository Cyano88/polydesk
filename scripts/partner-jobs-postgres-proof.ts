import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { PartnerJobs, jobInput, type Partner } from '../api/partner-jobs.js'
import { discoverPolymarket } from '../api/polymarket-discover.js'
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) throw new Error('A test database connection is required')
const run = process.argv[2] || randomUUID()
const partner: Partner = { keyId: 'proof', tenantId: 'operator_test', applicationId: run, scopes: ['jobs:read', 'jobs:create', 'jobs:resume'] }
const jobs = new PartnerJobs(undefined, input => discoverPolymarket(input, async () => ({ events: [], pagination: { hasMore: false } })))
const request = jobInput({ capability: 'market-discovery', input: { q: 'synthetic storage verification' } })
try {
 const job = await jobs.create(partner, 'restart-proof-key', request)
 if (process.argv[3] === 'read') {
   assert.equal(job.state, 'COMPLETED')
   assert.equal((await jobs.get(partner, job.id)).attempts, 1)
   console.log(JSON.stringify({ ok: true, proof: 'fresh-process-postgres-recovery', evidenceClass: 'operator_test', jobId: job.id }))
 } else {
   assert.equal((await jobs.resume(partner, job.id)).state, 'COMPLETED')
   const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/partner-jobs-postgres-proof.ts', run, 'read'], { encoding: 'utf8', timeout: 30000 })
   assert.equal(child.status, 0, 'Fresh process recovery failed')
   console.log(child.stdout.trim())
 }
 process.exit(0)
} catch { console.error('Postgres recovery proof failed; inspect database connectivity without printing credentials.'); process.exit(1) }
