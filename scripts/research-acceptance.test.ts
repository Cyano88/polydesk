import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { ReceiptCorrections, CorrectionError, correctionOperator } from '../api/receipt-correction.js'
import { ReceiptAcceptance, createReceiptAcceptanceRouter } from '../api/research-acceptance.js'
import { PartnerResearch, createPartnerResearchRouter } from '../api/partner-research.js'
import { PartnerError } from '../api/partner-jobs.js'
const tx='0x'+'a'.repeat(64), hash='b'.repeat(64), payer='0x'+'c'.repeat(40)
const body={action:'ACCEPT_RESEARCH',originalAnalysisHash:hash,revisionHash:null,acknowledgeLimitations:true}
const addendum={summary:'Evidence corrected',corrections:['Stale report excluded'],sources:[{url:'https://example.com/facts',observedAt:'2026-09-12T00:00:00Z',finding:'Observed evidence'}],remainingGaps:['No reliable probability estimate'],disposition:'ESCALATE',authorship:'OPERATOR_REVIEWED'}
const code=(c:string)=>(e:unknown)=>e instanceof CorrectionError&&e.code===c
function setup(){
 const rows=new Map();let lock=Promise.resolve()
 const store={read:async(k:string)=>structuredClone(rows.get(k)),mutate:async(k:string,fn:any)=>{let value:any;const next=lock.then(()=>{value=fn(structuredClone(rows.get(k)));rows.set(k,structuredClone(value))});lock=next.catch(()=>{});await next;return structuredClone(value)}}
 const paid:any={schema:'polydesk-smart-trader-paid-analysis-v1',status:'completed',analysisHash:hash,requestHash:'request',response:{action:'ANALYZE',decision:{evidence:{researchStatus:'AVAILABLE'},decision:'ESCALATE'}},payment:{transaction:tx,payer,network:'Base',provider:'CDP x402',amountAtomic:'300000'}}
 const corrections=new ReceiptCorrections(store,async()=>paid)
 return {store,paid,corrections,service:new ReceiptAcceptance(store,corrections)}
}
test('acceptance survives service recreation, concurrent retries and preserves original result',async()=>{
 const h=setup(),original=structuredClone(h.paid)
 const results=await Promise.all(Array.from({length:8},()=>h.service.accept(tx,body)))
 assert.equal(new Set(results.map(x=>x.acceptance?.acceptedAt)).size,1)
 assert.deepEqual(await new ReceiptAcceptance(h.store,h.corrections).get(tx),results[0]);assert.deepEqual(h.paid,original)
 assert.equal((await h.service.get(tx,'partner:other')).status,'NOT_ACCEPTED')
})
test('acceptance requires explicit limitation acknowledgement and exact corrected revision',async()=>{
 const h=setup()
 await assert.rejects(h.service.accept(tx,{...body,acknowledgeLimitations:false}),code('EXPLICIT_RESEARCH_ACCEPTANCE_REQUIRED'))
 await h.corrections.request(tx,'Stale evidence')
 await assert.rejects(h.service.accept(tx,body),code('CORRECTION_PENDING'))
 const correction=await h.corrections.publish(tx,hash,addendum)
 await assert.rejects(h.service.accept(tx,body),code('REVIEW_TARGET_CHANGED'))
 assert.equal((await h.service.accept(tx,{...body,revisionHash:correction.revisionHash})).status,'ACCEPTED')
 h.paid.response.changed=true
 await assert.rejects(h.service.get(tx),code('ORIGINAL_CHANGED'))
 const unavailable=setup();unavailable.paid.response.decision.evidence.researchStatus='UNAVAILABLE'
 await assert.rejects(unavailable.service.accept(tx,body),code('AVAILABLE_RESEARCH_REQUIRED'))
})
test('new correction invalidates previous acceptance instead of silently accepting new findings',async()=>{
 const h=setup();await h.service.accept(tx,body);await h.corrections.request(tx,'new defect')
 assert.equal((await h.service.get(tx)).status,'REVIEW_REQUIRED')
 const correction=await h.corrections.publish(tx,hash,addendum)
 const reviewed=await h.service.accept(tx,{...body,revisionHash:correction.revisionHash})
 assert.equal(reviewed.status,'ACCEPTED');assert.equal(reviewed.acceptance?.previousAcceptances?.length,1)
})
test('public receipt cannot authorize acceptance and partner route checks tenant and payment binding',async()=>{
 const h=setup(),jobs=new PartnerResearch(h.store),partner:any={tenantId:'one',applicationId:'app',scopes:['jobs:read','jobs:create']}
 const request={action:'ANALYZE',marketId:'0x'+'12'.repeat(32),outcome:'Yes',side:'BUY'}
 const job=await jobs.create(partner,'test-acceptance',request);await jobs.bind(partner,job.id,request,'d'.repeat(64),tx,payer);h.paid.requestHash=job.requestHash
 const app=express();app.use(express.json());app.use('/receipt/:transaction',createReceiptAcceptanceRouter(h.service,v=>correctionOperator(v,'operator')))
 app.use('/jobs',createPartnerResearchRouter(jobs,{ready:()=>true,readPaid:async()=>h.paid,authenticate:header=>{if(header==='Bearer partner')return partner;if(header==='Bearer other')return {...partner,tenantId:'other'};throw new PartnerError(401,'AUTH_REQUIRED')}},h.service))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address() as any).port
 const post=(path:string,key?:string)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body)})
 try{
  assert.equal((await post('/receipt/'+tx)).status,401)
  const response=await(await post('/receipt/'+tx,'operator')).json() as any
  assert.equal(response.status,'ACCEPTED');assert.equal(response.tradeAuthorized,false);assert.equal(response.acceptance.actor,undefined)
  assert.equal((await post('/jobs/'+job.id+'/acceptance','other')).status,404)
  assert.equal((await post('/jobs/'+job.id+'/acceptance','partner')).status,200)
  const delivery=await(await fetch(url+'/jobs/'+job.id,{headers:{Authorization:'Bearer partner'}})).json() as any
  assert.equal(delivery.acceptance.status,'ACCEPTED');assert.ok(delivery.buyerGuidance.followUpPrompts.includes('Decline this trade'))
  await jobs.correct(partner,job.id,'New defect')
  const corrected=await(await fetch(url+'/jobs/'+job.id,{headers:{Authorization:'Bearer partner'}})).json() as any
  assert.equal(corrected.acceptance.status,'REVIEW_REQUIRED')
  h.paid.payment.payer='0x'+'e'.repeat(40)
  assert.equal((await post('/jobs/'+job.id+'/acceptance','partner')).status,409)
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})

