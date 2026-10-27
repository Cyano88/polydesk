// Operator-only check. Runs paid inference, never purchases a service or trades.
// Use an exact PUBLIC market; output intentionally omits prompts and report text.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [ack,marketId,outcome,side,...extra]=process.argv.slice(2);
if(ack!=='--live'||!/^0x[0-9a-fA-F]{64}$/.test(marketId||'')||!outcome?.trim()
  ||outcome.length>100||!['BUY','SELL'].includes(side)||extra.length){
  console.error('Usage: node --import tsx scripts/verify-live-research.mjs --live CONDITION_ID OUTCOME BUY|SELL');
  process.exit(2);
}
const started=Date.now();
const deadline=setTimeout(()=>{console.error(JSON.stringify({check:'polydesk-live-engine',ok:false,code:'CHECK_DEADLINE'}));process.exit(1)},120000);
try{
  const {runPolymarketTaskResearch}=await import('../api/polymarket-smart-trader.ts');
  const result=await runPolymarketTaskResearch({marketId,outcome,side});
  assert.equal(result.ok,true,'Engine rejected request');
  const report=result.data;
  assert.equal(report.schema,'polydesk-a2a-market-research-v1');
  assert.equal(report.researchStatus,'AVAILABLE');
  assert.equal(report.researchOnly,true);
  assert.equal(report.screeningMandate,null);
  assert.equal(report.orderAuthorized,false);
  assert.equal(report.orderSubmitted,false);
  assert.equal(report.selected.market.conditionId.toLowerCase(),marketId.toLowerCase());
  assert.equal(report.selected.outcome.label.toLowerCase(),outcome.toLowerCase());
  assert.ok(Number.isFinite(report.selected.execution.bestBid),'Missing live bid');
  assert.ok(Number.isFinite(report.selected.execution.bestAsk),'Missing live ask');
  const compute=report.evidence.zeroScout;
  assert.equal(compute.aiProvider,'0g-compute-router');
  assert.equal(compute.proof,null);
  assert.equal(compute.tradeAssessment.side,side);
  assert.ok(report.evidence.retrievedNews.length>0,'No retrieved sources');
  assert.ok(report.opinion?.trim(),'Missing report');
  console.log(JSON.stringify({check:'polydesk-live-engine',ok:true,checkedAt:new Date().toISOString(),
    durationMs:Date.now()-started,researchStatus:report.researchStatus,
    retrievedSources:report.evidence.retrievedNews.length,currentSources:report.evidence.news.length,
    provider:compute.aiProvider,stance:compute.tradeAssessment.stance,privacy:compute.proofMetadata,
    reportSha256:createHash('sha256').update(JSON.stringify(report)).digest('hex'),
    orderAuthorized:false,orderSubmitted:false,liveSettlementVerified:false}));
}catch(error){
  console.error(JSON.stringify({check:'polydesk-live-engine',ok:false,
    code:error?.code==='ERR_ASSERTION'?'ACCEPTANCE_FAILED':'ENGINE_FAILED',durationMs:Date.now()-started}));
  process.exitCode=1;
}finally{clearTimeout(deadline)}
