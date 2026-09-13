import test from 'node:test'
import assert from 'node:assert/strict'
import { lpScoutEvidenceView } from '../api/lp-scout-report-evidence.js'
test('saved report correction explains rejected spread-eligible candidates without mutation',()=>{
 const original={request:{mode:'best'},candidateAudit:{scanned:80,conservativePassed:0,rejectedCandidates:Array.from({length:8},(_,i)=>({title:`market ${i}`,eligible:true,daysToResolve:0,bookTimestamp:'2026-09-12T23:54:30Z'}))}}
 const before=JSON.stringify(original); const view=lpScoutEvidenceView(original)
 assert.equal(JSON.stringify(original),before)
 assert.equal(view.scope.undisclosedRejections,72)
 assert.equal(view.rejectedCandidates[0].rewardSpreadEligible,true)
 assert.equal(view.rejectedCandidates[0].safetyScreenPassed,false)
 assert.match(view.rejectedCandidates[0].observedRejectionReasons[0],/7 days/)
 assert.equal('eligible' in view.rejectedCandidates[0],false)
 assert.equal(lpScoutEvidenceView(original).originalReportHash,view.originalReportHash)
})
test('missing audit is not represented as a completed zero-market scan',()=>{
 const view=lpScoutEvidenceView({})
 assert.equal(view.scope.scanned,undefined);assert.equal(view.scope.passed,undefined)
 assert.match(view.scope.note,/does not record/)
})
test('unknown rejection cause is disclosed and football is not assigned the long-duration rule',()=>{
 const view=lpScoutEvidenceView({request:{mode:'football'},candidateAudit:{rejectedCandidates:[{daysToResolve:0}]}})
 assert.match(view.rejectedCandidates[0].observedRejectionReasons[0],/do not establish/)
})
