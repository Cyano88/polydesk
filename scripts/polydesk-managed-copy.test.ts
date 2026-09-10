import test from 'node:test'
import assert from 'node:assert/strict'
import { Wallet } from 'ethers'
import { managedCopyPolicyMessage, managedCopyRevocationMessage, processManagedCopySignal, revokeManagedCopyPolicy, type ManagedCopyPolicy, type ManagedCopyDeps, type CopyLedger, type VerifiedCopyReceipt } from '../api/polydesk-managed-copy.js'
async function fixture(){
 const wallet=Wallet.createRandom()
 const now=Date.parse('2026-09-10T12:00:00Z')
 const policy:ManagedCopyPolicy={schema:'polydesk-managed-copy-policy-v1',jobId:'managed_fixture',buyerAgentId:'9001',owner:wallet.address.toLowerCase(),sourceWallet:'0x'+'2'.repeat(40),nonce:'policy_0001',perTradeUsdc:'2',dailyCapUsdc:'3',maximumPrice:'0.40',maximumTrades:2,issuedAt:now-1000,expiresAt:now+3600000,side:'BUY',orderType:'FOK'}
 const signature=await wallet.signMessage(managedCopyPolicyMessage(policy))
 const store=new Map<string,CopyLedger>(), receipts=new Map<string,VerifiedCopyReceipt>()
 let executions=0
 const deps:ManagedCopyDeps={
  now:()=>now,active:async()=>true,
  mutate:async(k,change)=>{const v=change(structuredClone(store.get(k)));store.set(k,structuredClone(v));return structuredClone(v)},
  signal:async(sourceWallet,id)=>({id,sourceWallet,side:'BUY',tokenId:'123',conditionId:'0x'+'3'.repeat(64),observedAt:now}),
  prepare:async signal=>({owner:policy.owner,tokenId:signal.tokenId,conditionId:signal.conditionId,side:'BUY',orderType:'FOK',price:'0.35',maximumCostUsdc:'2',expiresAt:now+30000,ready:true}),
  execute:async(executionId,plan)=>{executions++;receipts.set(executionId,{verified:true,finalized:true,executionId,owner:plan.owner,tokenId:plan.tokenId,conditionId:plan.conditionId,side:'BUY',orderId:'0x'+'4'.repeat(64),transactionHash:'0x'+'5'.repeat(64),spentUsdc:'1.95'})},
  reconcile:async id=>receipts.get(id)??null,
 }
 return{wallet,policy,signature,deps,store,receipts,executions:()=>executions,run:(id='signal_0001')=>processManagedCopySignal(policy,signature,id,deps)}
}
test('simulated policy-to-fill-to-receipt-to-follow-up executes once',async()=>{
 const f=await fixture()
 const first=await f.run()
 assert.equal(first.state,'COMPLETE')
 assert.equal(first.receipt.spentUsdc,'1.95')
 assert.ok(first.followUpPrompts.includes('Show the verified trade receipt?'))
 const replay=await f.run()
 assert.equal(replay.idempotentReplay,true)
 assert.equal(f.executions(),1)
 assert.ok(!JSON.stringify([...f.store.values()]).includes(f.signature))
})
test('fee-inclusive reservations enforce the daily cap',async()=>{
 const f=await fixture()
 await f.run()
 await assert.rejects(f.run('signal_0002'),/budget or trade count/)
 assert.equal(f.executions(),1)
})
test('wrong owner or changed limits cannot use an old signature',async()=>{
 const f=await fixture()
 await assert.rejects(processManagedCopySignal({...f.policy,dailyCapUsdc:'30'},f.signature,'signal_0001',f.deps),/owner mismatch/)
 assert.equal(f.executions(),0)
})
test('expired or paused policies cannot execute new signals',async()=>{
 const f=await fixture()
 f.deps.now=()=>f.policy.expiresAt+1
 assert.equal((await f.run()).state,'POLICY_INACTIVE')
 f.deps.now=()=>f.policy.issuedAt+1000
 f.deps.active=async()=>false
 assert.equal((await f.run()).state,'POLICY_INACTIVE')
 assert.equal(f.executions(),0)
})
test('observed source, signal identity and pre-authorization history are verified',async()=>{
 const f=await fixture()
 const original=f.deps.signal
 f.deps.signal=async(s,id)=>({...await original(s,id),sourceWallet:f.policy.owner})
 await assert.rejects(f.run(),/Observed signal/)
 f.deps.signal=async(s,id)=>({...await original(s,id),observedAt:f.policy.issuedAt-1})
 await assert.rejects(f.run(),/Observed signal/)
 assert.equal(f.executions(),0)
})
test('over-budget, wrong-owner and expired previews block execution',async()=>{
 for(const change of [{maximumCostUsdc:'2.01'},{owner:'0x'+'6'.repeat(40)},{expiresAt:1},{price:'0.41'},{orderType:'FAK'}]){
  const f=await fixture();const original=f.deps.prepare
  f.deps.prepare=async(s,p)=>({...await original(s,p),...change} as any)
  assert.equal((await f.run()).state,'READINESS_BLOCKED');assert.equal(f.executions(),0)
 }
})
test('uncertain submission never auto-resubmits and blocks another signal',async()=>{
 const f=await fixture()
 let attempts=0
 f.deps.execute=async()=>{attempts++;throw new Error('connection lost after submission')}
 assert.equal((await f.run()).state,'UNCERTAIN')
 assert.equal((await f.run()).state,'UNCERTAIN')
 await assert.rejects(f.run('signal_0002'),/unresolved execution/)
 assert.equal(attempts,1)
})
test('finalized reconciliation can resolve an uncertain order after policy expiry',async()=>{
 const f=await fixture()
 const execute=f.deps.execute
 f.deps.reconcile=async()=>null
 assert.equal((await f.run()).state,'UNCERTAIN')
 f.deps.now=()=>f.policy.expiresAt+1
 f.deps.reconcile=async id=>f.receipts.get(id)??null
 assert.equal((await f.run()).state,'COMPLETE')
 assert.equal(f.executions(),1)
})
test('unfinalized or mismatched receipts leave execution uncertain',async()=>{
 const f=await fixture()
 f.deps.reconcile=async id=>({...f.receipts.get(id)!,finalized:false} as any)
 assert.equal((await f.run()).state,'UNCERTAIN')
 f.deps.reconcile=async id=>({...f.receipts.get(id)!,spentUsdc:'5'})
 assert.equal((await f.run()).state,'UNCERTAIN')
 assert.equal(f.executions(),1)
})
test('revocation needs its own signature and prevents new copies',async()=>{
 const f=await fixture()
 await assert.rejects(revokeManagedCopyPolicy(f.policy,f.signature,f.deps),/revocation required/)
 const revoke=await f.wallet.signMessage(managedCopyRevocationMessage(f.policy))
 await revokeManagedCopyPolicy(f.policy,revoke,f.deps)
 assert.equal((await f.run()).state,'POLICY_INACTIVE')
 assert.equal(f.executions(),0)
})
test('concurrent signals share atomic budgets and an unresolved-execution lock',async()=>{
 const f=await fixture()
 let release!:()=>void
 const pending=new Promise<void>(resolve=>release=resolve)
 const execute=f.deps.execute
 f.deps.execute=async(id,p)=>{await pending;await execute(id,p)}
 const first=f.run()
 await new Promise(resolve=>setTimeout(resolve,20))
 await assert.rejects(f.run('signal_0002'),/unresolved execution/)
 release()
 assert.equal((await first).state,'COMPLETE')
 assert.equal(f.executions(),1)
})
