import assert from 'node:assert/strict'
import test from 'node:test'
import {preflightPolymarketSell,type SellDependencies} from '../api/polymarket-sell-preflight.js'
const now=1800000000000, condition='0x'+'12'.repeat(32), owner='0x1111111111111111111111111111111111111111' as const
const input={ownerAddress:owner,marketSlug:'example-market',outcome:'Yes',shares:'11',minimumPrice:'0.30',orderType:'FOK'}
function deps(options:{balance?:bigint;approved?:boolean[];book?:any;delay?:number}={}):SellDependencies {
 let clock=now
 return {now:()=>clock,builderCode:()=>`0x${'ab'.repeat(32)}`,
 inspectWallet:async()=>({ownerAddress:owner,depositWalletAddress:owner,deployed:true}),
 fetchJson:async url=>url.includes('gamma-api')?{slug:'example-market',active:true,closed:false,acceptingOrders:true,conditionId:condition,outcomes:['Yes','No'],clobTokenIds:['111','222']}:
 {asset_id:'111',market:condition,timestamp:String(now),neg_risk:true,tick_size:'0.01',bids:[{price:'0.3',size:'11'}],...options.book},
 readFees:async()=>({marketRate:0.05,exponent:1,takerOnly:true,makerBps:0,takerBps:0}),
 readPosition:async()=>{clock+=options.delay??0;return {balance:options.balance??11000000n,approved:options.approved??[true,true]}},
 }
}
test('exact whole-share FOK sell checks position, both operators and minimum-price depth',async()=>{
 const result=await preflightPolymarketSell(input,deps())
 assert.equal(result.publicChecksPassed,true);assert.equal(result.orderAuthorized,false)
 assert.equal(result.minimumGrossProceeds,'3.3');assert.equal(result.feeReserveAtMinimum,'0.165')
 assert.equal(result.conservativeMinimumNetProceeds,'3.135');assert.equal(result.operators.length,2)
 assert.ok(result.previewArgs.includes('--dry-run'))
})
test('closed position, missing approval, inadequate depth and aged checks block selling',async()=>{
 for(const [options,issue] of [
  [{balance:0n},'INSUFFICIENT_OUTCOME_SHARES'],[{approved:[true,false]},'OUTCOME_OPERATOR_APPROVAL_REQUIRED'],
  [{book:{bids:[{price:'0.29',size:'100'}]}},'INSUFFICIENT_DEPTH_AT_MINIMUM_PRICE'],
  [{book:{timestamp:String(now-30001)}},'STALE_ORDER_BOOK'],[{delay:30001},'PREFLIGHT_EXPIRED_DURING_CHECKS'],
 ] as const){const result=await preflightPolymarketSell(input,deps(options as any));assert.equal(result.publicChecksPassed,false);assert.ok(result.issues.includes(issue))}
})
test('reject mismatched book, malformed depth, fractional shares and policy changes',async()=>{
 for(const book of [{asset_id:'222'},{market:'wrong'},{timestamp:String(now+6000)},{bids:[{price:'Infinity',size:'11'}]}])await assert.rejects(preflightPolymarketSell(input,deps({book})))
 for(const change of [{shares:'11.5'},{orderType:'GTC'},{minimumPrice:'0.305'},{minimumPrice:'0'},{shares:'0'}])await assert.rejects(preflightPolymarketSell({...input,...change},deps()))
})
test('RPC or fee failures cannot report readiness and nonzero builder fees stay blocked',async()=>{
 for(const change of [{readPosition:async()=>{throw new Error('RPC timeout')}},{readFees:async()=>{throw new Error('fee timeout')}}])await assert.rejects(preflightPolymarketSell(input,{...deps(),...change}))
 const result=await preflightPolymarketSell(input,{...deps(),readFees:async()=>({marketRate:0.05,exponent:1,takerOnly:true,makerBps:0,takerBps:10})})
 assert.ok(result.issues.includes('LOCAL_EXECUTOR_BUILDER_FEES_UNSUPPORTED'))
})