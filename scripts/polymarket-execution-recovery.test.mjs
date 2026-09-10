import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {claimExecution,executionStatus,recordSubmission} from './polymarket-execution-guard.mjs'
import {recoveryOrderId,reconcileEvidence,recoverPending,fillInterface} from './polymarket-execution-recovery.mjs'
const tx='0x'+'34'.repeat(32),block='0x'+'56'.repeat(32)
const binding={schema:'polydesk-order-binding-v1',executionId:'buyer:recovery:001',owner:'0x2222222222222222222222222222222222222222',conditionId:'0x'+'12'.repeat(32),exchange:'0xe111180000d2663c0091e4f400237545b87b996b',
 order:{salt:'9007199254740993',maker:'0x1111111111111111111111111111111111111111',signer:'0x1111111111111111111111111111111111111111',tokenId:'111',makerAmount:'3100000',takerAmount:'10000000',side:0,signatureType:3,timestamp:'1800000000000',metadata:'0x'+'00'.repeat(32),builder:'0x'+'ab'.repeat(32)}}
function fixture(b=binding,status='MATCHED',matched='10'){
 const id=recoveryOrderId(b)
 const order={id,maker_address:b.order.maker,asset_id:b.order.tokenId,market:b.conditionId,side:b.order.side===0?'BUY':'SELL',original_size:'10',size_matched:matched,price:'0.31',status,associate_trades:matched==='0'?[]:['trade-1']}
 const amount=BigInt(matched)*1000000n,cost=amount*31n/100n
 const encoded=fillInterface.encodeEventLog(fillInterface.getEvent('OrderFilled'),[id,b.order.maker,b.owner,b.order.side,b.order.tokenId,b.order.side===0?cost:amount,b.order.side===0?amount:cost,1000,b.order.builder,b.order.metadata])
 const receipt={status:'0x1',transactionHash:tx,blockHash:block,blockNumber:'0x64',logs:[{...encoded,address:b.exchange,transactionHash:tx,logIndex:'0x1'}]}
 const evidence={receipt,canonicalBlockHash:block,finalizedBlock:'0x65'}
 return {order,evidence,deps:{readOrder:async()=>order,readTrade:async()=>({id:'trade-1',taker_order_id:id,transaction_hash:tx}),readReceipt:async()=>evidence}}
}
function ledger(t,b=binding){const dir=mkdtempSync(join(tmpdir(),'polydesk-recovery-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const claim=claimExecution(dir,b.executionId,['fake']);writeFileSync(`${claim.record}.binding.json`,JSON.stringify(b));return {dir,claim}}
test('recover exact finalized BUY and SELL fills including fees',async()=>{
 for(const b of [binding,{...binding,order:{...binding.order,side:1,makerAmount:'10000000',takerAmount:'3100000'}}]){
  const result=await reconcileEvidence(b,fixture(b).deps)
  assert.equal(result.state,'FILLED');assert.equal(result.matchedSharesRaw,'10000000');assert.equal(result.collateralRaw,'3100000');assert.equal(result.feeRaw,'1000');assert.equal(result.retryAuthorized,false)
 }
})
test('open and explicitly canceled orders resolve without pretending a fill',async()=>{
 for(const [status,state] of [['LIVE','OPEN'],['CANCELED','CANCELED_UNFILLED']]){
  const f=fixture(binding,status,'0');f.deps.readReceipt=async()=>{throw new Error('must not read receipt')}
  assert.equal((await reconcileEvidence(binding,f.deps)).state,state)
 }
 assert.equal((await reconcileEvidence(binding,fixture(binding,'CANCELED','5').deps)).state,'CANCELED_PARTIALLY_FILLED')
 assert.equal((await reconcileEvidence(binding,fixture(binding,'LIVE','5').deps)).state,'OPEN_PARTIALLY_FILLED')
})
test('not found, timeout, unknown status and wrong order identity remain unresolved',async()=>{
 for(const change of [{id:'wrong'},{maker_address:binding.owner},{asset_id:'222'},{market:'wrong'},{side:'SELL'},{price:'0.32'},{original_size:'11'},{status:'DELAYED'}]){
  const f=fixture();Object.assign(f.order,change);await assert.rejects(reconcileEvidence(binding,f.deps))
 }
 await assert.rejects(reconcileEvidence(binding,{...fixture().deps,readOrder:async()=>null}))
 await assert.rejects(reconcileEvidence(binding,{...fixture().deps,readOrder:async()=>{throw new Error('timeout')}}))
})
test('failed, unfinalized, reorged, missing and duplicate receipts cannot clear recovery',async()=>{
 for(const mutate of [f=>f.evidence.receipt.status='0x0',f=>f.evidence.finalizedBlock='0x63',f=>f.evidence.canonicalBlockHash=tx,
  f=>f.evidence.receipt.logs=[],f=>f.evidence.receipt.logs.push(f.evidence.receipt.logs[0]),f=>f.evidence.receipt.logs[0].removed=true,
  f=>f.order.size_matched='9',f=>f.evidence.receipt.logs[0].address=binding.owner]){
  const f=fixture();mutate(f);await assert.rejects(reconcileEvidence(binding,f.deps))
 }
 const f=fixture();f.deps.readTrade=async()=>({id:'trade-1',taker_order_id:'wrong',transaction_hash:tx});await assert.rejects(reconcileEvidence(binding,f.deps))
})
test('verified recovery persists receipt before clearing guard and never replays same ID',async t=>{
 const {dir,claim}=ledger(t)
 const result=await recoverPending(dir,async()=>fixture().deps,()=>false)
 assert.equal(result.state,'FILLED');assert.equal(executionStatus(dir).state,'NO_UNCERTAIN_EXECUTION')
 assert.equal(JSON.parse(readFileSync(claim.record,'utf8')).orderId,recoveryOrderId(binding))
 assert.throws(()=>claimExecution(dir,binding.executionId,['fake']),/already recorded/)
 assert.equal((await recoverPending(dir,async()=>{throw new Error('must not query')})).state,'NO_UNCERTAIN_EXECUTION')
})
test('running submitter and uncertain provider retain the durable pending guard',async t=>{
 const {dir}=ledger(t)
 await assert.rejects(recoverPending(dir,async()=>fixture().deps,()=>true),/still be running/)
 await assert.rejects(recoverPending(dir,async()=>({...fixture().deps,readOrder:async()=>null}),()=>false))
 assert.equal(executionStatus(dir).state,'PENDING')
 assert.throws(()=>claimExecution(dir,'buyer:recovery:002',['fake']),/pending or uncertain/)
})
test('missing pre-submit binding cannot be treated as proof of no submission',async t=>{
 const {dir,claim}=ledger(t);rmSync(`${claim.record}.binding.json`)
 await assert.rejects(recoverPending(dir,async()=>{throw new Error('must not query')},()=>false))
 assert.equal(executionStatus(dir).state,'PENDING')
})
test('absent order recovers only a fully accounted finalized exact-order history',async()=>{
 const f=fixture();f.deps.readOrder=async()=>null;f.deps.findTrades=async()=>[{id:'trade-1'}]
 const result=await reconcileEvidence(binding,f.deps)
 assert.equal(result.state,'FILLED');assert.equal(result.evidenceSource,'finalized-exact-order-trade-history')
 const partial=fixture(binding,'CANCELED','5');partial.deps.readOrder=async()=>null;partial.deps.findTrades=async()=>[{id:'trade-1'}]
 await assert.rejects(reconcileEvidence(binding,partial.deps),/do not account/)
 await assert.rejects(reconcileEvidence(binding,{...f.deps,findTrades:async()=>[]}))
})
test('a successful-looking response with a different order hash retains the guard',t=>{
 const {dir,claim}=ledger(t)
 assert.throws(()=>recordSubmission(claim,'0x'+'ff'.repeat(32)),/differs from the durable binding/)
 assert.equal(executionStatus(dir).state,'PENDING')
})