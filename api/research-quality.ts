import type { ZeroScoutGeneralResearchArticle } from './zeroscout-intelligence.js'
export function assessResearchSources(articles: ZeroScoutGeneralResearchArticle[], now: number) {
 const seen=new Set<string>()
 const assessments=articles.map(article=>{
  let url:URL
  try {url=new URL(article.url)} catch {return {article,status:'EXCLUDED',reason:'INVALID_URL'}}
  if(!['http:','https:'].includes(url.protocol))return {article,status:'EXCLUDED',reason:'INVALID_URL'}
  url.hash='';for(const k of [...url.searchParams.keys()])if(k.startsWith('utm_')||['ref','fbclid','gclid'].includes(k))url.searchParams.delete(k)
  const key=url.toString();if(seen.has(key))return {article,status:'EXCLUDED',reason:'DUPLICATE_URL'};seen.add(key)
  const text=article.title+' '+article.description
  if(/asked chatgpt|chatgpt.*predict|predict.*chatgpt/i.test(text))return {article,status:'EXCLUDED',reason:'AI_FORECAST_NOT_INDEPENDENT_EVIDENCE'}
  const clutter=(text.match(/\b(?:sign up|log in|cookie|privacy policy|image \d+|menu|language|download app)\b/gi)||[]).length
  if(clutter>=3)return {article,status:'EXCLUDED',reason:'PAGE_CHROME_DOMINATES_EXCERPT'}
  // A resolution-authority label describes provenance, not verified prices/history.
  if(article.evidenceRole==='RESOLUTION_AUTHORITY')return {article,status:'CONTEXT_ONLY',reason:'RULE_SOURCE_NOT_STRUCTURED_MARKET_DATA'}
  const published=Date.parse(article.publishedAt)
  if(!Number.isFinite(published))return {article,status:'CONTEXT_ONLY',reason:'PUBLICATION_TIME_UNKNOWN'}
  if(published>now+300000)return {article,status:'EXCLUDED',reason:'FUTURE_PUBLICATION_TIME'}
  if(now-published>7*86400000)return {article,status:'CONTEXT_ONLY',reason:'OLDER_THAN_SEVEN_DAYS'}
  return {article,status:'CURRENT_CANDIDATE',reason:'RECENT_TIMESTAMP_NOT_FACT_VERIFICATION'}
 })
 return {policy:'polydesk-source-quality-v1',freshnessWindowDays:7,current:assessments.filter(a=>a.status==='CURRENT_CANDIDATE').map(a=>a.article),assessments:assessments.map(({article,...a})=>({...a,url:article.url,publishedAt:article.publishedAt})),limitations:['Recency and deduplication do not establish relevance, independence or factual accuracy.','Resolution history is unverified unless a separate structured audit explicitly supplies its interval and completeness.']}
}

export async function structuredBtcSnapshot(market:{title?:string;description?:string|null;resolutionSource?:string|null}, now:number,fetcher:typeof fetch=fetch) {
 const text=market.description||''
 let source:URL
 try{source=new URL(market.resolutionSource||'')}catch{return null}
 if(!['binance.com','www.binance.com'].includes(source.hostname)||!/^\/en\/trade\/BTC_USDT\/?$/.test(source.pathname)||!(/bitcoin|\bBTC\b/i.test(market.title||''))||!(/BTC\s*\/\s*USDT/i.test(text)))return null
 const url='https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=3'
 try{
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error()
  const rows=await r.json() as unknown
  if(!Array.isArray(rows))throw Error()
  const closed=rows.filter((x:any)=>Array.isArray(x)&&Number.isSafeInteger(x[0])&&x[0]%60000===0&&x[6]===x[0]+59999&&x[6]<now&&now-x[6]<=180000&&[x[1],x[2],x[3],x[4]].every(v=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)&&Number(v)>0)&&Number(x[2])>=Math.max(Number(x[1]),Number(x[4]))&&Number(x[3])<=Math.min(Number(x[1]),Number(x[4]))).sort((a:any,b:any)=>a[0]-b[0])
  const last=closed.at(-1);if(!last)throw Error()
  return {status:'AVAILABLE',source:url,pair:'BTCUSDT',interval:'1m',observedAt:new Date(now).toISOString(),openTime:new Date(last[0]).toISOString(),closeTime:new Date(last[6]).toISOString(),high:last[2],close:last[4],rawCandle:last,historyCoverage:'LAST_CLOSED_CANDLE_ONLY',fullResolutionHistoryVerified:false}
 }catch{return {status:'UNAVAILABLE',source:url,fullResolutionHistoryVerified:false}}
}
