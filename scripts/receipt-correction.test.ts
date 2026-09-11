import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { ReceiptCorrections, CorrectionError, correctionOperator, createReceiptCorrectionRouter } from '../api/receipt-correction.js'
const tx='0x'+'a'.repeat(64),hash='b'.repeat(64)
const report=()=>({schema:'polydesk-smart-trader-paid-analysis-v1',status:'completed',analysisHash:hash,response:{action:'ANALYZE',opinion:'original'},payment:{transaction:tx,network:'Base',provider:'CDP x402',amountAtomic:'300000'}} as any)
const addendum={summary:'Corrected evidence',corrections:['Replace stale price'],sources:[{url:'https://example.com/evidence',observedAt:'2026-09-11T16:00:00Z',finding:'Timestamped evidence'}],remainingGaps:['Macro evidence unavailable'],disposition:'ESCALATE',authorship:'OPERATOR_REVIEWED'}
const code=(v:string)=>(e:unknown)=>e instanceof CorrectionError&&e.code===v
function setup(){let paid=report();const data=new Map();let lock=Promise.resolve();const store={read:async(k:string)=>structuredClone(data.get(k)),mutate:async(k:string,fn:any)=>{let result:any;const update=lock.then(()=>{result=fn(structuredClone(data.get(k)));data.set(k,structuredClone(result))});lock=update.catch(()=>{});await update;return structuredClone(result)}};return {service:new ReceiptCorrections(store,async()=>paid),paid,store}}
test('concurrent requests and publication create one immutable correction and preserve original',async()=>{
 const h=setup(),before=structuredClone(h.paid)
 const requests=await Promise.all(Array.from({length:8},()=>h.service.request(tx,'Stale evidence')))
 assert.equal(new Set(requests.map(r=>r.createdAt)).size,1)
 const a=await h.service.publish(tx,hash,addendum)
 assert.equal(a.status,'PUBLISHED');assert.deepEqual(h.paid,before)
 const restarted=new ReceiptCorrections(h.store,async()=>h.paid)
 assert.deepEqual(await restarted.publish(tx,hash,addendum),a)
 await assert.rejects(restarted.publish(tx,hash,{...addendum,summary:'replacement'}),code('REVISION_IMMUTABLE'))
 await assert.rejects(restarted.request(tx,'different issue'),code('CORRECTION_CONFLICT'))
})
test('wrong receipt, original hash drift and authorization escalation fail closed',async()=>{
 const h=setup();await h.service.request(tx,'Stale evidence')
 await assert.rejects(h.service.publish(tx,'c'.repeat(64),addendum),code('ORIGINAL_CHANGED'))
 await assert.rejects(h.service.publish(tx,hash,{...addendum,disposition:'APPROVE'}),code('INVALID_ADDENDUM'))
 h.paid.response.opinion='changed';await assert.rejects(h.service.publish(tx,hash,addendum),code('ORIGINAL_CHANGED'))
 for(const field of ['network','amountAtomic','transaction']){const x=setup();x.paid.payment[field]='invalid';await assert.rejects(x.service.request(tx,'issue'),code('COMPLETED_BASE_RECEIPT_REQUIRED'))}
 const x=setup();x.paid.status='running';await assert.rejects(x.service.request(tx,'issue'),code('COMPLETED_BASE_RECEIPT_REQUIRED'))
})
test('operator key is mandatory and public transaction possession cannot publish',async()=>{
 for(const supplied of [undefined,'Bearer wrong','Bearer'])assert.throws(()=>correctionOperator(supplied,'correct-key'),code('OPERATOR_REQUIRED'))
 assert.throws(()=>correctionOperator('Bearer anything',''),code('OPERATOR_NOT_CONFIGURED'))
 const h=setup(),app=express();app.use(express.json());app.use('/payment/:transaction/correction',createReceiptCorrectionRouter(h.service,v=>correctionOperator(v,'correct-key')))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address() as any).port+'/payment/'+tx+'/correction'
 try{assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'REQUEST',issue:'defect'})})).status,401)
 await h.service.request(tx,'defect');await h.service.publish(tx,hash,addendum)
 const r=await(await fetch(url)).json() as any;assert.equal(r.correction.originalResult,undefined);assert.equal(r.tradeAuthorized,false);assert.equal(r.additionalPaymentRequired,false)
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})
