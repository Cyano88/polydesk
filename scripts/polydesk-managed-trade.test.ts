import test from 'node:test'
import assert from 'node:assert/strict'
import { Wallet } from 'ethers'
import { continueManagedTrade, managedTradeAccessMessage, type ManagedTradeDeps } from '../api/polydesk-managed-trade.js'
const identity={jobId:'managed_test_job',buyerAgentId:'9001'}
const now=Date.parse('2026-09-10T12:00:00Z')
const executionId='pex_'+'a'.repeat(24)
async function fixture() {
 const wallet=Wallet.createRandom(),owner=wallet.address.toLowerCase()
 const input:any={executionId,owner,expiresAt:now+60000}
 let record:any={executionId,authoritySigner:owner,decision:'APPROVE'}
 let completed=0
 const deps:ManagedTradeDeps={now:()=>now,read:async()=>record,complete:async()=>{completed++;return{ok:false,httpStatus:409}}}
 const sign=async()=>{input.signature=await wallet.signMessage(managedTradeAccessMessage(identity,input));return input}
 const receipt=()=>({executionId,status:'VERIFIED_FILLED',finality:{blockNumber:'100'},proofs:{polygonFinalityVerified:true,exactSignedOrderVerified:true,buyerAuthoritySignatureVerified:true}})
 return{wallet,input,deps,sign,receipt,get record(){return record},set record(v:any){record=v},get completed(){return completed}}
}
test('approved execution without receipt is not treated as submitted or settled',async()=>{
 const f=await fixture();const r=await continueManagedTrade(identity,await f.sign(),f.deps)
 assert.equal(r.state,'SETTLEMENT_UNCONFIRMED');assert.equal(r.orderSubmitted,false);assert.equal(r.tradeAuthorized,false);assert.ok(r.followUpPrompts.length)
})
test('owner proof binds subscription, buyer, execution and completion evidence',async()=>{
 const f=await fixture();await f.sign()
 for(const changed of [{...identity,jobId:'another_job'},{...identity,buyerAgentId:'2'}])await assert.rejects(continueManagedTrade(changed,f.input,f.deps))
 await assert.rejects(continueManagedTrade(identity,{...f.input,executionId:'pex_'+'b'.repeat(24)},f.deps))
 await assert.rejects(continueManagedTrade(identity,{...f.input,completion:{orderId:'0x'+'1'.repeat(64),transactionHash:'0x'+'2'.repeat(64)}},f.deps))
 assert.equal(f.completed,0)
})
test('expired or overlong proof and another execution owner fail before completion',async()=>{
 const f=await fixture()
 for(const expiry of [now,now+300001]){f.input.expiresAt=expiry;await assert.rejects(continueManagedTrade(identity,await f.sign(),f.deps))}
 f.input.expiresAt=now+60000;f.record.authoritySigner='0x'+'1'.repeat(40)
 await assert.rejects(continueManagedTrade(identity,await f.sign(),f.deps));assert.equal(f.completed,0)
})
test('completion uses exact supplied evidence and retains pending result without submitting',async()=>{
 const f=await fixture();f.input.completion={orderId:'0x'+'1'.repeat(64),transactionHash:'0x'+'2'.repeat(64)}
 const r=await continueManagedTrade(identity,await f.sign(),f.deps)
 assert.equal(r.state,'RECEIPT_PENDING');assert.equal(r.automaticRetryAllowed,false);assert.equal(f.completed,1)
})
test('verified stored receipt gives follow-ups without claiming Sibyl synchronization',async()=>{
 const f=await fixture();f.record.receipt=f.receipt()
 const r=await continueManagedTrade(identity,await f.sign(),f.deps)
 assert.equal(r.state,'TRADE_COMPLETE');assert.equal(r.memory?.state,'NOT_CHECKED');assert.equal(f.completed,0)
 assert.equal(r.receipt?.executionId,executionId)
})
test('legacy and mismatched receipts cannot complete a managed trade',async()=>{
 const f=await fixture()
 for(const receipt of [{...f.receipt(),finality:null},{...f.receipt(),executionId:'pex_'+'b'.repeat(24)},{...f.receipt(),proofs:{}}]){
  f.record.receipt=receipt
  assert.equal((await continueManagedTrade(identity,await f.sign(),f.deps)).state,'RECEIPT_REVERIFICATION_REQUIRED')
 }
})
test('completion must be persisted before managed flow reports complete',async()=>{
 const f=await fixture();f.input.completion={orderId:'0x'+'1'.repeat(64),transactionHash:'0x'+'2'.repeat(64)}
 f.deps.complete=async()=>({ok:true,receipt:f.receipt()})
 assert.equal((await continueManagedTrade(identity,await f.sign(),f.deps)).state,'SETTLEMENT_UNCONFIRMED')
 f.deps.complete=async()=>{f.record.receipt=f.receipt();return{ok:true}}
 assert.equal((await continueManagedTrade(identity,await f.sign(),f.deps)).state,'TRADE_COMPLETE')
})

test('access expiring during lookup cannot start completion',async()=>{
 const f=await fixture();f.input.completion={orderId:'0x'+'1'.repeat(64),transactionHash:'0x'+'2'.repeat(64)}
 f.deps.read=async()=>{f.deps.now=()=>now+60001;return f.record}
 await assert.rejects(continueManagedTrade(identity,await f.sign(),f.deps));assert.equal(f.completed,0)
})


test('unsigned receipt request returns a concrete owner prompt without reading private execution data',async()=>{
 const f=await fixture();let reads=0;f.deps.read=async()=>{reads++;return f.record}
 const r=await continueManagedTrade(identity,f.input,f.deps)
 assert.equal(r.state,'OWNER_AUTHORIZATION_REQUIRED');assert.equal(r.authorizationMessage,managedTradeAccessMessage(identity,f.input))
 assert.equal(reads,0);assert.equal(f.completed,0);assert.equal(r.orderSubmitted,false)
})
