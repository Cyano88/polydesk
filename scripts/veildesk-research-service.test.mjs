import test from 'node:test';
import assert from 'node:assert/strict';
import {createVeilDeskResearchService} from '../api/veildesk-research-service.mjs';
const input = {marketId: 'fixture-market', outcome: 'YES', side: 'BUY'};
test('provider adapter passes research inputs only and preserves the full report', async () => {
  const data = {schema: 'polydesk-a2a-market-research-v1', researchStatus: 'AVAILABLE', evidence: ['fixture'], orderAuthorized: false, orderSubmitted: false};
  const service = createVeilDeskResearchService({runResearch: async raw => {assert.deepEqual(raw, input); return {ok: true, data};}});
  assert.deepEqual(await service(input), data);
});
test('no execution or entitlement fields, and upstream failure text is not disclosed', async () => {
  let called = 0;
  const service = createVeilDeskResearchService({runResearch: async () => {called++; return {ok: false, error: 'private upstream error'};}});
  await assert.rejects(service({...input, action: 'PREPARE'}), /Invalid research input/);
  await assert.rejects(service({...input, paymentVerified: true}), /Invalid research input/);
  assert.equal(called, 0);
  await assert.rejects(service(input), /^Error: Research service unavailable$/);
  const throwing = createVeilDeskResearchService({runResearch: async () => {throw Error('private upstream credentials');}});
  await assert.rejects(throwing(input), /^Error: Research service unavailable$/);
});
test('reports carrying order authority fail closed', async () => {
  const service = createVeilDeskResearchService({runResearch: async () => ({ok: true, data: {
    schema: 'polydesk-a2a-market-research-v1', researchStatus: 'AVAILABLE', orderAuthorized: true, orderSubmitted: false}})});
  await assert.rejects(service(input), /unavailable/);
});
test('VeilDesk delivery does not claim an accepted marketplace task', async () => {
  const service = createVeilDeskResearchService({runResearch: async () => ({ok: true, data: {
    schema: 'polydesk-a2a-market-research-v1', researchStatus: 'AVAILABLE', orderAuthorized: false, orderSubmitted: false,
    next: 'Review this evidence in the accepted A2A task.'}})});
  const report = await service(input);
  assert.match(report.next, /VeilDesk request/);
  assert.doesNotMatch(report.next, /accepted A2A task/);
});

test('unavailable research cannot be delivered as a completed paid report', async () => {
  const service=createVeilDeskResearchService({runResearch:async()=>({ok:true,data:{
    schema:'polydesk-a2a-market-research-v1',researchStatus:'UNAVAILABLE',orderAuthorized:false,orderSubmitted:false}})});
  await assert.rejects(service(input), /unavailable/);
});