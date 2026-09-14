import test from 'node:test'
import assert from 'node:assert/strict'
import { safeScout } from '../api/zeroscout-polymarket-brief.js'
import { lpCorrectionPlan } from '../api/lp-scout-correction.js'
import type { AgentActivity } from '../api/agent-activity.js'
const original = {request:{mode:'best'},opportunities:[],candidateAudit:{scanned:80,conservativePassed:0,rejectedCandidates:Array.from({length:8},()=>({title:'Saved market',eligible:true,daysToResolve:0,bookTimestamp:'2026-09-12T23:54:30Z',bestBid:0.3,bestAsk:0.31,bookVerified:true,rewardPoolVerified:true}))}}
const scout = {id:'source',agentSlug:'buyer',type:'scout_returned',createdAt:1,result:{...original,receiptActivityId:'receipt-12345678'}} as AgentActivity
const receipt = {id:'receipt-12345678',agentSlug:'buyer',type:'x402_spent',createdAt:0} as AgentActivity
const prior = {id:'prior',agentSlug:'buyer',type:'scout_returned',createdAt:2,result:{sourceActivityId:'source',zeroscout:{id:'first',summary:'First report'}}} as AgentActivity

test('LP handoff retains eight rejection records and 72 missing records without changing source',()=>{
 const before=JSON.stringify(original); const out=safeScout(original)
 assert.equal(JSON.stringify(original),before)
 assert.equal(out.candidateAudit?.scanned,80)
 assert.equal(out.candidateAudit?.conservativePassed,0)
 assert.equal(out.candidateAudit?.rejectedCandidates.length,8)
 assert.equal(out.evidenceScope?.undisclosedRejections,72)
 const row=out.candidateAudit!.rejectedCandidates[0]
 assert.equal(row.rewardSpreadEligible,true);assert.equal(row.safetyScreenPassed,false)
 assert.equal('eligible' in row,false)
 assert.equal(row.bookTimestamp,'2026-09-12T23:54:30Z');assert.equal(row.bestBid,0.3)
 assert.match(row.observedRejectionReasons[0],/7 days/)
 assert.match(out.evidenceTiming!,/saved observations/)
})
test('missing candidate audit is not invented and oversized evidence fails before inference',()=>{
 assert.equal(safeScout({}).candidateAudit,undefined)
 assert.throws(()=>safeScout({candidateAudit:{rejectedCandidates:Array.from({length:21},()=>({}))}}),/size/)
})
test('correction requires the linked receipt and same-buyer source delivery',()=>{
 assert.throws(()=>lpCorrectionPlan(scout,[receipt,prior],'prior','wrong'),/receipt/)
 assert.throws(()=>lpCorrectionPlan(scout,[receipt,{...prior,agentSlug:'other'}],'prior',receipt.id),/linked/)
 assert.throws(()=>lpCorrectionPlan(scout,[receipt,{...prior,result:{sourceActivityId:'other',zeroscout:{}}}],'prior',receipt.id),/linked/)
})
test('correction is deterministic, preserves prior reports, and identifies completed replay',()=>{
 const items=[receipt,prior];const before=JSON.stringify(items)
 const plan=lpCorrectionPlan(scout,items,'prior',receipt.id)
 assert.equal(plan.correctionOfActivityId,'prior');assert.equal(JSON.stringify(items),before)
 const corrected={...prior,id:'corrected',createdAt:3,result:{...prior.result,...plan}}
 assert.deepEqual(lpCorrectionPlan(scout,[corrected,...items],'prior',receipt.id),plan)
 assert.throws(()=>lpCorrectionPlan(scout,[{...corrected,result:{...prior.result}},...items],'prior',receipt.id),/newer/)
})
