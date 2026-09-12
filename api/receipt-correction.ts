import { createHash, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { readPaidResearchRecord, type SmartTraderPaidAnalysisRecord } from './polymarket-smart-trader.js'
import { readDurableJson, mutateDurableJson } from './render-durable-store.js'
export class CorrectionError extends Error { constructor(public status:number,public code:string){super(code)} }
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export type Addendum={summary:string; corrections:string[]; sources:{url:string;observedAt:string;finding:string}[]; remainingGaps:string[]; disposition:'ESCALATE'; authorship:'OPERATOR_REVIEWED'}
type Round={round?:number;issue:string;createdAt:string;status:'REQUESTED'|'PUBLISHED';addendum?:Addendum;revisionHash?:string;publishedAt?:string}
export type Correction={round?:number;previousRounds?:Round[];schema:'polydesk-receipt-correction-v1';transaction:string;originalAnalysisHash:string;originalResultHash:string;originalResult:unknown;issue:string;createdAt:string;status:'REQUESTED'|'PUBLISHED';addendum?:Addendum;revisionHash?:string;publishedAt?:string}
type Store={read:(key:string)=>Promise<Correction|undefined>;mutate:(key:string,fn:(v:Correction|undefined)=>Correction)=>Promise<Correction>}
const key=(tx:string)=>'polydesk:receipt-correction:'+tx.toLowerCase()
const validTx=(tx:string)=>{if(!/^0x[a-fA-F0-9]{64}$/.test(tx)||/^0x0{64}$/.test(tx))throw new CorrectionError(400,'INVALID_RECEIPT')}
export function validateAddendum(raw:unknown):Addendum {
 const a=raw as Addendum
 const text=(v:unknown,max=5000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['summary','corrections','sources','remainingGaps','disposition','authorship'].includes(k))||!text(a.summary)||a.disposition!=='ESCALATE'||a.authorship!=='OPERATOR_REVIEWED')throw new CorrectionError(400,'INVALID_ADDENDUM')
 for(const list of [a.corrections,a.remainingGaps])if(!Array.isArray(list)||!list.length||list.length>20||list.some(v=>!text(v)))throw new CorrectionError(400,'INVALID_ADDENDUM')
 if(!Array.isArray(a.sources)||!a.sources.length||a.sources.length>20||a.sources.some(s=>!s||Object.keys(s).some(k=>!['url','observedAt','finding'].includes(k))||!text(s.finding)||!text(s.url,2000)||!/^https:\/\//.test(s.url)||!Number.isFinite(Date.parse(s.observedAt))))throw new CorrectionError(400,'INVALID_SOURCE')
 return {summary:a.summary,corrections:a.corrections,sources:a.sources.map(s=>({url:s.url,observedAt:s.observedAt,finding:s.finding})),remainingGaps:a.remainingGaps,disposition:a.disposition,authorship:a.authorship}
}
export class ReceiptCorrections {
 constructor(private store:Store={read:readDurableJson,mutate:mutateDurableJson},private paid:typeof readPaidResearchRecord=readPaidResearchRecord){}
 async original(tx:string){validTx(tx);const p=await this.paid(tx);if(!p||p.schema!=='polydesk-smart-trader-paid-analysis-v1'||p.payment.transaction.toLowerCase()!==tx.toLowerCase()||p.payment.network!=='Base'||p.payment.provider!=='CDP x402'||p.payment.amountAtomic!=='300000'||p.status!=='completed'||!p.response||!p.analysisHash)throw new CorrectionError(409,'COMPLETED_BASE_RECEIPT_REQUIRED');return p}
 async get(tx:string){validTx(tx);const c=await this.store.read(key(tx));if(!c)throw new CorrectionError(404,'CORRECTION_NOT_FOUND');return c}
 async request(tx:string,issue:string,previousRevisionHash?:string|null){
  const p=await this.original(tx)
  if(typeof issue!=='string'||!issue.trim()||issue.length>5000)throw new CorrectionError(400,'INVALID_ISSUE')
  if(previousRevisionHash!=null&&(typeof previousRevisionHash!=='string'||! /^[a-f0-9]{64}$/.test(previousRevisionHash)))throw new CorrectionError(400,'INVALID_REVISION_HASH')
  issue=issue.trim()
  return this.store.mutate(key(tx),c=>{
   if(c){
    if(c.originalAnalysisHash!==p.analysisHash||c.originalResultHash!==digest(p.response))throw new CorrectionError(409,'ORIGINAL_CHANGED')
    if(c.issue===issue&&!(c.status==='PUBLISHED'&&previousRevisionHash===c.revisionHash))return c
    if(c.previousRounds?.some(r=>r.issue===issue)&&previousRevisionHash!==c.revisionHash)throw new CorrectionError(409,'CORRECTION_ALREADY_RECORDED')
    if(c.status!=='PUBLISHED')throw new CorrectionError(409,'CORRECTION_PENDING')
    if(previousRevisionHash!==c.revisionHash)throw new CorrectionError(409,'CURRENT_REVISION_REQUIRED')
    const {round=1,issue:oldIssue,createdAt,status,addendum,revisionHash,publishedAt}=c
    return {...c,round:round+1,issue,createdAt:new Date().toISOString(),status:'REQUESTED',addendum:undefined,revisionHash:undefined,publishedAt:undefined,
     previousRounds:[...(c.previousRounds||[]),{round,issue:oldIssue,createdAt,status,addendum,revisionHash,publishedAt}]}
   }
   if(previousRevisionHash!=null)throw new CorrectionError(409,'CURRENT_REVISION_REQUIRED')
   return {schema:'polydesk-receipt-correction-v1',transaction:tx.toLowerCase(),originalAnalysisHash:p.analysisHash!,originalResultHash:digest(p.response),originalResult:p.response,issue,round:1,createdAt:new Date().toISOString(),status:'REQUESTED'}
  })
 }
 async publish(tx:string,originalHash:string,raw:unknown,requestedRound?:number){
  const p=await this.original(tx),a=validateAddendum(raw)
  return this.store.mutate(key(tx),c=>{
   if(!c)throw new CorrectionError(404,'CORRECTION_NOT_FOUND')
   const round=c.round??1
   if((requestedRound!==undefined&&requestedRound!==round)||(round>1&&requestedRound===undefined))throw new CorrectionError(409,'CURRENT_ROUND_REQUIRED')
   if(c.originalAnalysisHash!==originalHash||p.analysisHash!==originalHash||digest(p.response)!==c.originalResultHash)throw new CorrectionError(409,'ORIGINAL_CHANGED')
   const revisionHash=digest({transaction:c.transaction,originalAnalysisHash:c.originalAnalysisHash,addendum:a,...(round>1?{round,previousRevisionHash:c.previousRounds?.at(-1)?.revisionHash}: {})})
   if(c.status==='PUBLISHED'){if(c.revisionHash!==revisionHash)throw new CorrectionError(409,'REVISION_IMMUTABLE');return c}
   return {...c,status:'PUBLISHED',addendum:a,revisionHash,publishedAt:new Date().toISOString()}
  })
 }
}
export function correctionOperator(header:unknown,expected=process.env.POLYDESK_A2A_OPERATOR_KEY?.trim()||''){
 if(!expected)throw new CorrectionError(503,'OPERATOR_NOT_CONFIGURED');const supplied=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7):'';const a=Buffer.from(supplied),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))throw new CorrectionError(401,'OPERATOR_REQUIRED')
}
export function createReceiptCorrectionRouter(service=new ReceiptCorrections(),authorize=correctionOperator){const router=Router({mergeParams:true});router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});router.all('/',async(req,res)=>{try{
 let c:Correction
 if(req.method==='GET')c=await service.get((req.params as Record<string,string>).transaction)
 else if(req.method==='POST'){
 authorize(req.headers.authorization)
 const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b))throw new CorrectionError(400,'INVALID_INPUT')
 if(b.action==='REQUEST'&&Object.keys(b).every(k=>['action','issue','previousRevisionHash'].includes(k)))c=await service.request((req.params as Record<string,string>).transaction,b.issue,b.previousRevisionHash)
 else if(b.action==='PUBLISH'&&Object.keys(b).every(k=>['action','originalAnalysisHash','addendum','round'].includes(k)))c=await service.publish((req.params as Record<string,string>).transaction,b.originalAnalysisHash,b.addendum,b.round)
 else throw new CorrectionError(400,'INVALID_INPUT')
 }else{res.setHeader('Allow','GET, POST');throw new CorrectionError(405,'METHOD_NOT_ALLOWED')}
 const {originalResult,...view}=c
 return res.json({ok:true,correction:view,additionalPaymentRequired:false,tradeAuthorized:false,orderSubmitted:false,originalResultUrl:`/api/a2mcp/polymarket-smart-trader/payment/${c.transaction}`,followUpPrompts:c.status==='PUBLISHED'?['Show corrected findings','Compare original JSON and correction','Review corrected research','Decline and analyze another market']:['Check correction status']})
 }catch(e){const err=e instanceof CorrectionError?e:new CorrectionError(503,'CORRECTION_UNAVAILABLE');return res.status(err.status).json({ok:false,error:err.code,retryPayment:false})}});return router}
