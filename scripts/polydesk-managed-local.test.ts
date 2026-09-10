import test from 'node:test'
import assert from 'node:assert/strict'
import { Wallet } from 'ethers'
import { managedLocalOrderMessage,runManagedLocalOrder,type ManagedLocalOrder,type ManagedLocalDeps } from '../api/polydesk-managed-local-order.js'
async function fixture(){
 const wallet=Wallet.createRandom(),now=Date.now()
 const order:ManagedLocalOrder={schema:'polydesk-managed-local-buy-v1',jobId:'0x'+'1'.repeat(64),buyerAgentId:'9001',executionId:'managed_order_01',owner:wallet.address.toLowerCase(),wallet:'0x'+'2'.repeat(40),marketSlug:'synthetic-market',outcome:'Yes',tokenId:'123',conditionId:'0x'+'3'.repeat(64),maxTotalUsdc:'4',orderAmountUsdc:'3',maximumPrice:'0.5',expiresAt:now+60000,side:'BUY',orderType:'FOK'}
 let submitted=0
 const preview:any={ok:true,publicChecksPassed:true,owner:order.owner,wallet:order.wallet,tokenId:order.tokenId,conditionId:order.conditionId,marketSlug:order.marketSlug,outcome:order.outcome,orderType:'FOK',postOnly:false,limitPrice:'0.5',orderAmount:'3',requiredBalance:'3.3',checkedAt:new Date(now).toISOString(),validUntil:new Date(now+30000).toISOString()}
 const deps:ManagedLocalDeps={now:()=>now,active:async()=>true,owner:async()=>order.owner,preflight:async()=>preview,submit:async(_o,args,c)=>{submitted++;assert.ok(!args.includes('--approve'));assert.equal(c.maxTotalRaw,'4000000');assert.equal(c.maxOrderRaw,'3000000');return{state:'SUBMITTED'}}}
 return {order,preview,deps,sign:()=>wallet.signMessage(managedLocalOrderMessage(order)),get submitted(){return submitted}}
}
test('dry-run returns exact signing prompt without touching wallet or subscription',async()=>{
 const f=await fixture();f.deps.active=async()=>{throw Error('must not call')};f.deps.owner=async()=>{throw Error('must not call')}
 const r=await runManagedLocalOrder(f.order,undefined,false,f.deps);assert.equal(r.state,'BUYER_AUTHORIZATION_REQUIRED');assert.equal(f.submitted,0)
})
test('signed exact order passes bounded native constraints and remains receipt-pending',async()=>{
 const f=await fixture();const r=await runManagedLocalOrder(f.order,await f.sign(),true,f.deps);assert.equal(r.state,'SUBMISSION_REQUIRES_RECEIPT');assert.equal(r.automaticRetryAllowed,false);assert.equal(f.submitted,1)
})
test('changed caps, foreign wallet and inactive subscription never submit',async()=>{
 const f=await fixture();const signature=await f.sign()
 await assert.rejects(runManagedLocalOrder({...f.order,maxTotalUsdc:'5'},signature,true,f.deps))
 f.deps.owner=async()=> '0x'+'9'.repeat(40);await assert.rejects(runManagedLocalOrder(f.order,signature,true,f.deps))
 f.deps.active=async()=>false;await assert.rejects(runManagedLocalOrder(f.order,signature,true,f.deps));assert.equal(f.submitted,0)
})
test('changed readiness identity, fee growth, stale feed and rounded size require new approval',async()=>{
 for(const [field,value]of Object.entries({tokenId:'456',conditionId:'other',orderAmount:'3.01',requiredBalance:'4.01',limitPrice:'0.6',checkedAt:'invalid',validUntil:'invalid',postOnly:true})){
  const f=await fixture();f.preview[field]=value;await assert.rejects(runManagedLocalOrder(f.order,await f.sign(),true,f.deps),field);assert.equal(f.submitted,0)
 }
})
test('expiry or subscription cancellation during preflight blocks execution',async()=>{
 const f=await fixture();f.deps.preflight=async()=>{f.deps.now=()=>f.order.expiresAt;return f.preview}
 await assert.rejects(runManagedLocalOrder(f.order,await f.sign(),true,f.deps));assert.equal(f.submitted,0)
 const g=await fixture();let active=0;g.deps.active=async()=>++active===1
 await assert.rejects(runManagedLocalOrder(g.order,await g.sign(),true,g.deps));assert.equal(g.submitted,0)
})
test('unknown fields and non-FOK policies cannot enter the local adapter',async()=>{
 const f=await fixture();assert.throws(()=>managedLocalOrderMessage({...f.order,command:'danger'} as any));assert.throws(()=>managedLocalOrderMessage({...f.order,orderType:'GTC'} as any))
})
test('managed preparation returns an exact owner signing artifact without executing',async()=>{
 const f=await fixture()
 const {prepareManagedLocalOrder}=await import('../api/polydesk-managed-local-order.js')
 const input={ownerAddress:f.order.owner,marketSlug:f.order.marketSlug,outcome:f.order.outcome,maxTotalUsdc:'4',limitPrice:'0.5',acknowledgeIndependentDecision:true}
 const result=await prepareManagedLocalOrder(f.order,'message_01',input,async()=>f.preview,f.deps.now)
 assert.equal(result.state,'BUYER_LOCAL_AUTHORIZATION_REQUIRED');assert.equal(result.order?.orderAmountUsdc,'3');assert.equal(result.orderSubmitted,false)
 await assert.rejects(prepareManagedLocalOrder(f.order,'message_01',{...input,acknowledgeIndependentDecision:false},async()=>f.preview,f.deps.now))
})

