import {ReceiptCorrections} from '../api/receipt-correction.js'
import {ReceiptAcceptance} from '../api/research-acceptance.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { createPartnerResearchRouter, PartnerResearch, type ResearchStore, type ResearchJob } from '../api/partner-research.js'
import { PartnerError, type Partner } from '../api/partner-jobs.js'
const p={tenantId:'tenant',applicationId:'app',scopes:['jobs:read','jobs:create']} as Partner
const input={action:'ANALYZE',marketId:'0x'+'12'.repeat(32),outcome:'Yes',side:'BUY'}
const attempt='a'.repeat(64), tx='0x'+'b'.repeat(64), payer='0x'+'c'.repeat(40)
const code=(c:string)=>(e:unknown)=>e instanceof PartnerError&&e.code===c
function store():ResearchStore {
 const rows=new Map<string,ResearchJob>();let lock=Promise.resolve()
 return {read:async k=>structuredClone(rows.get(k)),mutate:async(k,fn)=>{
 let result!:ResearchJob;const next=lock.then(()=>{result=fn(structuredClone(rows.get(k)));rows.set(k,structuredClone(result))});lock=next.catch(()=>{});await next;return structuredClone(result)
 }}
}
test('reservation is idempotent, scoped and contains no payment or compute result',async()=>{
 const jobs=new PartnerResearch(store())
 const rows=await Promise.all(Array.from({length:8},()=>jobs.create(p,'research-key',input)))
 assert.equal(new Set(rows.map(r=>r.id)).size,1);assert.equal(rows[0].transaction,undefined)
 await assert.rejects(jobs.create(p,'research-key',{...input,outcome:'No'}),code('IDEMPOTENCY_CONFLICT'))
 await assert.rejects(jobs.get({...p,applicationId:'other'},rows[0].id),code('NOT_FOUND'))
 await assert.rejects(jobs.create(p,'other-key',{...input,transaction:tx}),code('INVALID_RESEARCH_INPUT'))
})
test('exact request binds one attempt and one settlement across process recovery',async()=>{
 const db=store(),jobs=new PartnerResearch(db),job=await jobs.create(p,'research-key',input)
 await jobs.bind(p,job.id,job.request)
 await jobs.bind(p,job.id,input,attempt)
 await assert.rejects(jobs.bind(p,job.id,{...input,outcome:'No'},attempt),code('RESEARCH_REQUEST_MISMATCH'))
 await assert.rejects(jobs.bind(p,job.id,input,'d'.repeat(64)),code('EXISTING_PAYMENT_REQUIRES_RECOVERY'))
 const restarted=new PartnerResearch(db)
 await restarted.bind(p,job.id,input,attempt,tx,payer)
 assert.equal((await restarted.bind(p,job.id,input,attempt,tx,payer)).transaction,tx)
 await assert.rejects(restarted.bind(p,job.id,input,attempt,'0x'+'e'.repeat(64),payer),code('EXISTING_PAYMENT_REQUIRES_RECOVERY'))
 await assert.rejects(restarted.bind(p,job.id,input,attempt,tx,'0x'+'d'.repeat(40)),code('EXISTING_PAYMENT_REQUIRES_RECOVERY'))
})
test('correction is retained under original settlement without creating a payment',async()=>{
 const jobs=new PartnerResearch(store()),job=await jobs.create(p,'research-key',input)
 await assert.rejects(jobs.correct(p,job.id,'Missing evidence'),code('PAYMENT_NOT_VERIFIED'))
 await jobs.bind(p,job.id,input,attempt,tx,payer)
 const first=await jobs.correct(p,job.id,'Missing evidence')
 const replay=await jobs.correct(p,job.id,'Missing evidence')
 assert.deepEqual(replay,first);assert.equal(replay.transaction,tx)
 assert.equal(replay.correction?.status,'REQUESTED')
})

test('HTTP delivery preserves original JSON, flags degraded research and records correction',async()=>{
 const jobs=new PartnerResearch(store()),job=await jobs.create(p,'http-research-key',input)
 const app=express();app.use(express.json())
 const response={action:'ANALYZE',decision:{evidence:{researchStatus:'UNAVAILABLE'},decision:'ESCALATE'}}
 const paid={schema:'polydesk-smart-trader-paid-analysis-v1',status:'completed',analysisHash:'d'.repeat(64),requestHash:job.requestHash,payment:{provider:'CDP x402',amountAtomic:'300000',network:'Base',transaction:tx,payer},response} as any
 const correctionRows=new Map();const correctionStore={read:async(k:string)=>correctionRows.get(k),mutate:async(k:string,f:any)=>{const c=f(correctionRows.get(k));correctionRows.set(k,c);return c}}
 const corrections=new ReceiptCorrections(correctionStore,async()=>paid),acceptance=new ReceiptAcceptance(correctionStore,corrections)
 let reads=0,missingPaid=false
 app.use('/research',createPartnerResearchRouter(jobs,{ready:()=>true,authenticate:h=>{if(h!=='Bearer test')throw new PartnerError(401,'AUTH_REQUIRED');return p},readPaid:async()=>{reads++;return missingPaid?undefined:paid}},acceptance,corrections))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const base='http://127.0.0.1:'+ (server.address() as any).port+'/research/'+job.id
 try {
  assert.equal((await fetch(base)).status,401)
  const unpaid=await (await fetch(base,{headers:{Authorization:'Bearer test'}})).json() as any
  assert.equal(unpaid.status,'AWAITING_PAYMENT');assert.equal(reads,0);assert.equal(unpaid.result,null)
  await jobs.bind(p,job.id,input,attempt,tx,payer)
  missingPaid=true
  const gap=await(await fetch(base,{headers:{Authorization:'Bearer test'}})).json() as any
  assert.equal(gap.status,'PAYMENT_RECOVERY_REQUIRED');assert.equal(gap.retryPayment,false)
  missingPaid=false
  const delivered=await(await fetch(base,{headers:{Authorization:'Bearer test'}})).json() as any
  assert.equal(delivered.status,'CORRECTION_REQUIRED');assert.deepEqual(delivered.result,response)
  assert.equal(delivered.buyerGuidance.tradeAuthorized,false)
  const correction=await fetch(base+'/correction',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({issue:'AI unavailable'})})
  assert.equal(correction.status,202);assert.equal((await correction.json() as any).refundStatus,'NOT_ISSUED')
  paid.payment.amountAtomic='1'
  assert.equal((await fetch(base,{headers:{Authorization:'Bearer test'}})).status,409)
 } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})
