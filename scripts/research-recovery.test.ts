import test from 'node:test'
import assert from 'node:assert/strict'
import { createResearchRecoveryHandler } from '../api/research-recovery.js'
import { buildSettledSmartTraderAnalysisRecord } from '../api/polymarket-smart-trader.js'
import { CorrectionError } from '../api/receipt-correction.js'
const tx='0x'+'ab'.repeat(32)
const record={...buildSettledSmartTraderAnalysisRecord({action:'ANALYZE',marketId:'0x'+'12'.repeat(32),outcome:'Yes',side:'BUY'},{provider:'CDP x402',transaction:tx,payer:'0x'+'11'.repeat(20),network:'Base',amountAtomic:'300000',serviceUrl:'/api/x402/base/polymarket-smart-trader'},Date.now()),status:'completed' as const,decisionId:'old',analysisHash:'old',deliveryAttemptCount:1,response:{decision:{decision:'ESCALATE',evidence:{researchStatus:'UNAVAILABLE'}}}}
async function call(overrides:any={},body:any={action:'RECOVER_RESEARCH'}) {
 let executed:any[]=[];let code=200;let output:any
 const handler=createResearchRecoveryHandler({authorize:()=>{},read:async()=>record,ready:async()=>{},execute:async(...args:any[])=>{executed=args},...overrides} as any)
 const res:any={setHeader:()=>{},status:(n:number)=>{code=n;return res},json:(b:any)=>{output=b;return res}}
 await handler({headers:{},params:{transaction:tx},body} as any,res)
 return {code,output,executed}
}
test('recovery uses persisted payer, same receipt and explicit bounded remediation',async()=>{
 const r=await call();assert.equal(r.code,200);assert.deepEqual(r.executed,[tx,record.payment.payer,undefined,{allowDegradedResearchRemediation:true}]);assert.equal(r.output.additionalPaymentRequired,false)
})
test('unauthorized, altered scope, wrong payment and unavailable provider cannot execute',async()=>{
 for(const r of [await call({authorize:()=>{throw new CorrectionError(401,'OPERATOR_REQUIRED')}}),await call({}, {action:'RECOVER_RESEARCH',marketId:'changed'}),await call({read:async()=>({...record,payment:{...record.payment,amountAtomic:'1'}})}),await call({ready:async()=>{throw Error('quota')}})]){assert(r.code>=400);assert.equal(r.executed.length,0);assert.equal(r.output.retryPayment,false)}
})
test('delivered AI research is ineligible for another free compute request',async()=>{
 const r=await call({read:async()=>({...record,response:{decision:{decision:'ESCALATE',evidence:{researchStatus:'AVAILABLE'}}}})});assert.equal(r.code,409);assert.equal(r.executed.length,0)
})
