import test from 'node:test'
import assert from 'node:assert/strict'
import {fetchPolyDeskGeneralResearch} from '../api/polydesk-web-research.js'
import {assessResearchSources} from '../api/research-quality.js'
const now=Date.parse('2026-10-27T12:00:00Z')
const request={schema:'zeroscout.polydesk-general-research.request' as const,schemaVersion:'1.0.0' as const,
  query:'Example election results',market:{conditionId:'0x'+'12'.repeat(32),question:'Will Example win the election?',
    resolutionRules:'Official election results determine resolution.',resolutionSource:'https://authority.example/results'},
  requestedSide:'BUY' as const,requestedOutcome:'Yes'}

test('direct retrieval preserves cited sources and dates, screens duplicates and never sends trade or wallet fields',async()=>{
  let calls=0
  const fetchImpl=(async(url:unknown,options:RequestInit)=>{
    calls++;assert.equal(url,'https://api.tavily.com/search');assert.equal(options.redirect,'error')
    const body=JSON.parse(String(options.body))
    assert.equal(body.include_answer,false);assert.equal(body.auto_parameters,false)
    assert.equal(body.include_published_date,true);assert.ok(['general','news'].includes(body.topic))
    assert.equal(body.search_depth,'advanced');assert.equal(body.max_results,5)
    assert.ok(!JSON.stringify(body).includes('BUY'));assert.equal(body.market,undefined)
    return Response.json({results:[
      {title:'Official results',url:'https://authority.example/results',content:'Certified totals.',score:1},
      {title:'Recent report',url:'https://news.example/report',content:'Latest official figures.',published_date:'2026-10-27T09:00:00Z',score:0.9},
      {title:'Old report',url:'https://news.example/old',content:'Historical context.',published_date:'2025-01-01',score:0.8},
      {title:'Undated',url:'https://news.example/undated',content:'No date is given.',score:0.6},
      {title:'Market odds',url:'https://polymarket.com/event/example',content:'Not independent evidence.',score:1},
    ]})
  }) as typeof fetch
  const options={env:{POLYDESK_SEARCH_API_KEY:'fixture-one'},fetchImpl,now:()=>now}
  const result=await fetchPolyDeskGeneralResearch(request,options)
  assert.equal(calls,3);assert.equal(result.articles.length,4)
  assert.equal(result.articles.find(a=>a.url.endsWith('/undated'))?.publishedAt,'')
  const quality=assessResearchSources(result.articles,now)
  assert.deepEqual(quality.current.map(a=>a.url),['https://news.example/report'])
  assert.equal(result.articles[0].retrievedAt,new Date(now).toISOString())
  await fetchPolyDeskGeneralResearch(request,options);assert.equal(calls,3,'identical requests reuse bounded cache')
  await fetchPolyDeskGeneralResearch(request,{...options,env:{POLYDESK_SEARCH_API_KEY:'fixture-two'}})
  assert.equal(calls,6,'different credentials do not share cache')
})

test('missing configuration and injected request fields fail before any network call',async()=>{
  const fetchImpl=(async()=>{assert.fail('network must not run')}) as typeof fetch
  await assert.rejects(fetchPolyDeskGeneralResearch(request,{env:{},fetchImpl}),/not configured/)
  await assert.rejects(fetchPolyDeskGeneralResearch({...request,wallet:'private'} as any,{env:{POLYDESK_SEARCH_API_KEY:'fixture'},fetchImpl}))
})

test('upstream errors are not echoed, oversized bodies and invalid URLs fail closed',async()=>{
  let calls=0
  await assert.rejects(fetchPolyDeskGeneralResearch(request,{env:{POLYDESK_SEARCH_API_KEY:'error'},fetchImpl:(async()=>{
    calls++;return new Response('secret upstream diagnostics',{status:401})
  }) as typeof fetch}),error=>error instanceof Error&&!error.message.includes('secret'))
  assert.equal(calls,3,'one call per planned query; no retries')
  await assert.rejects(fetchPolyDeskGeneralResearch(request,{env:{POLYDESK_SEARCH_API_KEY:'oversize'},fetchImpl:(async()=>new Response('x'.repeat(1000001))) as typeof fetch}),/too large/)
  await assert.rejects(fetchPolyDeskGeneralResearch(request,{env:{POLYDESK_SEARCH_API_KEY:'invalid'},fetchImpl:(async()=>Response.json({results:[{url:'javascript:alert(1)',content:'bad'}]})) as typeof fetch}))
})