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
  h.paid.payment.payer='0x'+'e'.repeat(40)
  assert.equal((await post('/jobs/'+job.id+'/acceptance','partner')).status,409)
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})
