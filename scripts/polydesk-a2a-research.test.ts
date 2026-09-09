import assert from 'node:assert/strict'
import test from 'node:test'
import { researchA2aTask, prepareA2aResearchedTask, a2aResearchResultHash, type A2aResearchDependencies } from '../api/polydesk-a2a-research.js'
import { createA2aTradingHandler } from '../api/polydesk-a2a-trading-agent.js'
import { runResearchOperator } from '../api/polydesk-a2a-research-operator.js'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const request = () => ({ action: 'RESEARCH', agentId: '5427', serviceId: '38484', jobId: `0x${'a'.repeat(64)}`, buyerAgentId: '8178', taskStatus: 'job_accepted', research: { marketId: 'exact-market', outcome: 'Yes', side: 'BUY', mandate: { maximumSpendUsdc: 5, maximumPrice: 0.8 } } })
function fixture() {
  let state: Parameters<Parameters<A2aResearchDependencies['mutate']>[1]>[0]
  let calls = 0
  const deps: A2aResearchDependencies = {
    hasStore: () => true,
    mutate: async (_key, change) => { state = change(state); return state },
    research: async () => { calls++; return { ok: false, status: 502, error: 'Fixture research failure' } },
  }
  return { deps, calls: () => calls }
}

test('research is bound to one buyer and immutable task inputs, without repeating failed calls', async () => {
  const f = fixture()
  const first = await researchA2aTask(request(), f.deps)
  assert.deepEqual(await researchA2aTask(request(), f.deps), first)
  assert.equal(f.calls(), 1)
  for (const changed of [{ ...request(), buyerAgentId: '9000' }, { ...request(), research: { ...request().research, outcome: 'No' } }]) {
    const result = await researchA2aTask(changed, f.deps)
    assert.equal(result.status, 409)
  }
  assert.equal(f.calls(), 1)
})

test('wrong services, unaccepted tasks, missing limits and nested secrets never reach storage or AI', async () => {
  const f = fixture()
  f.deps.mutate = async () => { assert.fail('must not store invalid input') }
  for (const raw of [{ ...request(), serviceId: '38496' }, { ...request(), serviceId: '40363' }, { ...request(), taskStatus: 'created' }, { ...request(), research: { ...request().research, mandate: {} } }, { ...request(), research: { ...request().research, mandate: { privateKey: 'fixture' } } }]) {
    assert.equal((await researchA2aTask(raw, f.deps)).ok, false)
  }
  assert.equal(f.calls(), 0)
})

test('durable lease prevents concurrent AI calls and retries after uncertain result persistence', async () => {
  const f = fixture()
  let release!: () => void
  f.deps.research = async () => { await new Promise<void>(resolve => { release = resolve }); return { ok: false, status: 502, error: 'Fixture' } }
  const first = researchA2aTask(request(), f.deps)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await researchA2aTask(request(), f.deps)).status, 409)
  release()
  await first
  const broken = fixture()
  const mutate = broken.deps.mutate
  let writes = 0
  broken.deps.mutate = async (key, change) => { if (++writes === 2) throw new Error('storage failure'); return mutate(key, change) }
  assert.equal((await researchA2aTask(request(), broken.deps)).status, 503)
  assert.equal((await researchA2aTask(request(), broken.deps)).status, 409)
  assert.equal(broken.calls(), 1)
})

test('missing durable storage fails before AI', async () => {
  const f = fixture(); f.deps.hasStore = () => false
  assert.equal((await researchA2aTask(request(), f.deps)).status, 503)
  assert.equal(f.calls(), 0)
})

