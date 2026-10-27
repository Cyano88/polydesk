import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputeResearch,createPrivateComputeResearch,readComputeConfig,validateComputeReport} from '../api/polydesk-og-compute.mjs';
const env={POLYDESK_0G_API_KEY:'sk-fixture-not-a-real-key',POLYDESK_0G_MODEL:'glm-5.3'};
const report=()=>({summary:'Fixture summary',reasoningSummary:'Evidence is incomplete.',confidence:0.4,
  signals:[],riskFlags:['Limited evidence'],dataGaps:['No news'],tradeAssessment:{stance:'INSUFFICIENT',side:'BUY',
    thesis:'Insufficient evidence.',counterThesis:'Unknown evidence.',resolutionRisk:'Check official rules.',evidenceQuality:'LOW'}});
const response=(overrides={})=>({x_0g_trace:{tee_verified:true},choices:[{finish_reason:'stop',message:{content:JSON.stringify(report())}}],...overrides});
test('direct compute minimizes context, enforces private routing, and never invents archival proof',async()=>{
  let calls=0;
  const research=createPrivateComputeResearch({env,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://router-api.0g.ai/v1/chat/completions');assert.equal(options.redirect,'error');
    assert.equal(options.headers['X-0G-Provider-Trust-Mode'],'private');
    const body=JSON.parse(options.body);assert.equal(body.verify_tee,true);assert.equal(body.stream,false);
    assert.equal(body.model,'glm-5.3');assert.equal(body.reasoning_effort,'low');assert.deepEqual(body.chat_template_kwargs,{reasoning_effort:'low'});assert.equal(body.max_tokens,3000);assert.deepEqual(body.response_format,{type:'json_object'});
    const sent=JSON.parse(body.messages[1].content);assert.deepEqual(sent,{side:'BUY',market:{title:'Fixture'}});
    return Response.json(response());
  }});
  const result=await research({side:'BUY',market:{title:'Fixture'},wallet:'secret-wallet',payment:{txid:'secret'},historicalOwnerReceipts:['private']});
  assert.equal(calls,1);assert.equal(result.aiProvider,'0g-compute-router');assert.equal(result.proof,undefined);
  assert.equal(result.proofMetadata.archived,false);assert.equal(result.proofMetadata.independentVerification,false);
});
test('bad schema, unverified responses, truncation and upstream failures do not retry or fall back',async()=>{
  for(const payload of [response({x_0g_trace:{tee_verified:false}}),response({x_0g_trace:{}}),
    response({choices:[{finish_reason:'length',message:{content:JSON.stringify(report())}}]}),
    response({choices:[{finish_reason:'stop',message:{content:'not json'}}]}),
    response({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...report(),executionAuthorized:true})}}]})]){
    let calls=0;const research=createPrivateComputeResearch({env,fetchImpl:async()=>{calls++;return Response.json(payload);}});
    await assert.rejects(research({side:'BUY'}),/^Error: Private compute research unavailable; no fallback or automatic retry$/);
    assert.equal(calls,1);
  }
  const failed=createPrivateComputeResearch({env,fetchImpl:async()=>{throw Error('secret provider body');}});
  await assert.rejects(failed({side:'BUY'}),error=>!error.message.includes('secret'));
  const oversized=createPrivateComputeResearch({env,fetchImpl:async()=>new Response('x'.repeat(256001))});
  await assert.rejects(oversized({side:'BUY'}),/unavailable/);
});
test('configuration and schema fail closed',()=>{
  for(const change of [{POLYDESK_0G_API_KEY:'mk-admin'},{POLYDESK_0G_TRUST_MODE:'standard'},
    {POLYDESK_0G_BASE_URL:'https://other.example/v1'},{POLYDESK_0G_MODEL:''}])assert.throws(()=>readComputeConfig({...env,...change}));
  assert.throws(()=>validateComputeReport({...report(),confidence:80},'BUY'));
  assert.throws(()=>validateComputeReport(report(),'SELL'));
});

test('failure diagnostics distinguish causes without exposing provider data or retrying',async()=>{
  const cases=[
    [async()=>{throw Error('secret-key and private evidence');},'COMPUTE_CONNECTION',undefined],
    [async()=>{throw new DOMException('secret endpoint','TimeoutError');},'COMPUTE_TIMEOUT',undefined],
    [async()=>new Response('secret provider body',{status:429}),'COMPUTE_HTTP',429],
    [async()=>Response.json({choices:[]}),'COMPUTE_RESPONSE',200],
    [async()=>Response.json(response({choices:[{finish_reason:'stop',message:{content:'{}'}}]})),'COMPUTE_SCHEMA',200],
  ];
  for(const [fetchImpl,code,status] of cases){
    let calls=0;
    const research=createComputeResearch({env,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
    await assert.rejects(research({side:'BUY'}),error=>{
      assert.equal(error.code,code);assert.equal(error.status,status);assert.equal(error.cause,undefined);
      assert.doesNotMatch(JSON.stringify(error)+error.message,/secret|private evidence/);
      return true;
    });
    assert.equal(calls,1);
  }
});

test('ordinary direct 0G preserves research schema without inventing a TEE flag or stored proof',async()=>{
  let calls=0;
  const research=createComputeResearch({env,fetchImpl:async(url,options)=>{
    calls++;assert.equal(new URL(url).hostname,'router-api.0g.ai');
    assert.equal(options.headers.Authorization,'Bearer '+env.POLYDESK_0G_API_KEY);
    return Response.json(response({x_0g_trace:{}}));
  }});
  const result=await research({side:'BUY',newsEvidence:[],researchOnly:true});
  assert.equal(calls,1);assert.equal(result.tradeAssessment.side,'BUY');
  assert.equal(result.proofMetadata.routerTeeVerified,false);
  assert.equal(result.proofMetadata.independentVerification,false);
  assert.equal(result.proof,undefined);assert.equal(result.claudeReview,undefined);
});
