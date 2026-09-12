import test from 'node:test'
import express from 'express'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import { buildSettledSmartTraderAnalysisRecord, executeSettledSmartTraderDelivery, isRemediableDegradedResearch, shouldRecoverSmartTraderDelivery, type SmartTraderPaidAnalysisRecord } from '../api/polymarket-smart-trader.js'
import { ReceiptCorrections, createReceiptCorrectionRouter } from '../api/receipt-correction.js'
import { ReceiptAcceptance } from '../api/research-acceptance.js'
import { createResearchRecoveryHandler } from '../api/research-recovery.js'
const tx='0x'+'ab'.repeat(32), payer='0x'+'12'.repeat(20)
function fixture(base:boolean){
 const payment:any={provider:base?'CDP x402':'OKX Agent Payments Protocol',network:base?'Base':'X Layer',serviceUrl:base?'/api/x402/base/polymarket-smart-trader':'/api/a2mcp/polymarket-smart-trader',transaction:tx,payer,amountAtomic:'300000'}
 return {...buildSettledSmartTraderAnalysisRecord({action:'ANALYZE',marketId:'0x'+'34'.repeat(32),outcome:'Yes',side:'BUY'},payment,Date.now()),status:'completed',analysisHash:'a'.repeat(64),decisionId:'old',deliveryAttemptCount:1,response:{ok:true,schema:'polydesk-smart-market-trader-v1',action:'ANALYZE',decision:{analysisHash:'a'.repeat(64),decisionId:'old',decision:'ESCALATE',evidence:{zeroScoutId:'proof-is-not-inference'}},evidence:{zeroScout:{summary:'ZeroScout could not obtain a model-backed directional assessment.'}}}} as SmartTraderPaidAnalysisRecord
}
function memory(){const data=new Map<string,any>();let lock=Promise.resolve();return {data,read:async(k:string)=>structuredClone(data.get(k)),mutate:async<T>(k:string,fn:(v:T|undefined)=>T)=>{let value:T;const pending=lock.then(()=>{value=fn(structuredClone(data.get(k)));data.set(k,structuredClone(value))});lock=pending.catch(()=>{});await pending;return structuredClone(value!)}}}
const addendum={summary:'Failure acknowledged',corrections:['No model assessment was delivered'],sources:[{url:'https://example.com/proof',observedAt:'2026-09-12T00:00:00Z',finding:'Proof alone is insufficient'}],remainingGaps:['Provider inference unavailable'],disposition:'ESCALATE',authorship:'OPERATOR_REVIEWED'}
for(const base of [true,false])test(`${base?'Base':'X Layer'} recovery preserves original receipt, corrections and fresh acceptance across restart`,async()=>{
 const db=memory(),key='polydesk:smart-trader:paid-analysis:'+tx,old=fixture(base);db.data.set(key,structuredClone(old))
 const corrections=new ReceiptCorrections(db,async()=>db.read(key)),acceptance=new ReceiptAcceptance(db,corrections)
 await corrections.request(tx,'Provider failed');const correction=await corrections.publish(tx,old.analysisHash!,addendum)
 assert.equal(isRemediableDegradedResearch(old),true)
 assert.equal(shouldRecoverSmartTraderDelivery(old,Date.now(),{allowEngineUpgradeRemediation:true}),false)
 let calls=0
 const result:any={ok:true,data:{ok:true,action:'ANALYZE',decision:{analysisHash:'b'.repeat(64),decisionId:'new',decision:'ESCALATE',evidence:{researchStatus:'AVAILABLE'}}}}
 const run:any=async(request:any,_deps:any,payment:any)=>{calls++;assert.deepEqual(request,old.request);assert.deepEqual(payment,old.payment);const claimed=await db.read(key);assert.deepEqual(claimed.deliveryVersions,[old]);return result}
 await executeSettledSmartTraderDelivery(tx,payer,undefined,{allowDegradedResearchRemediation:true},{mutate:db.mutate,run})
 const recovered=await db.read(key);assert.equal(calls,1);assert.deepEqual(recovered.payment,old.payment);assert.equal(recovered.requestHash,old.requestHash);assert.equal(recovered.settledAt,old.settledAt);assert.deepEqual(recovered.deliveryVersions,[old]);assert.equal(recovered.deliveryAttemptCount,2)
 assert.equal((await acceptance.get(tx)).status,'NOT_ACCEPTED')
 await assert.rejects(acceptance.accept(tx,{action:'ACCEPT_RESEARCH',originalAnalysisHash:old.analysisHash,revisionHash:correction.revisionHash,acknowledgeLimitations:true}),/REVIEW_TARGET_CHANGED/)
 assert.deepEqual(await corrections.get(tx,old.analysisHash),correction)
 await assert.rejects(corrections.get(tx),/CORRECTION_NOT_FOUND/)
 const next=await corrections.request(tx,'Review new evidence');assert.equal(next.originalAnalysisHash,'b'.repeat(64));assert.equal((await acceptance.get(tx)).blockedReason,'CORRECTION_PENDING')
 const published=await corrections.publish(tx,'b'.repeat(64),addendum)
 await acceptance.accept(tx,{action:'ACCEPT_RESEARCH',originalAnalysisHash:'b'.repeat(64),revisionHash:published.revisionHash,acknowledgeLimitations:true})
 const restarted=new ReceiptCorrections(db,async()=>db.read(key))
 assert.deepEqual(await restarted.get(tx,old.analysisHash),correction)
 assert.equal((await new ReceiptAcceptance(db,restarted).get(tx)).status,'ACCEPTED')
 assert.deepEqual((await db.read(key)).deliveryVersions,[old])
 await assert.rejects(executeSettledSmartTraderDelivery(tx,payer,undefined,{allowDegradedResearchRemediation:true},{mutate:db.mutate,run}),/not eligible/)
 assert.equal(calls,1)
})
test('atomic claim rejects a concurrent recovery and archives before provider failure',async()=>{
 const db=memory(),key='polydesk:smart-trader:paid-analysis:'+tx,old=fixture(false);db.data.set(key,old)
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r)
 const run:any=async()=>{started();await gate;throw Error('synthetic provider failure')}
 const first=executeSettledSmartTraderDelivery(tx,payer,undefined,{allowDegradedResearchRemediation:true},{mutate:db.mutate,run});await ready
 await assert.rejects(executeSettledSmartTraderDelivery(tx,payer,undefined,{allowDegradedResearchRemediation:true},{mutate:db.mutate,run}),/not eligible/)
 release();await assert.rejects(first,/synthetic provider failure/)
 assert.deepEqual((await db.read(key)).deliveryVersions,[old]);assert.deepEqual((await db.read(key)).response,old.response)
 assert.equal((await db.read(key)).deliveryAttemptCount,2);assert.equal(isRemediableDegradedResearch(await db.read(key)),true);assert.equal(shouldRecoverSmartTraderDelivery(await db.read(key)),false)
})
test('recovery rejects altered lane, request, exhausted budget and expired scope before execution',async()=>{
 for(const change of [(p:any)=>p.payment.serviceUrl='/wrong',(p:any)=>p.request.outcome='No',(p:any)=>p.deliveryAttemptCount=6,(p:any)=>p.response.selected={market:{endDate:'2020-01-01T00:00:00Z'}}]){
  const db=memory(),key='polydesk:smart-trader:paid-analysis:'+tx,p=fixture(true);change(p);db.data.set(key,p)
  await assert.rejects(executeSettledSmartTraderDelivery(tx,payer,undefined,{allowDegradedResearchRemediation:true},{mutate:db.mutate,run:async()=>assert.fail('must not run')}))
  assert.equal((await db.read(key)).deliveryVersions,undefined)
 }
})
test('both handler lanes pass only the stored payer; an expired scope fails before readiness',async()=>{
 for(const base of [true,false])for(const expired of [true,false]){
  const p=fixture(base);if(expired)p.response!.selected={market:{endDate:'2020-01-01T00:00:00Z'}}
  let reads=0,runs=0,code=200;const handler=createResearchRecoveryHandler({authorize:()=>{},read:async()=>p,ready:async()=>{reads++},execute:async(...args:any[])=>{runs++;assert.equal(args[1],payer)}} as any)
  const res:any={setHeader:()=>{},status:(n:number)=>{code=n;return res},json:()=>res}
  await handler({headers:{},params:{transaction:tx},body:{action:'RECOVER_RESEARCH'}} as any,res)
  assert.equal(code,expired?409:200);assert.equal(reads,expired?0:1);assert.equal(runs,expired?0:1)
 }
})

