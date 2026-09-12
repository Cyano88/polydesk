import { createHash, randomUUID } from 'node:crypto'
import { sendTransactionalEmail } from './email-provider.js'
import type { Incident, MonitorStore } from './delivery-monitor.js'

type Config = {to:string;from:string}
type Notice = {state:'SENDING'|'PROVIDER_ACCEPTED'|'RETRY_PENDING'|'REVIEW_REQUIRED';attempts:number;firstAttemptAt:number;nextAttemptAt:number;token:string;acceptedAt?:string;payload:Parameters<typeof sendTransactionalEmail>[0]}
const PREFIX='polydesk:failure-email:'
export function failureEmailConfig():Config|null {
 const to=process.env.POLYDESK_FAILURE_ALERT_TO_EMAIL?.trim()||'',from=process.env.POLYMARKET_ALERT_FROM_EMAIL?.trim()||''
 return process.env.POLYDESK_FAILURE_ALERT_EMAIL_ENABLED==='true'&&process.env.RESEND_API_KEY?.trim()&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)&&from ? {to,from}:null
}
export class DeliveryFailureEmail {
 constructor(private store:Pick<MonitorStore,'read'|'mutate'>,private config=failureEmailConfig,private send=sendTransactionalEmail,private now=Date.now){}
 async notify(incident:Incident){
  const config=this.config();if(!config||incident.status!=='OPEN')return
  const key=PREFIX+createHash('sha256').update(`${incident.id}:${incident.episode}:${incident.version}:${config.to}`).digest('hex')
  const now=this.now(),token=randomUUID()
  const notice=await this.store.mutate<Notice>(key,old=>{
   if(old&&(old.state==='PROVIDER_ACCEPTED'||old.state==='REVIEW_REQUIRED'||old.nextAttemptAt>now))return old
   // Never retry outside the provider's 24-hour idempotency window.
   if(old&&(old.attempts>=3||now-old.firstAttemptAt>=23*60*60*1000))return {...old,state:'REVIEW_REQUIRED'}
   const reasons=incident.reasons.filter(r=>/^[A-Z_]+$/.test(r)).join(', ')
   const text=`A PolyDesk research delivery needs attention.\n\nIncident: ${incident.id}\nFailure: ${reasons}\nOpened: ${incident.openedAt}\n\nOpen the PolyDesk operator incident log and review this incident. This email does not run research, charge a buyer, issue a refund, or authorize a trade.\n\nNext prompt: Review this failure incident without paying or rerunning research.`
   return {state:'SENDING',attempts:(old?.attempts||0)+1,firstAttemptAt:old?.firstAttemptAt??now,nextAttemptAt:now+5*60*1000,token,
    payload:old?.payload??{to:config.to,fromEmail:config.from,fromName:'PolyDesk',subject:`PolyDesk delivery failure - ${incident.id.slice(0,10)}`,text,html:'<pre>'+text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</pre>',context:'Delivery failure alert',idempotencyKey:key}}
  })
  if(notice.token!==token||notice.state!=='SENDING')return
  try{
   await this.send(notice.payload)
   await this.store.mutate<Notice>(key,current=>{if(!current)throw Error('NOTICE_MISSING');return current.token===token?{...current,state:'PROVIDER_ACCEPTED',acceptedAt:new Date(this.now()).toISOString()}:current})
  }catch{
   await this.store.mutate<Notice>(key,current=>{if(!current)throw Error('NOTICE_MISSING');return current.token===token?{...current,state:current.attempts>=3?'REVIEW_REQUIRED':'RETRY_PENDING'}:current})
  }
 }
 async status(){return {notificationDelivery:this.config()?'EMAIL_ENABLED':'DISABLED',notificationMeaning:'PROVIDER_ACCEPTED means the email provider accepted the message; inbox delivery is not confirmed.'}}
 async receipt(incident:Incident){const c=this.config();if(!c)return null;const key=PREFIX+createHash('sha256').update(`${incident.id}:${incident.episode}:${incident.version}:${c.to}`).digest('hex');const n=await this.store.read<Notice>(key);return n?{state:n.state,attempts:n.attempts,acceptedAt:n.acceptedAt??null}:null}
}