test('saved successful research replays without AI and is scoped to the original buyer', async () => {
  const f = fixture()
  let calls = 0
  // The shared-engine tests validate report contents; this fixture exercises
  // storage and response correlation independently of provider behavior.
  f.deps.research = async () => {
    calls++
    return { ok: true, status: 200, data: { schema: 'fixture', researchStatus: 'AVAILABLE', orderAuthorized: false } } as any
  }
  const first = await researchA2aTask(request(), f.deps)
  const replay = await researchA2aTask(request(), f.deps)
  assert.equal(first.ok, true)
  assert.equal(replay.ok, true)
  if (!first.ok || !replay.ok) return
  assert.equal(first.data.idempotentReplay, false)
  assert.equal(replay.data.idempotentReplay, true)
  assert.equal(replay.data.buyerAgentId, '8178')
  assert.equal(replay.data.orderAuthorized, false)
  assert.equal(calls, 1)
  assert.equal((await researchA2aTask({ ...request(), buyerAgentId: '9000' }, f.deps)).status, 409)
})

test('private RESEARCH route rejects unauthenticated callers', async () => {
  let status = 0
  const res = { status(code: number) { status = code; return this }, json(value: unknown) { return value } }
  await createA2aTradingHandler()({ method: 'POST', headers: {}, body: request() } as any, res as any)
  assert.ok(status === 401 || status === 503)
})

test('operator dry-run needs no key, network, payment or signing', async () => {
  const result = await runResearchOperator(request(), { execute: false, fetch: async () => { assert.fail('network forbidden') } })
  assert.equal(result.dryRun, true)
  assert.equal(result.taskAcceptanceVerified, false)
})

test('operator forwards research once to the trusted route and rejects miscorrelated responses', async () => {
  let calls = 0
  const response = { ok: true, jobId: request().jobId, buyerAgentId: '8178', reportId: 'pdar_' + 'ab'.repeat(32), orderAuthorized: false, orderSubmitted: false }
  const fake: typeof fetch = async (url, init) => {
    calls++
    assert.equal(url, 'https://polydesk.trade/api/a2a/polydesk-trading-agent')
    assert.equal(init?.redirect, 'error')
    assert.deepEqual(JSON.parse(String(init?.body)), request())
    return Response.json(response)
  }
  assert.deepEqual(await runResearchOperator(request(), { execute: true, operatorKey: 'fixture', fetch: fake }), response)
  assert.equal(calls, 1)
  for (const changed of [{ ...response, buyerAgentId: '9000' }, { ...response, orderAuthorized: true }, { ...response, jobId: 'wrong' }]) {
    await assert.rejects(runResearchOperator(request(), { execute: true, operatorKey: 'fixture', fetch: async () => Response.json(changed) }), /invalid/)
  }
})

test('operator refuses unknown origins and does not expose upstream error bodies or retry', async () => {
  for (const url of ['http://polydesk.trade/api/a2a/polydesk-trading-agent', 'https://example.com', 'https://polydesk.trade/api/a2a/polydesk-trading-agent?secret=fixture']) {
    await assert.rejects(runResearchOperator(request(), { execute: true, operatorKey: 'fixture', url, fetch: async () => { assert.fail('network forbidden') } }), /trusted/)
  }
  let calls = 0
  await assert.rejects(runResearchOperator(request(), { execute: true, operatorKey: 'fixture', fetch: async () => { calls++; return new Response('sensitive upstream fixture', { status: 503 }) } }), error => {
    assert.equal(String(error).includes('sensitive upstream fixture'), false)
    return true
  })
  assert.equal(calls, 1)
  await assert.rejects(runResearchOperator(request(), { execute: true, operatorKey: 'fixture', fetch: async () => new Response('x'.repeat(262145)) }), /invalid/)
})

