import test from 'node:test'
import assert from 'node:assert/strict'
import { runManagedSession, type ManagedSession, type ManagedSessionDeps } from '../api/polydesk-managed-session.js'
import { validateManagedPreferences, validateManagedSubscriptionIdentity } from '../api/polydesk-managed-agent-subscription.js'
const subscription=validateManagedSubscriptionIdentity({jobId:'managed_conversation_fixture',buyerAgentId:'9001',providerAgentId:'5427',serviceListingId:'38496',serviceId:'09b9ee03-1273-4b8e-91df-c713b44c641d',status:'active',periodStartAt:'2026-09-01T00:00:00Z',periodEndAt:'2026-10-01T00:00:00Z'})
const owner='0x'+'1'.repeat(40)
const answers={address:owner,email:'buyer@example.com',lossThresholdPercent:10,profitThresholdPercent:20,newPositionAlertsEnabled:true,resolvedAlertsEnabled:true,claimableAlertsEnabled:false,digestFrequency:'off'}
function setup(){
 const store=new Map<string,ManagedSession>()
 const calls={enroll:0,research:0,recall:0,buy:0,sell:0}
 const deps:ManagedSessionDeps={
  now:()=>Date.parse('2026-09-10'),
  mutate:async(key,change)=>{const next=change(structuredClone(store.get(key)));store.set(key,structuredClone(next));return structuredClone(next)},
  validatePreferences:validateManagedPreferences,
  enroll:async()=>{calls.enroll++;return{monitoringEnabled:false}},
  status:async()=>({enrolled:false,monitoringEnabled:false}),
  recall:async()=>{calls.recall++;return{ok:true,source:'SIBYL_VERIFIED_RECEIPTS',records:[],historyComplete:false}},
  research:async()=>{calls.research++;return{ok:true,data:{opinion:'Review risk',orderAuthorized:false}}},
  prepareBuy:async()=>{calls.buy++;return{ok:true,readyForLocalSigning:true}},
  prepareSell:async()=>{calls.sell++;return{ok:true,orderAuthorized:false}},
 }
 return{deps,calls,store,run:(raw:unknown)=>runManagedSession(subscription,raw,deps)}
}
test('asks missing preferences, retains answers, then confirms exact revision before one enrollment',async()=>{
 const f=setup()
 const first=await f.run({requestId:'message_01',action:'PREFERENCES',answers:{address:owner}})
 assert.equal(first.state,'PREFERENCES_REQUIRED')
 assert.ok(!first.questions.some((q:any)=>q.field==='address'))
 const ready=await f.run({requestId:'message_02',action:'PREFERENCES',answers})
 assert.equal(ready.state,'CONFIRM_PREFERENCES')
 assert.equal(f.calls.enroll,0)
 const command={requestId:'message_03',action:'CONFIRM_ONBOARDING',revision:ready.revision}
 assert.equal((await f.run(command)).state,'EMAIL_VERIFICATION_REQUIRED')
 assert.equal((await f.run(command)).idempotentReplay,true)
 assert.equal(f.calls.enroll,1)
})
test('rejects stale confirmation after changed preferences',async()=>{
 const f=setup()
 const old=await f.run({requestId:'message_01',action:'PREFERENCES',answers})
 await f.run({requestId:'message_02',action:'PREFERENCES',answers:{profitThresholdPercent:30}})
 assert.equal((await f.run({requestId:'message_03',action:'CONFIRM_ONBOARDING',revision:old.revision})).state,'OPERATOR_REVIEW_REQUIRED')
 assert.equal(f.calls.enroll,0)
})
test('rejects unknown fields, secret material and coercible alert choices',async()=>{
 const f=setup()
 for(const bad of [{apiKey:'secret'},{newPositionAlertsEnabled:'true'},{lossThresholdPercent:999},{digestTimezone:'invalid'}]){
  await assert.rejects(f.run({requestId:'message_01',action:'PREFERENCES',answers:bad}))
 }
 assert.equal(f.calls.enroll,0)
})
test('does not assume weekly schedule or timezone',async()=>{
 const f=setup()
 const r=await f.run({requestId:'message_01',action:'PREFERENCES',answers:{...answers,digestFrequency:'weekly'}})
 assert.deepEqual(r.questions.map((q:any)=>q.field),['digestTimezone','digestHourLocal','digestWeekday'])
})
test('research asks for explicit memory choice and does not call AI prematurely',async()=>{
 const f=setup()
 const r=await f.run({requestId:'message_01',action:'RESEARCH',research:{marketId:'fixture-market',outcome:'Yes',side:'BUY'}})
 assert.equal(r.state,'MEMORY_CHOICE_REQUIRED')
 assert.equal(f.calls.research,0)
})
test('verified owner context reaches research; recall proof is never persisted',async()=>{
 const f=setup()
 let context:any
 f.deps.research=async(_i,c)=>{context=c;f.calls.research++;return{ok:true}}
 const proof={owner,signature:'fixture_signature_do_not_store'}
 const cmd={requestId:'message_01',action:'RESEARCH',research:{marketId:'fixture-market',outcome:'Yes',side:'BUY'},useMemory:true,ownerAddress:owner,memoryProof:proof}
 const r=await f.run(cmd)
 assert.equal(r.state,'RESULTS_READY')
 assert.equal(r.tradeAuthorized,false)
 assert.equal(context.source,'SIBYL_VERIFIED_RECEIPTS')
 assert.ok(!JSON.stringify([...f.store.values()]).includes(proof.signature))
 await f.run(cmd)
 assert.equal(f.calls.research,1)
 assert.equal(f.calls.recall,1)
})
test('invalid owner binding and failed recall cannot reach AI or silently omit memory',async()=>{
 const f=setup()
 const cmd={requestId:'message_01',action:'RESEARCH',research:{marketId:'fixture-market',outcome:'Yes',side:'BUY'},useMemory:true,ownerAddress:owner,memoryProof:{owner:'0x'+'2'.repeat(40)}}
 await assert.rejects(f.run(cmd),/must match/)
 f.deps.recall=async()=>{throw new Error('invalid signature')}
 const r=await f.run({...cmd,memoryProof:{owner}})
 assert.equal(r.state,'OPERATOR_REVIEW_REQUIRED')
 assert.equal(f.calls.research,0)
})
test('subscription expiry during recall prevents starting AI',async()=>{
 const f=setup()
 f.deps.recall=async()=>{f.deps.now=()=>Date.parse('2026-10-02');return{ok:true,source:'SIBYL_VERIFIED_RECEIPTS',records:[]}}
 await f.run({requestId:'message_01',action:'RESEARCH',research:{marketId:'fixture-market',outcome:'Yes',side:'BUY'},useMemory:true,ownerAddress:owner,memoryProof:{owner}})
 assert.equal(f.calls.research,0)
})
test('same request cannot change intent and concurrent replays do not repeat research',async()=>{
 const f=setup()
 let release!:()=>void
 const waiting=new Promise<void>(resolve=>release=resolve)
 f.deps.research=async()=>{f.calls.research++;await waiting;return{ok:true}}
 const cmd={requestId:'message_01',action:'RESEARCH',research:{marketId:'fixture-market',outcome:'Yes',side:'BUY'},useMemory:false}
 const first=f.run(cmd)
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal((await f.run(cmd)).state,'RECONCILIATION_REQUIRED')
 await assert.rejects(f.run({...cmd,research:{...cmd.research,outcome:'No'}}),/different inputs/)
 release();await first
 assert.equal(f.calls.research,1)
})
test('uncertain result persistence blocks further operations instead of repeating side effects',async()=>{
 const f=setup()
 const original=f.deps.mutate
 let count=0
 f.deps.mutate=async(k,c)=>{if(++count===2)throw new Error('database unavailable');return original(k,c)}
 const cmd={requestId:'message_01',action:'RESEARCH',research:{marketId:'fixture-market',outcome:'Yes',side:'BUY'},useMemory:false}
 await assert.rejects(f.run(cmd),/database unavailable/)
 assert.equal((await f.run(cmd)).state,'RECONCILIATION_REQUIRED')
 await assert.rejects(f.run({...cmd,requestId:'message_02'}),/uncertain or running/)
 assert.equal(f.calls.research,1)
})
test('buy and sell preparation return previews without authorizing submission',async()=>{
 const f=setup()
 for(const side of ['BUY','SELL']){
  const r=await f.run({requestId:'preview_'+side,action:'PREPARE_TRADE',trade:{side}})
  assert.equal(r.state,'TRADE_PREVIEW');assert.equal(r.tradeAuthorized,false);assert.equal(r.orderSubmitted,false)
 }
 assert.equal(f.calls.buy,1);assert.equal(f.calls.sell,1)
})
test('inactive membership cannot research, recall, enroll or prepare',async()=>{
 const f=setup()
 const r=await runManagedSession({...subscription,status:'paused'}, {requestId:'message_01',action:'STATUS'},f.deps)
 assert.equal(r.state,'SUBSCRIPTION_INACTIVE')
 assert.equal(f.store.size,0)
})

