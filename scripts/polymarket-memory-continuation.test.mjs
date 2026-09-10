import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseIntent,evaluateContinuation} from './polymarket-memory-continuation.mjs'
const intent=parseIntent(['buy','--market-id','test-market','--outcome','Yes','--amount','3.1','--price','0.31','--order-type','FOK'])
const identity={owner:'0x'+'11'.repeat(20),wallet:'0x'+'22'.repeat(20),tokenId:'111'}
const memory=(net='0',ids=['buy:001','sell:001'])=>({ok:true,source:'SIBYL_LOCAL_FINALIZED_FILLS',state:'LOCAL_MEMORY_RECONCILIATION_REQUIRED',rememberedNetRaw:net,matchingExecutionIds:ids})
const deps=(m=memory(),position=0n)=>({review:async()=>m,position:async()=>position})
test('remembered closed cycle permits normal checks without granting trading authority',async()=>{
 const r=await evaluateContinuation(intent,identity,deps());assert.equal(r.state,'MEMORY_RECONCILED_CLOSED');assert.equal(r.memoryGatePassed,true);assert.equal(r.signingAuthorized,false)
})
test('deleting or bypassing memory cannot permit continuation',async()=>{
 let positionCalls=0
 for(const review of [async()=>{throw Error('deleted memory')},async()=>undefined,async()=>({ok:true}),async()=>({...memory(),rememberedNetRaw:undefined})])await assert.rejects(evaluateContinuation(intent,identity,{review,position:async()=>{positionCalls++;return 0n}}))
 assert.equal(positionCalls,0)
})
test('missing SELL memory changes closed account into a blocked mismatch',async()=>{
 const r=await evaluateContinuation(intent,identity,deps(memory('10000000',['buy:001']),0n));assert.equal(r.memoryGatePassed,false);assert.equal(r.state,'MEMORY_POSITION_MISMATCH')
})
test('additional buy requires exact exposure review and stale acknowledgement fails',async()=>{
 const d=deps(memory('10000000',['buy:001']),10000000n),r=await evaluateContinuation(intent,identity,d)
 assert.equal(r.state,'EXISTING_EXPOSURE_REVIEW_REQUIRED')
 assert.equal((await evaluateContinuation(intent,identity,d,r.reviewDigest)).memoryGatePassed,true)
 assert.equal((await evaluateContinuation({...intent,quantity:'4'},identity,d,r.reviewDigest)).memoryGatePassed,false)
 assert.equal((await evaluateContinuation(intent,identity,deps(memory('10000000',['buy:002']),10000000n),r.reviewDigest)).memoryGatePassed,false)
})
test('sell respects exact reconciled token quantity and new external positions block',async()=>{
 const sell={...intent,side:'SELL',quantity:'10'}
 assert.equal((await evaluateContinuation(sell,identity,deps(memory('10000000'),10000000n))).memoryGatePassed,true)
 assert.equal((await evaluateContinuation({...sell,quantity:'10.000001'},identity,deps(memory('10000000'),10000000n))).memoryGatePassed,false)
 assert.equal((await evaluateContinuation(intent,identity,deps(memory('0'),10000000n))).state,'MEMORY_POSITION_MISMATCH')
})
test('fresh position failure blocks and no-history onboarding requires zero position',async()=>{
 await assert.rejects(evaluateContinuation(intent,identity,{review:async()=>memory(),position:async()=>{throw Error('rpc unavailable')}}))
 const empty={ok:true,state:'LOCAL_HISTORY_NOT_INITIALIZED',source:'LOCAL_EXECUTION_LEDGER',matchingExecutionIds:[]}
 assert.equal((await evaluateContinuation(intent,identity,deps(empty))).memoryGatePassed,true)
 assert.equal((await evaluateContinuation(intent,identity,deps(empty,1n))).memoryGatePassed,false)
})
test('overriding intent arguments are rejected',()=>{
 for(const extra of [['--token-id','111'],['--mode','eoa'],['--price','0.4'],['--dry-run']])assert.throws(()=>parseIntent(['buy','--market-id','test','--outcome','Yes','--amount','3','--price','0.3','--order-type','FOK',...extra]))
})
test('supported live launcher fails closed at memory gate before executor',()=>{
 const source=readFileSync(new URL('./polymarket-wsl.ps1',import.meta.url),'utf8').split('if ($taskLiveOrder) {')[1]
 assert.ok(source.indexOf('polymarket-memory-continuation.mjs')<source.indexOf('polymarket-execution-guard.mjs'))
 assert.match(source,/if \(\$LASTEXITCODE -ne 0\) \{ throw 'Required Sibyl/)
})
