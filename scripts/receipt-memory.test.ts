import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

test('startup pin matches the LF bridge bytes deployed by Git', () => {
  const source = readFileSync(new URL('./start-with-receipt-memory.ts', import.meta.url), 'utf8')
  const bridge = readFileSync(new URL('./sibyl-receipt-memory.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const pin = source.match(/SIBYL_MEMORY_BRIDGE_SHA256 = '([a-f0-9]{64})'/)?.[1]
  assert.equal(pin, createHash('sha256').update(bridge).digest('hex'))
})
import { Wallet } from 'ethers'
import { enqueueReceiptMemory, memoryEnvelope, runMemoryDeliveryOnce } from '../api/receipt-memory-outbox.js'
import { createReceiptMemoryRecallHandler, memoryRecallAuthorization, receiptMemoryDescriptor } from '../api/receipt-memory-api.js'

test('shared catalog and flow expose the same non-authorizing Postgres and Sibyl contract', async () => {
  const { default: catalog } = await import('../api/a2mcp-services.js')
  const { flowDescriptor } = await import('../api/polymarket-agent-flow.js')
  let body: any
  catalog({} as any, { setHeader() {}, json(value: any) { body = value } } as any)
  const expected = receiptMemoryDescriptor(body.baseUrl)
  assert.deepEqual(body.integration.receiptMemory, expected)
  const flow = flowDescriptor({ protocol: 'https', headers: { host: 'polydesk.trade' } } as any)
  assert.equal(new URL(flow.receiptMemory.sibyl.endpoint).pathname, '/api/polymarket-agent-memory/recall-sibyl')
  assert.deepEqual(flow.receiptMemory.authorization, expected.authorization)
  assert.equal(expected.historyComplete, false)
  assert.equal(expected.signingAuthorized, false)
  assert.equal(expected.orderSubmitted, false)
  assert.match(expected.failureRule, /never retrade/)
  const expiresAt = Date.now() + 60000
  for (const sibyl of [true, false]) {
    const auth = memoryRecallAuthorization({ owner: '0x' + 'a'.repeat(40), expiresAt }, Date.now(), sibyl)
    const lines = auth.message.split(expected.authorization.separator)
    assert.equal(lines[1], expected.authorization.domain)
    assert.equal(lines[2], 'POST ' + new URL(sibyl ? expected.sibyl.endpoint : expected.postgres.endpoint).pathname)
    assert.equal(lines[5], expected.authorization.afterDefault)
    assert.equal(Number(lines[6]), expected.authorization.limitDefault)
  }
})

const wallet = new Wallet('0x' + '42'.repeat(32)) // synthetic test key only
const owner = wallet.address.toLowerCase()
function receipt() {
  return { receiptVersion: 'polydesk-governed-trade-receipt-v1', executionId: 'pex_'+'aa'.repeat(12),
    status: 'VERIFIED_FILLED', verifiedAt: '2026-09-08T00:00:00Z', market: { tokenId: '123', title: 'UNTRUSTED_TITLE' },
    execution: { orderId: '0x'+'aa'.repeat(32), transactionHash: '0x'+'bb'.repeat(32), fillSize: 5, fillPrice: 0.5, fillAmountUsdc: 2.5 },
    finality: { chainId: 'eip155:137', blockHash: '0x'+'cc'.repeat(32), finalizedBlockHash: '0x'+'dd'.repeat(32) },
    policy: { decision: 'APPROVE', researchPolicy: 'agent-independent-v1' },
    proofs: Object.fromEntries(['polygonReceiptVerified','polygonFinalityVerified','allowedExchangeVerified',
      'orderIdInReceipt','publicTradeMatched','buyerAuthoritySignatureVerified','exactSignedOrderVerified'].map(k=>[k,true])) }
}
test('only verified receipts produce sanitized stable memory envelopes', () => {
  const input = receipt()
  const event = memoryEnvelope(owner, input)
  assert.equal(event.payload.includes('UNTRUSTED_TITLE'), false)
  assert.equal(event.payload.includes('researchDecisionId'), false)
  assert.deepEqual(memoryEnvelope(owner, structuredClone(input)), event)
  for (const proof of Object.keys(input.proofs)) {
    const changed = structuredClone(input); changed.proofs[proof] = false
    assert.throws(() => memoryEnvelope(owner, changed))
  }
  const changed = receipt(); changed.execution.fillSize = NaN
  assert.throws(() => memoryEnvelope(owner, changed))
})

test('verified memory preserves only bounded signed A2A order correlation', () => {
  const input = { ...receipt(), externalOrderId: 'a2a_' + 'ab'.repeat(32) }
  assert.equal(JSON.parse(memoryEnvelope(owner, input).payload).externalOrderId, input.externalOrderId)
  assert.equal(JSON.parse(memoryEnvelope(owner, { ...input, externalOrderId: 'untrusted prose' }).payload).externalOrderId, undefined)
  assert.throws(() => memoryEnvelope(owner, { ...input, status: 'PREPARED' }))
})
test('research-bound memory requires exact IDs and never fabricates approval', () => {
  const input: any = receipt(); input.policy.researchPolicy = 'zeroscout-approved-v1'
  assert.throws(() => memoryEnvelope(owner, input))
  input.policy.researchDecisionId = 'pstd_'+'a'.repeat(32); input.policy.researchAnalysisHash = 'b'.repeat(64)
  assert.equal(JSON.parse(memoryEnvelope(owner,input).payload).researchDecisionId, input.policy.researchDecisionId)
})
test('enqueue preserves existing delivery state and rejects conflicts before index write', async () => {
  const queries: string[] = []
  await enqueueReceiptMemory({ query: async (sql: string) => { queries.push(sql); return { rowCount: 1 } } } as any, owner, receipt())
  assert.equal(queries.length,2)
  assert.match(queries[0], /payload_hash=excluded.payload_hash/)
  assert.doesNotMatch(queries[0], /set state=/)
  let calls = 0
  await assert.rejects(enqueueReceiptMemory({ query: async () => { calls++; return { rowCount: 0 } } } as any, owner, receipt()))
  assert.equal(calls,1)
})
test('worker lease guards success and retries memory failure without trade calls', async () => {
  for (const fail of [false,true]) {
    const calls: { sql: string; args: any[] }[] = []
    let deliveries = 0
    const event = memoryEnvelope(owner,receipt())
    const query: any = async (sql: string,args: any[]) => {
      calls.push({sql,args})
      return { rows: calls.length === 1 ? [{ execution_id: event.executionId, owner, payload: event.payload,
        payload_hash: event.payloadHash, lease_token: args[0], attempts: 1 }] : [], rowCount: 1 }
    }
    assert.equal(await runMemoryDeliveryOnce(async () => { deliveries++; if(fail) throw Error('unavailable') },query),true)
    assert.equal(deliveries,1); assert.equal(calls.length,2)
    assert.match(calls[0].sql,/skip locked/)
    assert.match(calls[1].sql,/lease_token=\$2/)
    assert.equal(calls[1].args[1],calls[0].args[0])
    assert.match(calls[1].sql, fail ? /SIBYL_DELIVERY_UNAVAILABLE/ : /state='delivered'/)
  }
})
test('expired exhausted lease stops delivery and an empty queue does nothing', async () => {
  let calls = 0
  await runMemoryDeliveryOnce(async()=>{ throw Error('must not deliver') }, (async()=>({ rows: ++calls===1 ? [{execution_id:'x',attempts:9}]:[] })) as any)
  assert.equal(calls,2)
  assert.equal(await runMemoryDeliveryOnce(async()=>{throw Error('must not deliver')}, (async()=>({rows:[]})) as any),false)
})
function response() {
  return { code: 0, body: null as any, setHeader(){}, status(code:number){this.code=code;return this},json(body:any){this.body=body;return this} }
}

test('Sibyl recall uses a distinct signature and returns only live-read matching entities', async () => {
  const event = memoryEnvelope(owner, receipt())
  const row = {execution_id:event.executionId, payload:event.payload, payload_hash:event.payloadHash, state:'delivered'}
  const body:any = {owner, expiresAt:Date.now()+60000, limit:20}
  body.signature = await wallet.signMessage(memoryRecallAuthorization(body, Date.now(), true).message)
  let reads = 0
  const query:any = async () => ({rows:[row]})
  const recall = async (actualOwner:string) => { assert.equal(actualOwner,owner); reads++; return [JSON.parse(event.payload)] }
  const res = response()
  await createReceiptMemoryRecallHandler(query,recall)({body} as any,res as any)
  assert.equal(res.code,200); assert.equal(reads,1)
  assert.equal(res.body.source,'SIBYL_VERIFIED_RECEIPTS')
  assert.equal(res.body.records[0].memoryStatus,'RECALLED_VERIFIED')
  assert.equal(res.body.signingAuthorized,false)
  const wrongRoute = response()
  await createReceiptMemoryRecallHandler(query)({body} as any,wrongRoute as any)
  assert.equal(wrongRoute.code,401)
  body.signature = await wallet.signMessage(memoryRecallAuthorization(body).message)
  const oldSignature = response()
  await createReceiptMemoryRecallHandler(query,recall)({body} as any,oldSignature as any)
  assert.equal(oldSignature.code,401); assert.equal(reads,1)
})

test('missing, corrupt or unsynchronized Sibyl memory never falls back to Postgres history', async () => {
  const event = memoryEnvelope(owner, receipt())
  const body:any = {owner,expiresAt:Date.now()+60000,limit:20}
  body.signature = await wallet.signMessage(memoryRecallAuthorization(body, Date.now(), true).message)
  for (const state of ['pending','failed','delivered']) {
    let reads = 0
    const res = response()
    await createReceiptMemoryRecallHandler((async()=>({rows:[{execution_id:event.executionId,
      payload:event.payload,payload_hash:event.payloadHash,state}]})) as any,
      async()=>{reads++;throw Error('Sibyl missing')})({body} as any,res as any)
    assert.equal(res.code,503); assert.equal(res.body.records,undefined)
    assert.equal(reads,state==='delivered'?1:0)
  }
  for (const records of [[],[{...JSON.parse(event.payload),owner:'0x'+'11'.repeat(20)}]]) {
    const res=response()
    await createReceiptMemoryRecallHandler((async()=>({rows:[{execution_id:event.executionId,
      payload:event.payload,payload_hash:event.payloadHash,state:'delivered'}]})) as any,
      async()=>records)({body} as any,res as any)
    assert.equal(res.code,503)
  }
})
test('recall signature binds owner, route, pagination and expiry before database access', async () => {
  const body: any = {owner,expiresAt:Date.now()+60000,limit:20}
  body.signature = await wallet.signMessage(memoryRecallAuthorization(body).message)
  for(const altered of [{...body,owner:'0x'+'11'.repeat(20)},{...body,limit:21},{...body,expiresAt:0}]) {
    const res=response()
    await createReceiptMemoryRecallHandler((async()=>{throw Error('must not query')}) as any)({body:altered} as any,res as any)
    assert.equal(res.code,401)
  }
})
test('authorized recall is owner-scoped, pending-aware, and unavailable never means empty', async () => {
  const event=memoryEnvelope(owner,receipt())
  const body:any={owner,expiresAt:Date.now()+60000,limit:20}
  body.signature=await wallet.signMessage(memoryRecallAuthorization(body).message)
  const res=response()
  await createReceiptMemoryRecallHandler((async(sql:string,args:any[])=>{
    assert.match(sql,/where owner=\$1/); assert.equal(args[0],owner)
    return {rows:[{execution_id:event.executionId,payload:event.payload,payload_hash:event.payloadHash,state:'pending'}]}
  }) as any)({body} as any,res as any)
  assert.equal(res.code,200); assert.equal(res.body.records[0].memoryStatus,'PENDING')
  assert.equal(res.body.historyComplete,false); assert.equal(res.body.signingAuthorized,false)
  const down=response()
  await createReceiptMemoryRecallHandler((async()=>{throw Error('database down')}) as any)({body} as any,down as any)
  assert.equal(down.code,503); assert.equal(down.body.records,undefined)
})