test('existing enrolled preferences seed the conversation without repeated questions',async()=>{
 const f=setup()
 f.deps.status=async()=>({enrolled:true,subscriptionState:'active',monitoringEnabled:true,preferences:answers})
 const r=await f.run({requestId:'message_01',action:'PREFERENCES',answers:{profitThresholdPercent:30}})
 assert.equal(r.state,'CONFIRM_PREFERENCES')
 assert.equal(r.preferences.email,answers.email)
 assert.equal(r.questions.length,0)
})
test('local pause overrides an active marketplace subscription',async()=>{
 const f=setup()
 f.deps.status=async()=>({enrolled:true,subscriptionState:'paused'})
 const r=await f.run({requestId:'message_01',action:'PREPARE_TRADE',trade:{side:'BUY'}})
 assert.equal(r.state,'SUBSCRIPTION_INACTIVE')
 assert.equal(f.calls.buy,0)
})


test('managed receipt continuation replays without repeating completion and does not persist raw proofs',async()=>{
 const f=setup();let calls=0
 f.deps.continueTrade=async()=>{calls++;return{ok:true,state:'TRADE_COMPLETE',orderSubmitted:false,tradeAuthorized:false,followUpPrompts:['Show receipt?']}}
 const request={action:'CHECK_TRADE',requestId:'receipt_message_01',execution:{signature:'private-proof'}}
 assert.equal((await f.run(request)).state,'TRADE_COMPLETE')
 assert.equal((await f.run(request)).idempotentReplay,true)
 assert.equal(calls,1)
 assert.ok(!JSON.stringify([...f.store.values()]).includes('private-proof'))
})


test('managed local preparation returns an authorization artifact once without executing',async()=>{
 const f=setup();let calls=0
 f.deps.prepareLocal=async(_input,id)=>{calls++;return{ok:true,state:'BUYER_LOCAL_AUTHORIZATION_REQUIRED',requestId:id,orderSubmitted:false,tradeAuthorized:false,followUpPrompts:['Review and sign the exact owner authorization.']}}
 const request={action:'PREPARE_LOCAL_TRADE',requestId:'local_preview_message_01',trade:{ownerAddress:owner}}
 assert.equal((await f.run(request)).state,'BUYER_LOCAL_AUTHORIZATION_REQUIRED')
 assert.equal((await f.run(request)).idempotentReplay,true);assert.equal(calls,1)
})
