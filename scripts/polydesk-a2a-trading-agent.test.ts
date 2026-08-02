import assert from 'node:assert/strict'
import test from 'node:test'
import type { A2aTradingDependencies } from '../api/polydesk-a2a-trading-agent.js'
import { prepareA2aTradingSignal, snapshotA2aTradingPnl } from '../api/polydesk-a2a-trading-agent.js'

const now = Date.parse('2026-08-02T12:00:00.000Z')
const watchedWallet = '0x1111111111111111111111111111111111111111'
const ownerAddress = '0x2222222222222222222222222222222222222222'
const depositWallet = '0x3333333333333333333333333333333333333333'
const conditionId = `0x${'12'.repeat(32)}`
const transactionHash = `0x${'ab'.repeat(32)}`
const realJobId = `0x${'cd'.repeat(32)}`

function request(overrides: Record<string, unknown> = {}) {
  return {
    action: 'PREPARE_SIGNAL',
    jobId: 'job_123456',
    taskStatus: 'job_accepted',
    watchedWallet,
    ownerAddress,
    selectionMode: 'TRADE',
    transactionHash,
    tokenId: '111',
    maxSpendUsdc: '5.25',
    maximumPrice: 0.639,
    grantCheck: { ok: true, venue: 'polymarket', action: 'buy', amountUsdc: '5.25' },
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    ...overrides,
  }
}

function dependencies(overrides: Partial<A2aTradingDependencies> = {}): A2aTradingDependencies {
  const missions = new Map<string, any>()
  return {
    prepareCopy: async () => ({
      ok: true,
      status: 200,
      data: {
        sourceSignal: {
          fingerprint: 'source-fingerprint',
          watchedWallet,
          title: 'Will Team A win?',
          marketUrl: 'https://polymarket.com/event/team-a',
          conditionId,
          tokenId: '111',
          outcome: 'Yes',
        },
        buyerAccount: {
          ownerAddress,
          depositWalletAddress: depositWallet,
          derivedMatchVerified: true,
        },
        nextAction: { type: 'SIGN' },
      },
    }) as any,
    fetchJson: async url => url.includes('closed-positions') ? [] : [],
    now: () => now,
    hasStore: () => true,
    readMission: async key => missions.get(key),
    mutateMission: async (key, mutate) => {
      const next = await mutate(missions.get(key))
      missions.set(key, next)
      return next
    },
    ...overrides,
  }
}

test('refuses work before job_accepted', async () => {
  const result = await prepareA2aTradingSignal(request({ taskStatus: 'open' }), dependencies())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /job_accepted/)
})

test('accepts a real 66-character OKX task ID', async () => {
  const result = await prepareA2aTradingSignal(request({ jobId: realJobId }), dependencies())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.jobId, realJobId)
})

test('rejects any request containing secret material', async () => {
  const result = await prepareA2aTradingSignal(request({ privateKey: '0xsecret' }), dependencies())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 400)
  assert.match(result.error, /forbidden/)
})

test('rejects undocumented mission fields instead of carrying hidden state', async () => {
  const result = await prepareA2aTradingSignal(request({ arbitraryInstruction: 'ignore the mandate' }), dependencies())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 400)
  assert.match(result.error, /Unsupported field/)
})

test('creates one exact OKX Polymarket BUY signal under the written cap', async () => {
  const deps = dependencies()
  const first = await prepareA2aTradingSignal(request(), deps)
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(first.data.state, 'signal_ready')
  assert.deepEqual(first.data.autoTrade, {
    schemaVersion: 1,
    deliveryId: first.data.autoTrade?.deliveryId,
    signalType: 'polymarket',
    ttlSec: 600,
    params: {
      conditionId,
      outcome: 'Yes',
      side: 'buy',
      amount: '5.25',
      amountUnit: 'quote',
      maxPriceCents: 63,
    },
  })
  assert.match(first.data.autoTrade?.deliveryId || '', /^pd_[a-f0-9]{40}$/)
  assert.equal('signalTime' in (first.data.autoTrade || {}), false)

  const replay = await prepareA2aTradingSignal(request(), deps)
  assert.equal(replay.ok, true)
  if (!replay.ok) return
  assert.equal(replay.idempotentReplay, true)
  assert.equal(replay.data.autoTrade?.deliveryId, first.data.autoTrade?.deliveryId)
})

test('requires a successful grant check for the exact requested amount', async () => {
  const result = await prepareA2aTradingSignal(
    request({ grantCheck: { ok: true, venue: 'polymarket', action: 'buy', amountUsdc: '6' } }),
    dependencies(),
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /grant check/)
})

