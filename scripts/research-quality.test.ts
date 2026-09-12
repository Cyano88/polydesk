import test from 'node:test'
import assert from 'node:assert/strict'
import { assessResearchSources, structuredBtcSnapshot } from '../api/research-quality.js'
const now=Date.parse('2026-09-12T12:00:00Z')
const article={title:'Bitcoin market evidence',description:'Observed event with attributable facts',source:'Publisher',url:'https://example.com/report',publishedAt:new Date(now-3600000).toISOString()}
test('source screening preserves audit trail and excludes stale, duplicate, undated and AI forecasts from current evidence',()=>{
 const r=assessResearchSources([article,{...article,url:article.url+'?utm_source=x'},{...article,url:'https://example.com/old',publishedAt:'2025-01-01'}, {...article,url:'https://example.com/unknown',publishedAt:''}, {...article,url:'https://example.com/ai',title:'We asked ChatGPT to predict Bitcoin'}, {...article,url:'https://example.com/future',publishedAt:new Date(now+600000).toISOString()}, {...article,url:'javascript:alert(1)'}, {...article,url:'https://example.com/rules',evidenceRole:'RESOLUTION_AUTHORITY'}],now)
 assert.deepEqual(r.current,[article]);assert.equal(r.assessments.length,8)
 assert.deepEqual(r.assessments.map(a=>a.reason),['RECENT_TIMESTAMP_NOT_FACT_VERIFICATION','DUPLICATE_URL','OLDER_THAN_SEVEN_DAYS','PUBLICATION_TIME_UNKNOWN','AI_FORECAST_NOT_INDEPENDENT_EVIDENCE','FUTURE_PUBLICATION_TIME','INVALID_URL','RULE_SOURCE_NOT_STRUCTURED_MARKET_DATA'])
 assert.equal(assessResearchSources([{...article,description:'Sign up log in cookie menu download app'}],now).current.length,0)
})
const market={title:'Will Bitcoin reach $90,000?',description:'Use BTC/USDT candle highs.',resolutionSource:'https://www.binance.com/en/trade/BTC_USDT'}
const candle=[now-60000,'77000','78000','76000','77500','100',now-1,'0',1,'0','0','0']
test('structured snapshot is fixed-source, closed-candle only and explicitly not a full history audit',async()=>{
 const fetcher=(async(url:any,options:any)=>{assert.equal(String(url),'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=3');assert.equal(options.redirect,'error');return Response.json([candle,[now,'1','1','1','1','1',now+59999]])}) as typeof fetch
 const r=await structuredBtcSnapshot(market,now,fetcher)
 assert.equal(r?.status,'AVAILABLE');assert.equal(r?.close,'77500');assert.equal(r?.fullResolutionHistoryVerified,false);assert.deepEqual(r?.rawCandle,candle)
 const forbidden=(async()=>{assert.fail('unsupported source must not fetch')}) as typeof fetch
 assert.equal(await structuredBtcSnapshot({...market,resolutionSource:'https://attacker.example/en/trade/BTC_USDT'},now,forbidden),null)
 for(const rows of [[],[[...candle.slice(0,6),now+1]],[[now-600000,...candle.slice(1)]]]){
  assert.equal((await structuredBtcSnapshot(market,now,(async()=>Response.json(rows)) as typeof fetch))?.status,'UNAVAILABLE')
 }
 assert.equal((await structuredBtcSnapshot(market,now,(async()=>{throw Error('offline')}) as typeof fetch))?.status,'UNAVAILABLE')
})
