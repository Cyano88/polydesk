import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {claimExecution,recordSubmission} from './polymarket-execution-guard.mjs'
import {fillInterface,recoveryOrderId} from './polymarket-execution-recovery.mjs'
import {captureLocalExecution,reviewLocalMemory,verifiedLocalProjection,runBridge} from './polymarket-local-memory.mjs'
const tx='0x'+'34'.repeat(32),block='0x'+'56'.repeat(32)
const b={schema:'polydesk-order-binding-v1',executionId:'buyer:memory:test-001',owner:'0x'+'22'.repeat(20),conditionId:'0x'+'12'.repeat(32),exchange:'0xe111180000d2663c0091e4f400237545b87b996b',order:{salt:'9007199254740993',maker:'0x'+'11'.repeat(20),signer:'0x'+'11'.repeat(20),tokenId:'111',makerAmount:'3100000',takerAmount:'10000000',side:0,signatureType:3,timestamp:'1800000000000',metadata:'0x'+'00'.repeat(32),builder:'0x'+'ab'.repeat(32)}}
function fixture(binding=b){
 const id=recoveryOrderId(binding),o=binding.order
 const event=fillInterface.encodeEventLog(fillInterface.getEvent('OrderFilled'),[id,o.maker,binding.owner,o.side,o.tokenId,o.makerAmount,o.takerAmount,1000,o.builder,o.metadata])
 const receipt={status:'0x1',transactionHash:tx,transactionIndex:'0x0',blockHash:block,blockNumber:'0x64',logs:[{...event,address:binding.exchange,removed:false,transactionHash:tx,transactionIndex:'0x0',blockHash:block,blockNumber:'0x64',logIndex:'0x1'}]}
 const evidence={receipt,chainId:'0x89',canonicalBlockHash:block,finalizedBlock:'0x65',canonicalBlock:{hash:block,number:'0x64',transactions:[tx]},finalizedHeader:{hash:'0x'+'77'.repeat(32),number:'0x65'}}
 const order={id,maker_address:o.maker,asset_id:o.tokenId,market:binding.conditionId,side:o.side===0?'BUY':'SELL',original_size:'10',size_matched:'10',price:'0.31',status:'MATCHED',associate_trades:['trade-1']}
 return {evidence,order,deps:{readOrder:async()=>order,readTrade:async()=>({id:'trade-1',taker_order_id:id,transaction_hash:tx}),readReceipt:async()=>evidence}}
}
function ledger(t,binding=b){const dir=mkdtempSync(join(tmpdir(),'polydesk-local-memory-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const claim=claimExecution(dir,binding.executionId,['synthetic']);writeFileSync(claim.record+'.binding.json',JSON.stringify(binding));recordSubmission(claim,recoveryOrderId(binding));return {dir,claim}}
function bridge(){const rows=new Map();return async(action,payload)=>{if(action==='capture'){const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');if(rows.has(payload.executionId))assert.deepEqual(rows.get(payload.executionId),payload);rows.set(payload.executionId,payload);return {ok:true,payloadHash:hash}}return {ok:true,records:payload.records.map(r=>rows.get(r.executionId))}}}
test('verified BUY and SELL projections retain local provenance and no governed authority',async()=>{
 for(const binding of [b,{...b,order:{...b.order,side:1,makerAmount:'10000000',takerAmount:'3100000'}}]){const p=await verifiedLocalProjection(binding,fixture(binding).deps);assert.equal(p.governedAuthorityVerified,false);assert.equal(p.signingAuthorized,false);assert.equal(p.matchedSharesRaw,'10000000');assert.equal(p.fills.length,1)}
})
test('memory rejects incomplete canonical evidence and nonterminal orders',async()=>{
 for(const alter of [f=>f.evidence.chainId='0x1',f=>f.evidence.canonicalBlock.transactions=[],f=>f.evidence.receipt.logs[0].removed=true,f=>delete f.evidence.receipt.logs[0].blockHash,f=>f.evidence.finalizedHeader.number='0x63',f=>f.order.status='LIVE',f=>f.evidence.receipt.status='0x0']){const f=fixture();alter(f);await assert.rejects(verifiedLocalProjection(b,f.deps))}
})
test('capture is idempotent and recall changes decision without granting authority',async t=>{const {dir}=ledger(t),sdk=bridge();await captureLocalExecution(dir,b.executionId,sdk,async()=>fixture().deps);await captureLocalExecution(dir,b.executionId,sdk,async()=>fixture().deps);const r=await reviewLocalMemory(dir,b.owner,'111',sdk);assert.equal(r.state,'LOCAL_MEMORY_RECONCILIATION_REQUIRED');assert.equal(r.signingAuthorized,false);assert.equal((await reviewLocalMemory(dir,b.owner,'222',sdk)).state,'LOCAL_HISTORY_REVIEWED_NOT_AUTHORIZED');assert.equal((await reviewLocalMemory(dir,'0x'+'33'.repeat(20),'111',sdk)).matchingExecutionIds.length,0)})
test('capture outage retains inventory and prevents empty-history success',async t=>{const {dir,claim}=ledger(t);await assert.rejects(captureLocalExecution(dir,b.executionId,async()=>{throw Error('outage')},async()=>fixture().deps));assert.equal(JSON.parse(readFileSync(claim.record)).state,'SUBMITTED');assert.ok(readFileSync(claim.record+'.memory.json'));await assert.rejects(reviewLocalMemory(dir,b.owner,'111',async()=>({ok:true,records:[]})))})
test('uncaptured execution and changed binding block recall',async t=>{const {dir,claim}=ledger(t),sdk=bridge();await assert.rejects(reviewLocalMemory(dir,b.owner,'111',sdk));await captureLocalExecution(dir,b.executionId,sdk,async()=>fixture().deps);writeFileSync(claim.record+'.binding.json',JSON.stringify({...b,conditionId:'0x'+'99'.repeat(32)}));await assert.rejects(reviewLocalMemory(dir,b.owner,'111',sdk))})
test('real SDK capture and separate Node process recall with synthetic finalized evidence',{skip:process.env.POLYDESK_TEST_REAL_SIBYL!=='1'},async t=>{
 const {dir,claim}=ledger(t)
 // First simulate unavailable memory. The durable receipt and expected inventory survive.
 await assert.rejects(captureLocalExecution(dir,b.executionId,async()=>{throw Error('synthetic SDK outage')},async()=>fixture().deps))
 assert.equal(JSON.parse(readFileSync(claim.record)).state,'SUBMITTED')
 await captureLocalExecution(dir,b.executionId,runBridge,async()=>fixture().deps)
 await captureLocalExecution(dir,b.executionId,runBridge,async()=>fixture().deps)
 const code="import {reviewLocalMemory} from './scripts/polymarket-local-memory.mjs'; console.log(JSON.stringify(await reviewLocalMemory(process.argv[1],process.argv[2],process.argv[3])))"
 const child=spawnSync(process.execPath,['--input-type=module','-e',code,dir,b.owner,'111'],{encoding:'utf8',env:process.env,windowsHide:true,timeout:45000})
 assert.equal(child.status,0,child.stderr);const r=JSON.parse(child.stdout);assert.equal(r.state,'LOCAL_MEMORY_RECONCILIATION_REQUIRED');assert.equal(r.source,'SIBYL_LOCAL_FINALIZED_FILLS');assert.equal(r.signingAuthorized,false)
 const missing=spawnSync(process.execPath,['--input-type=module','-e',code,dir,b.owner,'111'],{encoding:'utf8',env:{...process.env,POLYDESK_LOCAL_MEMORY_ROOT:process.env.POLYDESK_LOCAL_MEMORY_ROOT+'/missing-test-store'},windowsHide:true,timeout:45000})
 assert.notEqual(missing.status,0,'Missing expected memory must not become an empty-history success')
 const restored=spawnSync(process.execPath,['--input-type=module','-e',code,dir,b.owner,'111'],{encoding:'utf8',env:process.env,windowsHide:true,timeout:45000})
 assert.equal(restored.status,0,restored.stderr)
 assert.equal(JSON.parse(restored.stdout).state,'LOCAL_MEMORY_RECONCILIATION_REQUIRED')
 console.log(JSON.stringify({syntheticOnly:true,realSdk:true,freshNodeProcess:true,memoryOnlyRetryVerified:true,duplicateCaptureVerified:true,missingMemoryBlocks:true,restoredMemoryRecalls:true,decision:r.state,orderSubmitted:false}))
})

test('conflicting verified fee cannot overwrite a captured projection',async t=>{
 const {dir,claim}=ledger(t),sdk=bridge();await captureLocalExecution(dir,b.executionId,sdk,async()=>fixture().deps)
 const original=readFileSync(claim.record+'.memory.json','utf8'),f=fixture()
 const event=fillInterface.encodeEventLog(fillInterface.getEvent('OrderFilled'),[recoveryOrderId(b),b.order.maker,b.owner,0,b.order.tokenId,b.order.makerAmount,b.order.takerAmount,2000,b.order.builder,b.order.metadata])
 Object.assign(f.evidence.receipt.logs[0],event)
 await assert.rejects(captureLocalExecution(dir,b.executionId,sdk,async()=>f.deps),/conflict/)
 assert.equal(readFileSync(claim.record+'.memory.json','utf8'),original)
})