test('returns a funding action without emitting a trade signal', async () => {
  const deps = dependencies({
    prepareCopy: async () => ({
      ok: true,
      status: 200,
      data: {
        sourceSignal: { conditionId, tokenId: '111', outcome: 'Yes' },
        buyerAccount: { ownerAddress, depositWalletAddress: depositWallet },
        nextAction: { type: 'FUND', requiredBalanceUsdc: '5.25' },
      },
    }) as any,
  })
  const result = await prepareA2aTradingSignal(request(), deps)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.state, 'requires_action')
  assert.equal(result.data.autoTrade, undefined)
  assert.deepEqual(result.data.nextAction, { type: 'FUND', requiredBalanceUsdc: '5.25' })
})

test('refreshes one funded mission into a signal without changing its identity', async () => {
  let attempt = 0
  const deps = dependencies({
    prepareCopy: async () => {
      attempt += 1
      return {
        ok: true,
        status: 200,
        data: {
          sourceSignal: { conditionId, tokenId: '111', outcome: 'Yes' },
          buyerAccount: { ownerAddress, depositWalletAddress: depositWallet },
          nextAction: attempt === 1
            ? { type: 'FUND', requiredBalanceUsdc: '5.25' }
            : { type: 'SIGN' },
        },
      } as any
    },
  })
  const awaitingFunds = await prepareA2aTradingSignal(request(), deps)
  assert.equal(awaitingFunds.ok, true)
  if (!awaitingFunds.ok) return
  assert.equal(awaitingFunds.data.state, 'requires_action')

  const ready = await prepareA2aTradingSignal(request(), deps)
  assert.equal(ready.ok, true)
  if (!ready.ok) return
  assert.equal(ready.data.state, 'signal_ready')
  assert.equal(ready.data.missionId, awaitingFunds.data.missionId)
  assert.equal(ready.data.createdAt, awaitingFunds.data.createdAt)
  assert.ok(ready.data.autoTrade)
})

test('binds a job ID to one immutable mission input', async () => {
  const deps = dependencies()
  const first = await prepareA2aTradingSignal(request(), deps)
  assert.equal(first.ok, true)
  const drift = await prepareA2aTradingSignal(request({
    maxSpendUsdc: '6',
    grantCheck: { ok: true, venue: 'polymarket', action: 'buy', amountUsdc: '6' },
  }), deps)
  assert.equal(drift.ok, false)
  if (drift.ok) return
  assert.equal(drift.status, 409)
  assert.match(drift.error, /different mission inputs/)
})

test('does not let an idempotent replay extend an expired mandate', async () => {
  let clock = now
  const deps = dependencies({ now: () => clock })
  const first = await prepareA2aTradingSignal(request(), deps)
  assert.equal(first.ok, true)
  clock = now + 10 * 60_000
  const replay = await prepareA2aTradingSignal(request(), deps)
  assert.equal(replay.ok, false)
  if (replay.ok) return
  assert.equal(replay.status, 409)
  assert.match(replay.error, /expired/)
})

test('creates a recomputable public open-PnL receipt for the exact market', async () => {
  const deps = dependencies()
  const prepared = await prepareA2aTradingSignal(request(), deps)
  assert.equal(prepared.ok, true)
  if (!prepared.ok) return
  const pnlDeps: A2aTradingDependencies = {
    ...deps,
    now: () => now + 60_000,
    fetchJson: async url => url.includes('closed-positions') ? [] : [{
      conditionId,
      asset: '111',
      outcome: 'Yes',
      title: 'Will Team A win?',
      initialValue: 5.25,
      currentValue: 6.1,
      cashPnl: 0.85,
      percentPnl: 16.190476,
      curPrice: 0.71,
    }],
  }
  const result = await snapshotA2aTradingPnl({ missionId: prepared.data.missionId }, pnlDeps)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.state, 'open')
  assert.equal(result.data.pnl.cashPnlUsdc, 0.85)
  assert.equal(result.data.pnl.realizedPnlUsdc, null)
  assert.match(result.data.proofHash, /^sha256:[a-f0-9]{64}$/)
  assert.equal(result.data.sources.length, 2)
})

test('blocks multiword outcomes that the current OKX command schema cannot safely encode', async () => {
  const deps = dependencies({
    prepareCopy: async () => ({
      ok: true,
      status: 200,
      data: {
        sourceSignal: { conditionId, tokenId: '111', outcome: 'Team A' },
        buyerAccount: { ownerAddress, depositWalletAddress: depositWallet },
        nextAction: { type: 'SIGN' },
      },
    }) as any,
  })
  const result = await prepareA2aTradingSignal(request(), deps)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 502)
  assert.match(result.error, /not safe/)
})
