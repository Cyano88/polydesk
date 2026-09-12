import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {once} from 'node:events'
import {DeliveryMonitor,deliveryFailureReasons,createDeliveryIncidentRouter,type MonitorStore} from '../api/delivery-monitor.js'
import {CorrectionError,correctionOperator} from '../api/receipt-correction.js'
import {buildSettledSmartTraderAnalysisRecord,shouldRecoverSmartTraderDelivery} from '../api/polymarket-smart-trader.js'
const prefix='polydesk:smart-trader:paid-analysis:',now=Date.parse('2026-09-12T12:00:00Z')
function record(i:number,status='completed',research='AVAILABLE') {
 const r:any=buildSettledSmartTraderAnalysisRecord({action:'ANALYZE',marketId:'0x'+'12'.repeat(32),outcome:'Yes',side:'BUY'},{provider:'CDP x402',transaction:'0x'+i.toString(16).padStart(64,'0'),payer:'0x'+'11'.repeat(20),network:'Base',amountAtomic:'300000',serviceUrl:'/api/x402/base/polymarket-smart-trader'},now-900000)
 return {...r,status,decisionId:'fixture',analysisHash:'a'.repeat(64),response:{decision:{decision:'ESCALATE',evidence:{researchStatus:research}}}}
}
function fixture(){const data=new Map<string,any>();let lock=Promise.resolve();const store:MonitorStore={read:async<T>(k:string)=>structuredClone(data.get(k)) as T,mutate:async<T>(k:string,fn:(v:T|undefined)=>T)=>{let result!:T;const next=lock.then(()=>{result=fn(structuredClone(data.get(k)));data.set(k,structuredClone(result))});lock=next.catch(()=>{});await next;return structuredClone(result)},page:async<T>(prefix:string,after:string,limit:number)=>[...data.entries()].filter(([k])=>k.startsWith(prefix)&&k>after).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,value])=>({key,value:structuredClone(value) as T}))};return {data,store,service:new DeliveryMonitor(store)}}
const opts={eligible:shouldRecoverSmartTraderDelivery,now:()=>now}
test('persistent cursor reaches work after 100 completed rows across monitor restart',async()=>{
 const h=fixture();for(let i=1;i<=105;i++){const r=record(i,i===105?'settled':'completed');h.data.set(prefix+r.payment.transaction,r)}
 let calls=0;const recover=async(r:any)=>{calls++;h.data.set(prefix+r.payment.transaction,record(105))}
 assert.equal((await h.service.sweep({...opts,recover})).scanned,100);assert.equal(calls,0)
 const restarted=new DeliveryMonitor(h.store),second=await restarted.sweep({...opts,recover})
 assert.equal(second.scanned,5);assert.equal(calls,1)
 const incidents=(await restarted.list()).incidents;assert.equal(incidents.length,1);assert.equal(incidents[0].status,'RESOLVED')
 assert.equal((await restarted.status(now)).workerStatus,'HEALTHY')
})
test('degraded/exhausted jobs alert without auto compute; all page incidents observed despite four-execution cap',async()=>{
 const h=fixture();for(let i=1;i<=9;i++){const r=record(i,i<=6?'settled':'completed',i>6?'UNAVAILABLE':'AVAILABLE');if(i===9)r.deliveryAttemptCount=6;h.data.set(prefix+r.payment.transaction,r)}
 let calls=0;await h.service.sweep({...opts,recover:async()=>{calls++}})
 assert.equal(calls,4);const incidents=(await h.service.list()).incidents;assert.equal(incidents.length,9)
 assert.ok(incidents.some(i=>i.reasons.includes('RECOVERY_EXHAUSTED')))
 assert.equal(incidents.filter(i=>i.reasons.includes('RESEARCH_UNAVAILABLE')).length,3)
})
test('incidents deduplicate, survive restart, acknowledge idempotently, resolve only on healthy delivery and reopen',async()=>{
 const h=fixture(),r=record(9,'completed','UNAVAILABLE'),reasons=deliveryFailureReasons(r,now,false)
 await Promise.all(Array.from({length:8},()=>h.service.observe(r,reasons,now)))
 const one=(await h.service.list()).incidents[0];assert.equal(one.version,1);assert.equal(one.episode,1)
 await h.service.acknowledge(one.id,1);await new DeliveryMonitor(h.store).acknowledge(one.id,1)
 await h.service.observe(r,[],now+1,false);assert.equal((await h.service.list()).incidents[0].status,'ACKNOWLEDGED')
 await h.service.observe(record(9),[],now+2,true);assert.equal((await h.service.list()).incidents[0].status,'RESOLVED')
 await h.service.observe(r,reasons,now+3);const reopened=(await h.service.list()).incidents[0];assert.equal(reopened.status,'OPEN');assert.equal(reopened.episode,2)
 await assert.rejects(h.service.acknowledge(one.id,1),(e:any)=>e.code==='INCIDENT_CHANGED')
})
test('sweep failure persists safe heartbeat, stalls cursor for retry, and heartbeat detects staleness',async()=>{
 const h=fixture(),bad=new DeliveryMonitor({...h.store,page:async()=>{throw Error('private upstream secret')}})
 await assert.rejects(bad.sweep({...opts,recover:async()=>{assert.fail()}}))
 const status=await h.service.status(now);assert.equal(status.workerStatus,'FAILED');assert.equal(status.heartbeat?.lastFailureCode,'SWEEP_FAILED');assert.ok(!JSON.stringify(status).includes('secret'))
 await h.service.sweep({...opts,recover:async()=>{assert.fail()}});assert.equal((await h.service.status(now+600000)).workerStatus,'STALE')
})
test('operator routes require auth and acknowledgement cannot trigger payment or recovery',async()=>{
 const h=fixture(),r=record(1,'failed');await h.service.observe(r,['DELIVERY_FAILED'],now)
 const incident=(await h.service.list()).incidents[0],app=express();app.use(express.json());app.use('/incidents',createDeliveryIncidentRouter(h.service,v=>correctionOperator(v,'test-key')))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+(server.address() as any).port+'/incidents'
 try{
  assert.equal((await fetch(url)).status,401)
  const headers={Authorization:'Bearer test-key','Content-Type':'application/json'}
  const listing=await(await fetch(url,{headers})).json() as any;assert.equal(listing.notificationDelivery,'DISABLED')
  const response=await(await fetch(url+'/'+incident.id+'/acknowledge',{method:'POST',headers,body:JSON.stringify({version:incident.version})})).json() as any
  assert.equal(response.incident.status,'ACKNOWLEDGED');assert.equal(response.researchStarted,false);assert.equal(response.paymentRequired,false)
  assert.equal((await fetch(url,{headers})).headers.get('cache-control'),'no-store')
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})

test('exhausted missing-proof delivery remains an incident even when recovery eligibility is false',async()=>{
 const r=record(22);r.deliveryAttemptCount=6;r.response.decision.blockers=['ZeroScout research evidence is required'];r.response.decision.riskFlags=['ZeroScout research was unavailable']
 assert.equal(shouldRecoverSmartTraderDelivery(r,now),false)
 assert.ok(deliveryFailureReasons(r,now,false).includes('INCOMPLETE_DELIVERY'))
 assert.ok(deliveryFailureReasons(r,now,false).includes('RECOVERY_EXHAUSTED'))
})

test('recovery attempt failure creates a durable incident while later records still get scanned',async()=>{
 const h=fixture();for(let i=1;i<=2;i++){const r=record(i,'settled');h.data.set(prefix+r.payment.transaction,r)}
 const stats=await h.service.sweep({...opts,recover:async()=>{throw Error('private error')}})
 assert.equal(stats.recoveryFailures,2);const incidents=(await h.service.list()).incidents
 assert.equal(incidents.length,2);assert.ok(incidents.every(i=>i.reasons.includes('RECOVERY_ATTEMPT_FAILED')))
 assert.ok(!JSON.stringify(incidents).includes('private error'))
})
