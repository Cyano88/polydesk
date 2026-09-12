import test from 'node:test'
import assert from 'node:assert/strict'
import { DeliveryFailureEmail } from '../api/delivery-failure-email.js'
const incident:any={id:'a'.repeat(64),transaction:'sensitive-do-not-email',status:'OPEN',reasons:['RESEARCH_UNAVAILABLE'],episode:1,version:1,openedAt:'2026-09-12T00:00:00Z'}
function store(){const data=new Map();let lock=Promise.resolve();return {read:async<T>(k:string)=>structuredClone(data.get(k)) as T,mutate:async<T>(k:string,fn:(v:T|undefined)=>T)=>{let value:T;const pending=lock.then(()=>{value=fn(structuredClone(data.get(k)));data.set(k,structuredClone(value))});lock=pending.catch(()=>{});await pending;return structuredClone(value!)}}}
const config=()=>({to:'operator@example.com',from:'alerts@example.com'})
test('one email per incident version across concurrency, polling and restart; no sensitive receipt payload',async()=>{
 const db=store();let calls=0;const send=async(input:any)=>{calls++;assert(!JSON.stringify(input).includes(incident.transaction));assert.match(input.text,/Next prompt:/)}
 const email=new DeliveryFailureEmail(db,config,send);await Promise.all([email.notify(incident),email.notify(incident)]);await new DeliveryFailureEmail(db,config,send).notify(incident);assert.equal(calls,1);assert.equal((await email.receipt(incident))?.state,'PROVIDER_ACCEPTED')
 await email.notify({...incident,version:2});assert.equal(calls,2)
})
test('disabled, acknowledged and resolved incidents never send',async()=>{
 const send=async()=>assert.fail('unexpected send');await new DeliveryFailureEmail(store(),()=>null,send).notify(incident)
 for(const status of ['ACKNOWLEDGED','RESOLVED'])await new DeliveryFailureEmail(store(),config,send).notify({...incident,status})
})
test('retries are bounded, preserve the payload and cannot exceed the idempotency window',async()=>{
 const db=store();let now=0;const inputs:any[]=[];const email=new DeliveryFailureEmail(db,config,async input=>{inputs.push(input);throw Error('outage')},()=>now)
 await email.notify(incident);await email.notify(incident);assert.equal(inputs.length,1)
 now+=300001;await email.notify(incident);now+=300001;await email.notify(incident);now+=300001;await email.notify(incident)
 assert.equal(inputs.length,3);assert.deepEqual(inputs[0],inputs[2]);assert.equal((await email.receipt(incident))?.state,'REVIEW_REQUIRED')
 const late=new DeliveryFailureEmail(store(),config,async()=>{throw Error('outage')},()=>now);await late.notify(incident);now+=24*60*60*1000;await late.notify(incident);assert.equal((await late.receipt(incident))?.attempts,1)
})