test('partner HTTP correction rounds invalidate acceptance and present only eligible buyer prompts',async()=>{
 const h=setup(),jobs=new PartnerResearch(h.store),partner:any={tenantId:'rounds',applicationId:'app',scopes:['jobs:read','jobs:create']}
 const request={action:'ANALYZE',marketId:'0x'+'12'.repeat(32),outcome:'Yes',side:'BUY'}
 const job=await jobs.create(partner,'rounds-test-key',request);await jobs.bind(partner,job.id,request,'d'.repeat(64),tx,payer);h.paid.requestHash=job.requestHash
 const original=structuredClone(h.paid),app=express();app.use(express.json())
 app.use('/jobs',createPartnerResearchRouter(jobs,{ready:()=>true,readPaid:async()=>h.paid,authenticate:()=>partner},h.service,h.corrections))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address() as any).port+'/jobs/'+job.id
 const post=(path:string,b:unknown)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})
 try{
  assert.equal((await post('/correction',{issue:'First defect'})).status,202)
  const one=await h.corrections.publish(tx,hash,addendum)
  assert.equal((await post('/acceptance',{...body,revisionHash:one.revisionHash})).status,200)
  assert.equal((await post('/correction',{issue:'Second defect'})).status,409)
  const requests=await Promise.all(Array.from({length:5},()=>post('/correction',{issue:'Second defect',previousRevisionHash:one.revisionHash})))
  assert.ok(requests.every(r=>r.status===202))
  const pending=await(await fetch(url)).json() as any
  assert.equal(pending.status,'CORRECTION_REQUIRED');assert.equal(pending.correction.round,2)
  assert.equal(pending.acceptance.acceptanceAllowed,false);assert.equal(pending.nextActions[0].action,'CHECK_CORRECTION')
  assert.ok(!pending.buyerGuidance.followUpPrompts.some((v:string)=>/^Accept|preview/i.test(v)))
  assert.equal((await post('/acceptance',{...body,revisionHash:one.revisionHash})).status,409)
  const two=await h.corrections.publish(tx,hash,{...addendum,summary:'Second fix'},2)
  assert.equal((await post('/acceptance',{...body,revisionHash:one.revisionHash})).status,409)
  const accepted=await(await post('/acceptance',{...body,revisionHash:two.revisionHash})).json() as any
  assert.equal(accepted.status,'ACCEPTED');assert.equal(accepted.tradeAuthorized,false)
  const done=await(await fetch(url)).json() as any
  assert.equal(done.correction.status,'PUBLISHED');assert.equal(done.acceptance.status,'ACCEPTED')
  assert.equal(done.correction.previousRounds[0].revisionHash,one.revisionHash)
  assert.ok(done.buyerGuidance.followUpPrompts.includes('Decline this trade'));assert.deepEqual(h.paid,original)
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})

test('unavailable research and pending corrections never offer acceptance',async()=>{
 const h=setup();h.paid.response.decision.evidence.researchStatus='UNAVAILABLE'
 const {acceptanceView}=await import('../api/research-acceptance.js')
 const unavailable=acceptanceView(await h.service.get(tx))
 assert.equal(unavailable.acceptanceAllowed,false);assert.equal(unavailable.blockedReason,'AVAILABLE_RESEARCH_REQUIRED')
 assert.ok(!unavailable.followUpPrompts.some(v=>v.startsWith('Accept')))
 await h.corrections.request(tx,'AI failure')
 const pending=acceptanceView(await h.service.get(tx))
 assert.equal(pending.blockedReason,'CORRECTION_PENDING');assert.deepEqual(pending.followUpPrompts,['Show original findings and correction history','Check correction status'])
})
