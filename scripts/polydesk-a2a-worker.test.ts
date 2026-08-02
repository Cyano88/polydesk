import assert from 'node:assert/strict'
import test from 'node:test'
import type { A2aWorkerDependencies, A2aWorkerRequest, A2aWorkerState } from '../api/polydesk-a2a-worker.js'
import { runA2aTradingWorker, validateA2aWorkerRequest, workerInputHash } from '../api/polydesk-a2a-worker.js'

const now = Date.parse('2026-08-02T12:00:00.000Z')
const jobId = `0x${'ab'.repeat(32)}`
const conditionId = `0x${'12'.repeat(32)}`
const transactionHash = `0x${'34'.repeat(32)}`

function request(overrides: Partial<A2aWorkerRequest> = {}): A2aWorkerRequest {
  return {
    schema: 'polydesk-a2a-worker-request-v1',
    agentId: '5427',
    serviceId: '38484',
    jobId,
    taskStatus: 'job_accepted',
    buyerAgentId: '8178',
    watchedWallet: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    selectionMode: 'TRADE',
    transactionHash,
    tokenId: '111',
    maxSpendUsdc: '1',
    maximumPrice: 0.63,
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    ...overrides,
  }
}

function harness(overrides: Partial<A2aWorkerDependencies> = {}) {
  const states = new Map<string, A2aWorkerState>()
  const calls = { grant: 0, prepare: 0, deliver: 0, notify: 0, snapshot: 0 }
  const messages: Record<string, unknown>[] = []
  const deps: A2aWorkerDependencies = {
    now: () => now,
    loadState: async id => states.get(id),
    saveState: async state => { states.set(state.jobId, state) },
    grantCheck: async () => { calls.grant += 1; return { ok: true } },
    prepare: async () => {
      calls.prepare += 1
      return {
        missionId: 'pda2a_1234567890abcdef12345678',
        state: 'signal_ready',
        nextAction: 'DELIVER_AUTOTRADE_SIGNAL',
        autoTrade: {
          schemaVersion: 1,
          deliveryId: 'pd_1234567890abcdef1234567890abcdef12345678',
          signalType: 'polymarket',
          ttlSec: 600,
          params: { conditionId, outcome: 'Yes', side: 'buy', amount: '1', amountUnit: 'quote', maxPriceCents: 63 },
        },
      }
    },
    deliver: async () => { calls.deliver += 1; return { transactionHash: `0x${'56'.repeat(32)}` } },
    notifyBuyer: async (_request, message) => { calls.notify += 1; messages.push(message) },
    snapshot: async () => { calls.snapshot += 1; return { state: 'not_found', proofHash: `sha256:${'78'.repeat(32)}` } },
    receiptUrl: missionId => `https://polydesk.trade/receipt/${missionId}`,
    ...overrides,
  }
  return { deps, states, calls, messages }
}

test('accepts a real 66-character OKX job id and rejects secret fields', () => {
  assert.equal(validateA2aWorkerRequest(request()).jobId, jobId)
  assert.throws(() => validateA2aWorkerRequest({ ...request(), privateKey: 'secret' }), /secret material/)
})

test('refuses the wrong agent, service, or task state', () => {
  assert.throws(() => validateA2aWorkerRequest({ ...request(), agentId: '9239' }), /#5427/)
  assert.throws(() => validateA2aWorkerRequest({ ...request(), serviceId: '33345' }), /#38484/)
  assert.throws(() => validateA2aWorkerRequest({ ...request(), taskStatus: 'created' }), /job_accepted/)
})

test('stops before preparation when the exact buyer grant is denied', async () => {
  const h = harness({ grantCheck: async () => ({ ok: false, reason: 'amount exceeds written cap' }) })
  const result = await runA2aTradingWorker(request(), h.deps)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'grant_denied')
  assert.equal(h.calls.prepare, 0)
  assert.equal(h.calls.deliver, 0)
})

test('notifies a FUND action once and refreshes without duplicate messages', async () => {
  const h = harness({
    prepare: async () => {
      h.calls.prepare += 1
      return {
        missionId: 'pda2a_1234567890abcdef12345678',
        state: 'requires_action',
        nextAction: { type: 'FUND', requiredBalanceUsdc: '1' },
      }
    },
  })
  const first = await runA2aTradingWorker(request(), h.deps)
  const replay = await runA2aTradingWorker(request(), h.deps)
  assert.equal(first.status, 'requires_action')
  assert.equal(replay.status, 'requires_action')
  assert.equal(h.calls.prepare, 2)
  assert.equal(h.calls.notify, 1)
  assert.equal(h.calls.deliver, 0)
  assert.match(String(h.messages[0]?.actionId), /^[a-f0-9]{64}$/)
})

test('supports APPROVE_COLLATERAL as a non-terminal buyer action', async () => {
  const h = harness({
    prepare: async () => ({
      missionId: 'pda2a_1234567890abcdef12345678',
      state: 'requires_action',
      nextAction: { type: 'APPROVE_COLLATERAL', token: 'USDC' },
    }),
  })
  const result = await runA2aTradingWorker(request(), h.deps)
  assert.equal(result.status, 'requires_action')
  assert.equal(h.calls.notify, 1)
  assert.equal(h.calls.deliver, 0)
})

test('persists delivery_started before one delivery and never blindly delivers twice', async () => {
  const h = harness()
  const first = await runA2aTradingWorker(request(), h.deps)
  assert.equal(first.status, 'delivered')
  assert.equal(h.calls.deliver, 1)
  assert.equal(h.states.get(jobId)?.status, 'delivered')

  const replay = await runA2aTradingWorker(request(), h.deps)
  assert.equal(replay.status, 'pnl_pending')
  assert.equal(h.calls.deliver, 1)
  assert.equal(h.calls.snapshot, 1)
})

test('halts for reconciliation after a crash between delivery start and result persistence', async () => {
  const h = harness()
  const req = request()
  h.states.set(jobId, {
    schema: 'polydesk-a2a-worker-state-v1',
    jobId,
    inputHash: workerInputHash(req),
    status: 'delivery_started',
    updatedAt: new Date(now).toISOString(),
    missionId: 'pda2a_1234567890abcdef12345678',
    deliveryId: 'pd_1234567890abcdef1234567890abcdef12345678',
  })
  const result = await runA2aTradingWorker(req, h.deps)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'recovery_required')
  assert.equal(h.calls.deliver, 0)
})

test('publishes one PnL follow-up and makes later replays idempotent', async () => {
  const h = harness({
    snapshot: async () => {
      h.calls.snapshot += 1
      return { state: 'open', proofHash: `sha256:${'78'.repeat(32)}` }
    },
  })
  await runA2aTradingWorker(request(), h.deps)
  const pnl = await runA2aTradingWorker(request(), h.deps)
  const replay = await runA2aTradingWorker(request(), h.deps)
  assert.equal(pnl.status, 'pnl_reported')
  assert.equal(replay.status, 'pnl_reported')
  assert.equal(h.calls.deliver, 1)
  assert.equal(h.calls.notify, 1)
  assert.equal(h.calls.snapshot, 1)
})

test('rejects changed inputs for an existing job id', async () => {
  const h = harness()
  await runA2aTradingWorker(request(), h.deps)
  await assert.rejects(
    runA2aTradingWorker(request({ maximumPrice: 0.62 }), h.deps),
    /WORKER_INPUT_DRIFT/,
  )
})
