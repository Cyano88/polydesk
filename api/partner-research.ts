import { publicDeliveryStatus, paidDeliveryGuidance } from './smart-trader-delivery-status.js'
import { createHash } from 'node:crypto'
import { Router, type Request } from 'express'
import { authenticatePartner, PartnerError, type Partner } from './partner-jobs.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'
import { smartTraderAnalysisRequestBinding, readPaidResearchRecord } from './polymarket-smart-trader.js'

const path = '/api/x402/base/polymarket-smart-trader'
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export type ResearchJob = { id: string; tenantId: string; applicationId: string; requestHash: string; request: unknown; createdAt: string; attemptId?: string; transaction?: string; payer?: string; correction?: { issue: string; requestedAt: string; status: 'REQUESTED' } }
export interface ResearchStore { read(key: string): Promise<ResearchJob | undefined>; mutate(key: string, fn: (current: ResearchJob | undefined) => ResearchJob): Promise<ResearchJob> }
const key = (p: Partner, id: string) => `polydesk:partner-research:${hash([p.tenantId,p.applicationId])}:${id}`
export class PartnerResearch {
 constructor(private store: ResearchStore = { read: readDurableJson, mutate: mutateDurableJson }) {}
 async create(p: Partner, idem: string, raw: unknown) {
  if (!/^[a-zA-Z0-9_.:-]{8,128}$/.test(idem)) throw new PartnerError(400,'IDEMPOTENCY_KEY_REQUIRED')
  if (!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(k=>!['action','query','marketId','marketUrl','outcome','side','limit','category','smartMoneyWallets'].includes(k))) throw new PartnerError(400,'INVALID_RESEARCH_INPUT')
  let binding: ReturnType<typeof smartTraderAnalysisRequestBinding>
  try { binding = smartTraderAnalysisRequestBinding(raw) } catch { throw new PartnerError(400,'INVALID_RESEARCH_INPUT') }
  if ((raw as { action?: string })?.action !== 'ANALYZE') throw new PartnerError(400,'ANALYZE_REQUIRED')
  const id='pdr_'+hash([p.tenantId,p.applicationId,idem])
  return this.store.mutate(key(p,id), current => {
   if (current) { if (current.requestHash!==binding.requestHash) throw new PartnerError(409,'IDEMPOTENCY_CONFLICT'); return current }
   return {id,tenantId:p.tenantId,applicationId:p.applicationId,requestHash:binding.requestHash,request:binding.request,createdAt:new Date().toISOString()}
  })
 }
 async get(p: Partner,id: string) {
  if (!/^pdr_[a-f0-9]{64}$/.test(id)) throw new PartnerError(404,'NOT_FOUND')
  const job=await this.store.read(key(p,id))
  if (!job || job.id!==id || job.tenantId!==p.tenantId || job.applicationId!==p.applicationId) throw new PartnerError(404,'NOT_FOUND')
  return job
 }
 async correct(p: Partner,id: string,issue: string) {
  await this.get(p,id)
  return this.store.mutate(key(p,id),current=>{
   if(!current?.transaction) throw new PartnerError(409,'PAYMENT_NOT_VERIFIED')
   if(current.correction) return current
   return {...current,correction:{issue,requestedAt:new Date().toISOString(),status:'REQUESTED'}}
  })
 }
 async bind(p: Partner,id: string,raw: unknown,attemptId?: string,transaction?: string,payer?: string) {
  const job=await this.get(p,id)
  if (job.requestHash!==smartTraderAnalysisRequestBinding(raw).requestHash) throw new PartnerError(409,'RESEARCH_REQUEST_MISMATCH')
  if (attemptId && !/^[a-f0-9]{64}$/.test(attemptId)) throw new PartnerError(400,'INVALID_ATTEMPT')
  if (transaction && (!attemptId || !/^0x[a-fA-F0-9]{64}$/.test(transaction) || !/^0x[a-fA-F0-9]{40}$/.test(payer || ''))) throw new PartnerError(400,'INVALID_SETTLEMENT')
  return this.store.mutate(key(p,id),current => {
   if (!current || current.requestHash!==job.requestHash) throw new PartnerError(409,'RESEARCH_REQUEST_MISMATCH')
   if ((current.attemptId && attemptId && current.attemptId!==attemptId) || (current.transaction && transaction && current.transaction!==transaction.toLowerCase()) || (current.payer && payer && current.payer!==payer.toLowerCase())) throw new PartnerError(409,'EXISTING_PAYMENT_REQUIRES_RECOVERY')
   return {...current,...(attemptId?{attemptId}:{}),...(transaction?{transaction:transaction.toLowerCase(),payer:payer!.toLowerCase()}:{})}
  })
 }
}
const jobs=new PartnerResearch()
export async function bindPartnerResearch(req: Request,raw: unknown,attemptId?: string,transaction?: string,payer?: string) {
 const id=req.headers?.['x-polydesk-research-job']
 if (id===undefined) return // Existing public marketplace buyers need no partner key.
 if (typeof id!=='string') throw new PartnerError(400,'INVALID_JOB_HEADER')
 const p=authenticatePartner(req.headers.authorization)
 if (!p.scopes.includes('jobs:create') || !p.scopes.includes('jobs:read')) throw new PartnerError(403,'FORBIDDEN')
 return jobs.bind(p,id,raw,attemptId,transaction,payer)
}
export const researchFee = { provider:'PolyDesk',amount:'0.30',asset:'USDC',network:'Base',chainId:'eip155:8453',amountAtomic:'300000',chargedAt:'ANALYZE',platformFeeIncluded:false,terms:'Inspect the live payment challenge for the recipient and expiry. Service payment never authorizes a trade.' }
export function createPartnerResearchRouter(service=jobs, dependencies={ ready:hasRenderDurableStore, authenticate:authenticatePartner, readPaid:readPaidResearchRecord }) {
 const router=Router()
 router.use(async(req,res,next)=>{
  try { const p=dependencies.authenticate(req.headers.authorization); if (!p.scopes.includes('jobs:read') || (req.method==='POST'&&!p.scopes.includes('jobs:create'))) throw new PartnerError(403,'FORBIDDEN'); if(!dependencies.ready()) throw new PartnerError(503,'STORAGE_UNAVAILABLE'); res.locals.researchPartner=p; next() }
  catch(e) { const error=e instanceof PartnerError?e:new PartnerError(503,'STORAGE_UNAVAILABLE'); res.status(error.status).json({ok:false,error:{code:error.code},retryPayment:false}) }
 })
 const handle=(create:boolean)=>async(req:Request,res:import('express').Response)=>{
  try {
   if(Object.keys(req.query).length) throw new PartnerError(400,'INVALID_INPUT')
   const p=res.locals.researchPartner as Partner
   const job=create?await service.create(p,req.get('Idempotency-Key')||'',req.body):await service.get(p,req.params.id)
   const paid=job.transaction?await dependencies.readPaid(job.transaction):undefined
   if(paid&&(paid.schema!=='polydesk-smart-trader-paid-analysis-v1'||paid.payment.transaction.toLowerCase()!==job.transaction||paid.payment.amountAtomic!=='300000'||paid.payment.provider!=='CDP x402'||paid.requestHash!==job.requestHash||paid.payment.payer.toLowerCase()!==job.payer||paid.payment.network!=='Base')) throw new PartnerError(409,'SETTLEMENT_BINDING_MISMATCH')
   const result=paid?.response || null
   const quality=paid?publicDeliveryStatus(paid.status,paid.response):null
   const state=quality?.deliveryStatus==='degraded'?'CORRECTION_REQUIRED':paid?.status==='completed'?'DELIVERED':paid?.status==='failed'?'CORRECTION_REQUIRED':job.transaction?(paid?'PROCESSING':'PAYMENT_RECOVERY_REQUIRED'):job.attemptId?'PAYMENT_RECOVERY_REQUIRED':'AWAITING_PAYMENT'
   res.json({ok:true,schemaVersion:'1.0.0',requestId:res.locals.requestId,jobId:job.id,status:state,request:job.request,fee:researchFee,transaction:job.transaction||null,paymentAttemptId:job.attemptId||null,result,
    delivery:quality,buyerGuidance:paid?paidDeliveryGuidance(paid.status,paid.response):null,correction:job.correction||null,
    researchQuality:'Inspect result researchStatus and deliveryStatus; DELIVERED is not a guarantee of available AI research.',
    links:{status:`/api/v1/research-jobs/${job.id}`,payment:path,recovery:path+'/recover',correction:`/api/v1/research-jobs/${job.id}/correction`,delivery:job.transaction?`/api/a2mcp/polymarket-smart-trader/payment/${job.transaction}`:null},
    paymentHeaders:{'X-PolyDesk-Research-Job':job.id,Authorization:'Use the same partner bearer credential; never publish it.'},
    retryPayment:false,signingAuthorized:false,orderSubmitted:false,
    nextActions:[{action:state==='AWAITING_PAYMENT'?'REVIEW_PAYMENT':state==='DELIVERED'?'SHOW_RESULTS':state==='CORRECTION_REQUIRED'?'REQUEST_CORRECTION':state==='PAYMENT_RECOVERY_REQUIRED'?'RECOVER_PAYMENT':'CHECK_STATUS',label:state==='AWAITING_PAYMENT'?'Review the PolyDesk fee and obtain payment approval':state==='DELIVERED'?'Read findings and original JSON before deciding':state==='CORRECTION_REQUIRED'?'Request correction under the existing payment; do not pay again':state==='PAYMENT_RECOVERY_REQUIRED'?'Reconcile the existing attempt; do not create a new payment':'Check the existing research job',authorizationRequired:state==='AWAITING_PAYMENT'}]})
  }catch(e){const error=e instanceof PartnerError?e:new PartnerError(503,'STORAGE_UNAVAILABLE');res.status(error.status).json({ok:false,error:{code:error.code},retryPayment:false})}
 }
 router.post('/',handle(true));router.get('/:id',handle(false));
 router.post('/:id/correction',async(req,res)=>{
  try {
   const b=req.body
   if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>k!=='issue')||typeof b.issue!=='string'||!b.issue.trim()||b.issue.length>2000) throw new PartnerError(400,'INVALID_CORRECTION')
   const p=res.locals.researchPartner as Partner
   const job=await service.get(p,req.params.id)
   if(!job.transaction) throw new PartnerError(409,'PAYMENT_NOT_VERIFIED')
   const correction=await service.correct(p,job.id,b.issue.trim())
   res.status(202).json({ok:true,jobId:job.id,correction:correction.correction,retryPayment:false,refundStatus:'NOT_ISSUED',message:'Correction request recorded for operator review. No new payment or refund has been executed.'})
  }catch(e){const error=e instanceof PartnerError?e:new PartnerError(503,'STORAGE_UNAVAILABLE');res.status(error.status).json({ok:false,error:{code:error.code},retryPayment:false})}
 });return router
}