test('existing worker CLI routes research dry-run without copy-trade fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'polydesk-research-cli-'))
  try {
    const path = join(directory, 'request.json')
    writeFileSync(path, JSON.stringify(request()))
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/polydesk-a2a-worker.ts', '--request', path, '--dry-run'], { encoding: 'utf8', timeout: 20000, windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.dryRun, true)
    assert.equal(output.action, 'RESEARCH')
    assert.equal(output.orderSubmitted, false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

function preparationFixture() {
  let now = Date.parse('2026-09-09T10:00:00Z')
  const result: any = { ok: true, status: 200, data: { validUntil: '2026-09-09T10:15:00Z',
    agentHandoff: { market: { side: 'BUY' } }, screeningMandate: { maximumSpendUsdc: 5, maximumPrice: 0.8 },
    selected: { market: { url: 'https://polymarket.com/event/example', marketSlug: 'example', conditionId: '0x' + '12'.repeat(32) }, outcome: { tokenId: '111', label: 'Yes' } },
  } }
  let state: any = { binding: 'fixture', buyerAgentId: '8178', result, resultHash: a2aResearchResultHash(result) }
  let calls = 0
  const input = { action: 'RESEARCH_PREPARE', agentId: '5427', serviceId: '38484', taskStatus: 'job_accepted', jobId: request().jobId, buyerAgentId: '8178', reportId: 'pdar_' + state.resultHash, acknowledgeIndependentDecision: true, ownerAddress: '0x' + '11'.repeat(20), maxSpendUsdc: '5', maximumPrice: '0.8' }
  const deps: any = { now: () => now, read: async () => state,
    mutate: async (_key: string, change: any) => { state = change(state); return state },
    prepare: async (raw: any) => { calls++; return { ok: true, status: 200, data: { externalOrderId: raw.externalOrderId, market: { tokenId: raw.tokenId, conditionId: result.data.selected.market.conditionId }, orderSubmitted: false } } },
  }
  return { input, deps, state: () => state, calls: () => calls, expire: () => { now += 20 * 60000 } }
}

test('reviewed research binds a stable external order ID and refuses changed owner or limits', async () => {
  const f = preparationFixture()
  const first = await prepareA2aResearchedTask(f.input, f.deps)
  const second = await prepareA2aResearchedTask(f.input, f.deps)
  assert.equal(first.ok, true); assert.equal(second.ok, true)
  if (!first.ok || !second.ok) return
  assert.match(first.data.externalOrderId, /^a2a_[a-f0-9]{64}$/)
  assert.equal(first.data.externalOrderId, second.data.externalOrderId)
  assert.equal(first.data.orderAuthorized, false)
  assert.equal((await prepareA2aResearchedTask({ ...f.input, maxSpendUsdc: '4' }, f.deps)).status, 409)
  assert.equal((await prepareA2aResearchedTask({ ...f.input, ownerAddress: '0x' + '22'.repeat(20) }, f.deps)).status, 409)
  assert.equal(f.calls(), 2)
})

test('tampered research, wrong buyer, missing consent, SELL and widened limits cannot prepare', async () => {
  for (const change of [{ buyerAgentId: '9000' }, { acknowledgeIndependentDecision: false }, { maxSpendUsdc: '6' }, { maximumPrice: '0.9' }, { marketUrl: 'https://example.com' }]) {
    const f = preparationFixture()
    assert.equal((await prepareA2aResearchedTask({ ...f.input, ...change }, f.deps)).ok, false)
    assert.equal(f.calls(), 0)
  }
  const f = preparationFixture(); f.state().result.data.selected.outcome.tokenId = '222'
  assert.equal((await prepareA2aResearchedTask(f.input, f.deps)).status, 409)
  assert.equal(f.calls(), 0)
  const sell = preparationFixture(); sell.state().result.data.agentHandoff.market.side = 'SELL'
  sell.state().resultHash = a2aResearchResultHash(sell.state().result); sell.input.reportId = 'pdar_' + sell.state().resultHash
  assert.equal((await prepareA2aResearchedTask(sell.input, sell.deps)).status, 409)
  assert.equal(sell.calls(), 0)
})

test('research expiry is checked before and after asynchronous preparation', async () => {
  const f = preparationFixture(); f.expire()
  assert.equal((await prepareA2aResearchedTask(f.input, f.deps)).status, 409)
  assert.equal(f.calls(), 0)
  const slow = preparationFixture(); const prepare = slow.deps.prepare
  slow.deps.prepare = async (raw: any) => { const result = await prepare(raw); slow.expire(); return result }
  assert.equal((await prepareA2aResearchedTask(slow.input, slow.deps)).status, 409)
})
