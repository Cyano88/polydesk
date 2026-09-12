import { createHash } from 'node:crypto'
import { Router } from 'express'
import { CorrectionError, correctionOperator } from './receipt-correction.js'
import { readDurableJson, mutateDurableJson, pageDurableJsonByPrefix } from './render-durable-store.js'
import { hasMissingZeroScoutProofDelivery, type SmartTraderPaidAnalysisRecord } from './polymarket-smart-trader.js'

const PAID='polydesk:smart-trader:paid-analysis:'
const INCIDENT='polydesk:delivery-incident:'
const HEARTBEAT='polydesk:delivery-monitor:v1'
export interface MonitorStore {
 read<T>(key:string):Promise<T|undefined>;
 mutate<T>(key:string,fn:(value:T|undefined)=>T):Promise<T>;
 page<T>(prefix:string,after:string,limit:number):Promise<Array<{key:string;value:T}>>;
}
export type Incident={schema:'polydesk-delivery-incident-v1';id:string;transaction:string;status:'OPEN'|'ACKNOWLEDGED'|'RESOLVED';reasons:string[];openedAt:string;lastObservedAt:string;resolvedAt?:string;acknowledgedAt?:string;episode:number;version:number}
type Heartbeat={cursor:string;lastStartedAt?:string;lastSuccessAt?:string;lastFailureAt?:string;lastFailureCode?:string;lastCycleCompletedAt?:string;scanned?:number;eligible?:number;recovered?:number;recoveryFailures?:number;recoveryAttempts?:number}
const idFor=(tx:string)=>createHash('sha256').update(tx.toLowerCase()).digest('hex')
export function deliveryFailureReasons(record:SmartTraderPaidAnalysisRecord,now:number,eligible:boolean) {
 const evidence=record.response?.decision as {evidence?:{researchStatus?:string}}|undefined
 const research=evidence?.evidence?.researchStatus
 const reasons:string[]=[]
 if(research==='UNAVAILABLE')reasons.push('RESEARCH_UNAVAILABLE')
 if(record.status==='failed')reasons.push('DELIVERY_FAILED')
 if(record.status==='completed'&&!['AVAILABLE','UNAVAILABLE'].includes(research||''))reasons.push('RESEARCH_STATUS_UNKNOWN')
 if(record.status==='completed'&&(eligible||hasMissingZeroScoutProofDelivery(record.response)))reasons.push('INCOMPLETE_DELIVERY')
 if(['settled','running'].includes(record.status)) {
  const settled=Date.parse(record.settledAt)
  if(!Number.isFinite(settled)||!Number.isFinite(Date.parse(record.updatedAt)))reasons.push('INVALID_DELIVERY_TIMESTAMPS')
  else if(now-settled>=300000)reasons.push('DELIVERY_OVERDUE')
 }
 if(reasons.length&&(record.deliveryAttemptCount??record.remediationCount??0)>=Math.max(6,record.maxDeliveryAttempts??0))reasons.push('RECOVERY_EXHAUSTED')
 return reasons.sort()
}
export class DeliveryMonitor {
 constructor(private store:MonitorStore={read:readDurableJson,mutate:mutateDurableJson,page:pageDurableJsonByPrefix}){}
 async observe(record:SmartTraderPaidAnalysisRecord,reasons:string[],now:number,healthy=false) {
  const transaction=record.payment.transaction.toLowerCase(),id=idFor(transaction),key=INCIDENT+id,at=new Date(now).toISOString()
  if(!reasons.length&&!await this.store.read<Incident>(key))return
  await this.store.mutate<Incident>(key,old=>{
   if(!reasons.length){if(!old)throw Error('INCIDENT_NOT_FOUND');return healthy&&old.status!=='RESOLVED'?{...old,status:'RESOLVED',resolvedAt:at,lastObservedAt:at,version:old.version+1}:old}
   if(old?.reasons.includes('RECOVERY_ATTEMPT_FAILED')&&!reasons.includes('RECOVERY_ATTEMPT_FAILED'))reasons=[...reasons,'RECOVERY_ATTEMPT_FAILED'].sort()
   const changed=Boolean(old&&(old.status==='RESOLVED'||JSON.stringify(old.reasons)!==JSON.stringify(reasons)))
   return {schema:'polydesk-delivery-incident-v1',id,transaction,status:!old||changed?'OPEN':old.status,reasons,
    openedAt:!old||old.status==='RESOLVED'?at:old.openedAt,lastObservedAt:at,episode:(old?.episode??0)+(!old||old.status==='RESOLVED'?1:0),
    version:(old?.version??0)+(!old||changed?1:0),...(!changed&&old?.acknowledgedAt?{acknowledgedAt:old.acknowledgedAt}:{})}
  })
 }
 async sweep(options:{eligible:(r:SmartTraderPaidAnalysisRecord,n:number)=>boolean;recover:(r:SmartTraderPaidAnalysisRecord)=>Promise<unknown>;now?:()=>number}) {
  const now=options.now??Date.now,started=new Date(now()).toISOString()
  const heartbeat=await this.store.mutate<Heartbeat>(HEARTBEAT,h=>({...h,cursor:h?.cursor??'',lastStartedAt:started}))
  try {
   const rows=await this.store.page<SmartTraderPaidAnalysisRecord>(PAID,heartbeat.cursor,100)
   let eligible=0,recovered=0,recoveryFailures=0,recoveryAttempts=0
   for(const {key,value:record} of rows) {
    if(record?.schema!=='polydesk-smart-trader-paid-analysis-v1'||!/^0x[a-fA-F0-9]{64}$/.test(record.payment?.transaction||''))throw Error('INVALID_DELIVERY_RECORD')
    const canRecover=options.eligible(record,now())
    const reasons=deliveryFailureReasons(record,now(),canRecover)
    await this.observe(record,reasons,now(),record.status==='completed'&&!reasons.length)
    if(canRecover){eligible++;if(recoveryAttempts<4){
     recoveryAttempts++
     try {
      await options.recover(record)
      const current=await this.store.read<SmartTraderPaidAnalysisRecord>(key)
      if(current){const nextReasons=deliveryFailureReasons(current,now(),options.eligible(current,now()));const healthy=current.status==='completed'&&!nextReasons.length;await this.observe(current,nextReasons,now(),healthy);if(healthy)recovered++}
     }catch{recoveryFailures++;await this.observe(record,[...new Set([...reasons,'RECOVERY_ATTEMPT_FAILED'])].sort(),now())}
    }}
   }
   const complete=rows.length<100
   const stats={scanned:rows.length,eligible,recovered,recoveryFailures,recoveryAttempts}
   await this.store.mutate<Heartbeat>(HEARTBEAT,h=>({...h,cursor:complete?'':rows.at(-1)!.key,lastStartedAt:started,lastSuccessAt:new Date(now()).toISOString(),lastFailureCode:undefined,...(complete?{lastCycleCompletedAt:new Date(now()).toISOString()}:{}),...stats}))
   return stats
  }catch(error){await this.store.mutate<Heartbeat>(HEARTBEAT,h=>({...h,cursor:h?.cursor??'',lastFailureAt:new Date(now()).toISOString(),lastFailureCode:'SWEEP_FAILED'}));throw error}
 }
 async status(now=Date.now()) {
  const heartbeat=await this.store.read<Heartbeat>(HEARTBEAT)
  const interval=Math.max(30000,Number(process.env.SMART_TRADER_RECOVERY_INTERVAL_MS)||60000)
  return {heartbeat:heartbeat??null,workerStatus:!heartbeat?'NOT_OBSERVED':heartbeat.lastFailureCode?'FAILED':!heartbeat.lastSuccessAt||now-Date.parse(heartbeat.lastSuccessAt)>Math.max(180000,interval*3)?'STALE':'HEALTHY',notificationDelivery:'DISABLED',paymentRequired:false}
 }
 async list(after=''){const rows=await this.store.page<Incident>(INCIDENT,after,100);return {incidents:rows.map(r=>r.value),nextCursor:rows.length===100?rows.at(-1)!.key:null}}
 async acknowledge(id:string,version:number) {
  if(!/^[a-f0-9]{64}$/.test(id)||!Number.isSafeInteger(version)||version<1)throw new CorrectionError(400,'INVALID_INCIDENT')
  return this.store.mutate<Incident>(INCIDENT+id,c=>{
   if(!c)throw new CorrectionError(404,'INCIDENT_NOT_FOUND')
   if(c.version!==version)throw new CorrectionError(409,'INCIDENT_CHANGED')
   if(c.status==='RESOLVED')throw new CorrectionError(409,'INCIDENT_ALREADY_RESOLVED')
   return c.status==='ACKNOWLEDGED'?c:{...c,status:'ACKNOWLEDGED',acknowledgedAt:new Date().toISOString()}
  })
 }
}
export function createDeliveryIncidentRouter(service=new DeliveryMonitor(),authorize=correctionOperator) {
 const router=Router()
 router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');try{authorize(req.headers.authorization);next()}catch(e){const err=e as CorrectionError;res.status(err.status||503).json({ok:false,error:err.code||'MONITOR_UNAVAILABLE'})}})
 router.get('/',async(req,res)=>{try{if(Object.keys(req.query).some(k=>k!=='after')||(req.query.after!==undefined&&(typeof req.query.after!=='string'||!/^polydesk:delivery-incident:[a-f0-9]{64}$/.test(req.query.after))))throw new CorrectionError(400,'INVALID_CURSOR');res.json({ok:true,...await service.status(),...await service.list(req.query.after as string||''),followUpPrompts:['Review open incidents','Acknowledge a reviewed incident','Check the original delivery before recovery']})}catch(e){const err=e as CorrectionError;res.status(err.status||503).json({ok:false,error:err.code||'MONITOR_UNAVAILABLE'})}})
 router.post('/:id/acknowledge',async(req,res)=>{try{if(Object.keys(req.query).length||!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==1||!('version'in req.body))throw new CorrectionError(400,'INVALID_INPUT');res.json({ok:true,incident:await service.acknowledge(req.params.id,req.body.version),researchStarted:false,paymentRequired:false,followUpPrompts:['Review the delivery issue','Check recovery eligibility']})}catch(e){const err=e as CorrectionError;res.status(err.status||503).json({ok:false,error:err.code||'MONITOR_UNAVAILABLE'})}})
 return router
}
