import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { managedDeliveryItems } from '../api/polydesk-managed-delivery.js'
import { deliverySucceeded, runDeliveryCycle } from './polydesk-managed-delivery.js'
import { validateManagedSubscriptionIdentity } from '../api/polydesk-managed-agent-subscription.js'
const now=Date.now()
const sub=validateManagedSubscriptionIdentity({jobId:'0x'+'ab'.repeat(32),providerAgentId:'5427',serviceListingId:'38496',serviceId:'09b9ee03-1273-4b8e-91df-c713b44c641d',buyerAgentId:'2191',status:'active',periodStartAt:new Date(now-3600000).toISOString(),periodEndAt:new Date(now+86400000).toISOString()})
const row={buyer_agent_id:'2191',status:'active',period_end_at:sub.periodEndAt,monitoring_enabled:true,alert_email_verified:true}
const alert={id:1,alert_type:'loss-threshold',title:'Loss threshold reached',body:'Observed loss 12%, threshold 10%.',created_at:new Date(now-1000).toISOString()}
function temp(t:any){const dir=mkdtempSync(join(tmpdir(),'pd-delivery-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir}
test('unenrolled subscription gets explicit setup questions, no fabricated findings',()=>{
 const [item]=managedDeliveryItems(sub,undefined,[],now);const data=JSON.parse(item.text)
 assert.equal(item.kind,'setup');assert.equal(data.state,'PREFERENCES_REQUIRED');assert.equal(data.tradeAuthorized,false);assert.match(data.summary,/No portfolio analysis/)
})
test('inactive, paused and expired monitoring produces no alert deliveries',()=>{
 for(const r of [{...row,status:'paused'},{...row,monitoring_enabled:false},{...row,period_end_at:new Date(now-1).toISOString()}])assert.deepEqual(managedDeliveryItems(sub,r,[alert],now),[])
 assert.deepEqual(managedDeliveryItems({...sub,status:'expired'},row,[alert],now),[])
})
test('buyer mismatch fails and unverified email never reveals alert content',()=>{
 assert.throws(()=>managedDeliveryItems(sub,{...row,buyer_agent_id:'999'},[alert],now),/buyer mismatch/)
 const items=managedDeliveryItems(sub,{...row,alert_email_verified:false},[alert],now)
 assert.equal(items[0].kind,'setup');assert.ok(!items[0].text.includes(alert.body))
})
test('real event retains timestamp and content; stale and future events excluded',()=>{
 const items=managedDeliveryItems(sub,row,[alert,{...alert,id:2,created_at:new Date(now-86400001).toISOString()},{...alert,id:3,created_at:new Date(now+1000).toISOString()}],now)
 assert.equal(items.length,1);const payload=JSON.parse(items[0].text);assert.equal(payload.summary,alert.body);assert.equal(payload.orderSubmitted,false);assert.ok(payload.followUpPrompts.length)
})
test('success requires explicit delivered evidence, not ok=true alone',()=>{
 assert.equal(deliverySucceeded({ok:true}),false);assert.equal(deliverySucceeded({ok:true,data:{delivered:true}}),true)
 assert.equal(deliverySucceeded({ok:false,data:{delivered:true}}),false);assert.equal(deliverySucceeded({data:{reason:'alreadyDelivered'}}),true)
})
test('dry-run sends nothing; committed delivery survives process-style rerun without duplicates',async t=>{
 const dir=temp(t);let sends=0;const deps={list:async()=>[sub],items:async()=>managedDeliveryItems(sub,row,[alert],now),send:async()=>{sends++;return {ok:true,data:{delivered:true}}}}
 assert.equal((await runDeliveryCycle(deps,dir,false))[0].state,'PREVIEW');assert.equal(sends,0)
 assert.equal((await runDeliveryCycle(deps,dir,true))[0].state,'SENT');assert.equal((await runDeliveryCycle(deps,dir,true))[0].state,'ALREADY_SENT');assert.equal(sends,1)
})
test('timeout retains pending claim and blocks all resends',async t=>{
 const dir=temp(t);let sends=0;const deps={list:async()=>[sub],items:async()=>managedDeliveryItems(sub,row,[alert],now),send:async()=>{sends++;throw new Error('timeout')}}
 assert.equal((await runDeliveryCycle(deps,dir,true))[0].state,'DELIVERY_RECONCILIATION_REQUIRED')
 assert.equal((await runDeliveryCycle(deps,dir,true))[0].state,'DELIVERY_RECONCILIATION_REQUIRED');assert.equal(sends,1)
})
test('expiry or identity change after generation prevents sending',async t=>{
 let calls=0,sends=0;const deps={list:async()=>++calls===1?[sub]:[{...sub,buyerAgentId:'999'}],items:async()=>managedDeliveryItems(sub,row,[alert],now),send:async()=>{sends++;return {delivered:true}}}
 assert.equal((await runDeliveryCycle(deps,temp(t),true))[0].state,'NO_LONGER_ACTIVE');assert.equal(sends,0)
})
test('payload for another job is rejected before transport',async t=>{
 let sends=0;const items=managedDeliveryItems(sub,row,[alert],now);items[0].text=items[0].text.replace(sub.jobId,'wrong_job')
 const out=await runDeliveryCycle({list:async()=>[sub],items:async()=>items,send:async()=>{sends++;return {delivered:true}}},temp(t),true)
 assert.equal(out[0].state,'BLOCKED');assert.equal(sends,0)
})