test('native managed receipt verifies exact finalized fill and actual fee without claiming Sibyl delivery',async t=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs')
 const {join}=await import('node:path');const {tmpdir}=await import('node:os')
 const {claimExecution,recordSubmission}=await import('./polymarket-execution-guard.mjs')
 const {fillInterface,recoveryOrderId}=await import('./polymarket-execution-recovery.mjs')
 const {checkManagedLocalReceipt}=await import('./polydesk-managed-local-receipt.mjs')
 const f=await fixture(),dir=mkdtempSync(join(tmpdir(),'polydesk-managed-receipt-'))
 t.after(()=>rmSync(dir,{recursive:true,force:true}))
 const binding={schema:'polydesk-order-binding-v1',executionId:f.order.executionId,owner:f.order.owner,conditionId:f.order.conditionId,exchange:'0xe111180000d2663c0091e4f400237545b87b996b',order:{salt:'1',maker:f.order.wallet,signer:f.order.wallet,tokenId:f.order.tokenId,makerAmount:'3000000',takerAmount:'6000000',side:0,signatureType:3,timestamp:String(f.deps.now()),metadata:'0x'+'0'.repeat(64),builder:'0x'+'a'.repeat(64)}}
 const claim=claimExecution(dir,f.order.executionId,['synthetic-only'])
 writeFileSync(claim.record+'.binding.json',JSON.stringify(binding))
 const id=recoveryOrderId(binding);recordSubmission(claim,id)
 const tx='0x'+'4'.repeat(64),block='0x'+'5'.repeat(64)
 let fee=1000n
 const deps=async()=>({readOrder:async()=>({id,maker_address:f.order.wallet,asset_id:f.order.tokenId,market:f.order.conditionId,side:'BUY',original_size:'6',size_matched:'6',price:'0.5',status:'MATCHED',associate_trades:['test-trade']}),readTrade:async()=>({id:'test-trade',taker_order_id:id,transaction_hash:tx}),readReceipt:async()=>({receipt:{status:'0x1',transactionHash:tx,blockHash:block,blockNumber:'0x64',logs:[{...fillInterface.encodeEventLog(fillInterface.getEvent('OrderFilled'),[id,f.order.wallet,f.order.owner,0,f.order.tokenId,3000000,6000000,fee,binding.order.builder,binding.order.metadata]),address:binding.exchange,transactionHash:tx,logIndex:'0x1'}]},canonicalBlockHash:block,finalizedBlock:'0x65'})})
 const signature=await f.sign(),message=managedLocalOrderMessage(f.order)
 const result=await checkManagedLocalReceipt(dir,f.order,signature,message,deps)
 assert.equal(result.settlementVerified,true);assert.equal(result.actualTotalDebitRaw,'3001000');assert.equal(result.memoryStatus,'NOT_SYNCHRONIZED');assert.ok(result.followUpPrompts.length)
 fee=1000001n;await assert.rejects(checkManagedLocalReceipt(dir,f.order,signature,message,deps),/exceeds/)
})
test('real buyer-local CLI dry-run returns a reviewable message without wallet access',async t=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {join,resolve}=await import('node:path');const {tmpdir}=await import('node:os')
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util')
 const f=await fixture(),dir=mkdtempSync(join(tmpdir(),'polydesk-managed-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}))
 const request=join(dir,'request.json');writeFileSync(request,JSON.stringify({order:f.order}))
 const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx',resolve('scripts/polydesk-managed-local.ts'),'--request',request],{timeout:30000,windowsHide:true})
 const output=JSON.parse(stdout);assert.equal(output.state,'BUYER_AUTHORIZATION_REQUIRED');assert.equal(output.authorizationMessage,managedLocalOrderMessage(f.order));assert.equal(output.orderSubmitted,false)
})