test('version-scoped corrections remain readable after a second recovery and do not carry acceptance forward',async()=>{
 const db=memory(),key='polydesk:smart-trader:paid-analysis:'+tx,old=fixture(true);db.data.set(key,old)
 const run:any=async()=>({ok:true,data:{ok:true,action:'ANALYZE',decision:{analysisHash:'b'.repeat(64),decisionId:'second',decision:'ESCALATE',evidence:{researchStatus:'UNAVAILABLE'}}}})
 await executeSettledSmartTraderDelivery(tx,payer,undefined,{allowDegradedResearchRemediation:true},{mutate:db.mutate,run})
 const service=new ReceiptCorrections(db,async()=>db.read(key));await service.request(tx,'Second failure');const second=await service.publish(tx,'b'.repeat(64),addendum)
 const third:any=async()=>({ok:true,data:{ok:true,action:'ANALYZE',decision:{analysisHash:'c'.repeat(64),decisionId:'third',decision:'ESCALATE',evidence:{researchStatus:'AVAILABLE'}}}})
 await executeSettledSmartTraderDelivery(tx,payer,undefined,{allowDegradedResearchRemediation:true},{mutate:db.mutate,run:third})
 assert.equal((await db.read(key)).deliveryVersions.length,2);assert.deepEqual(await service.get(tx,'b'.repeat(64)),second)
 await assert.rejects(service.get(tx),/CORRECTION_NOT_FOUND/);assert.equal((await new ReceiptAcceptance(db,service).get(tx)).status,'NOT_ACCEPTED')
})

test('historical correction links bind the archived report and cannot publish to an old version',async()=>{
 const db=memory(),key='polydesk:smart-trader:paid-analysis:'+tx,old=fixture(false);db.data.set(key,old)
 const service=new ReceiptCorrections(db,async()=>db.read(key));await service.request(tx,'Original failure');await service.publish(tx,old.analysisHash!,addendum)
 db.data.set(key,{...old,status:'running',deliveryVersions:[structuredClone(old)]})
 const app=express();app.use(express.json());app.use('/payment/:transaction/correction',createReceiptCorrectionRouter(service,()=>{}));const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 try{
  const url=`http://127.0.0.1:${(server.address() as any).port}/payment/${tx}/correction?analysisHash=${old.analysisHash}`
  const response=await fetch(url),body:any=await response.json();assert.equal(response.status,200);assert.equal(body.correction.originalAnalysisHash,old.analysisHash);assert.match(body.originalResultUrl,/analysisHash=/);assert.equal(body.correction.originalResult,undefined)
  const post=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'REQUEST',issue:'Cannot mutate history'})});assert.equal(post.status,400)
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