export function partnerResearchPaths() {
 const responses={'200':{description:'Reservation or current research result; no charge from this operation.'},'202':{description:'Correction recorded, not a refund.'},'400':{description:'Invalid request.'},'401':{description:'Partner credential required.'},'403':{description:'Required jobs:read and, for writes, jobs:create scope missing.'},'404':{description:'Job not accessible to this application.'},'409':{description:'Request/payment conflict; recover existing operation.'},'503':{description:'Unavailable; preserve original operation and do not repay.'}}
 const security=[{PartnerKey:[]}]
 const id={name:'id',in:'path',required:true,schema:{type:'string',pattern:'^pdr_[a-f0-9]{64}$'}}
 const schema={type:'object',required:['action'],additionalProperties:false,properties:{action:{const:'ANALYZE'},query:{type:'string'},marketId:{type:'string'},marketUrl:{type:'string'},outcome:{type:'string'},side:{enum:['BUY','SELL']},category:{type:'string'},limit:{type:'integer'},smartMoneyWallets:{type:'array',items:{type:'string'}}}}
 return {
  '/research-jobs':{post:{operationId:'reservePartnerResearch',security,parameters:[{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:8,maxLength:128}}],requestBody:{required:true,content:{'application/json':{schema}}},responses}},
  '/research-jobs/{id}':{get:{operationId:'getPartnerResearch',security,parameters:[id],responses}},
  '/research-jobs/{id}/correction':{post:{operationId:'requestResearchCorrection',security,parameters:[id],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['issue'],additionalProperties:false,properties:{issue:{type:'string',minLength:1,maxLength:2000}}}}}},responses}},
 }
}
