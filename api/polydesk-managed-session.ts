import { createHash } from 'node:crypto'
import type { ManagedPreferences, ManagedSubscriptionIdentity } from './polydesk-managed-agent-subscription.js'
import { taskResearchInputError } from './polymarket-smart-trader.js'

type Obj = Record<string, any>
type Operation = { hash: string; state: 'pending' | 'done'; result?: Obj }
export type ManagedSession = { buyer: string; preferences: Obj; revision: string; busy?: string; operations: Record<string, Operation> }
export type ManagedSessionDeps = {
  now: () => number
  mutate: (key: string, change: (old: ManagedSession | undefined) => ManagedSession) => Promise<ManagedSession>
  validatePreferences: (raw: unknown) => ManagedPreferences
  enroll: (preferences: ManagedPreferences) => Promise<Obj>
  status: () => Promise<Obj>
  recall: (proof: Obj) => Promise<Obj>
  research: (input: Obj, context?: Obj) => Promise<Obj>
  prepareBuy: (input: Obj) => Promise<Obj>
  prepareSell: (input: Obj) => Promise<Obj>
  continueTrade?: (input: Obj) => Promise<Obj>
}
const object = (v: unknown): v is Obj => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const canonical = (v: any): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : object(v)
  ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v)
const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
const fields: Record<string, string> = {
  address: 'Which public wallet should I monitor?',
  email: 'Which email should receive monitoring notifications?',
  lossThresholdPercent: 'What percentage loss should trigger an alert (0-95)?',
  profitThresholdPercent: 'What percentage profit should trigger an alert (0-500)?',
  newPositionAlertsEnabled: 'Would you like new-position alerts?',
  resolvedAlertsEnabled: 'Would you like market-resolution alerts?',
  claimableAlertsEnabled: 'Would you like claimable-position alerts?',
  digestFrequency: 'Would you like daily summaries, weekly summaries, or no summaries?',
  digestTimezone: 'Which timezone should summaries use?',
  digestHourLocal: 'At what local hour should summaries arrive (0-23)?',
  digestWeekday: 'For weekly summaries, which weekday (0=Sunday through 6=Saturday)?',
}
const result = (state: string, extra: Obj = {}) => ({ ok: true, schema: 'polydesk-managed-session-v1', state, tradeAuthorized: false, orderSubmitted: false, ...extra })
function checkKeys(v: Obj, keys: string[]) {
  if (Object.keys(v).some(k => !keys.includes(k))) throw new Error('Unsupported managed conversation field.')
}
function partial(raw: unknown) {
  if (!object(raw)) throw new Error('Preference answers must be an object.')
  checkKeys(raw, Object.keys(fields))
  for (const [k,v] of Object.entries(raw)) {
    if (k.endsWith('Enabled') && typeof v !== 'boolean') throw new Error('Alert choices must be true or false.')
    if (['lossThresholdPercent','profitThresholdPercent','digestHourLocal','digestWeekday'].includes(k) && (!Number.isInteger(v) || v < 0 || v > ({lossThresholdPercent:95,profitThresholdPercent:500,digestHourLocal:23,digestWeekday:6} as Obj)[k])) throw new Error('Preference number is out of range.')
    if (['address','email','digestFrequency','digestTimezone'].includes(k) && (typeof v !== 'string' || !v.trim() || v.length > 160)) throw new Error('Preference text is invalid.')
    if (k === 'address' && !/^0x[a-fA-F0-9]{40}$/.test(v)) throw new Error('A public EVM wallet is required.')
    if (k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('A valid notification email is required.')
    if (k === 'digestFrequency' && !['off','daily','weekly'].includes(v)) throw new Error('Invalid summary frequency.')
    if (k === 'digestTimezone') { try { new Intl.DateTimeFormat('en',{timeZone:v}) } catch { throw new Error('Invalid timezone.') } }
  }
  return raw
}
function questions(p: Obj) {
  return Object.entries(fields).filter(([k]) => !(k in p)
    && (!['digestTimezone','digestHourLocal'].includes(k) || ['daily','weekly'].includes(p.digestFrequency))
    && (k !== 'digestWeekday' || p.digestFrequency === 'weekly')).map(([field,prompt]) => ({field,prompt}))
}
function preferences(p: Obj) {
  return { ...p, integrationSource:'okx-ai', ...(p.digestFrequency === 'off' ? {digestTimezone:'UTC',digestHourLocal:0,digestWeekday:0} : p.digestFrequency === 'daily' ? {digestWeekday:0} : {}) }
}

/** Called only by the private operator after authoritative subscription verification. */
export async function runManagedSession(subscription: ManagedSubscriptionIdentity, raw: unknown, deps: ManagedSessionDeps) {
  if (!object(raw)) throw new Error('Managed conversation must be an object.')
  checkKeys(raw, ['requestId','action','answers','revision','research','useMemory','ownerAddress','memoryProof','trade','execution'])
  if (typeof raw.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(raw.requestId)) throw new Error('A stable requestId is required.')
  if (!['STATUS','PREFERENCES','CONFIRM_ONBOARDING','RESEARCH','PREPARE_TRADE','CHECK_TRADE'].includes(raw.action)) throw new Error('Unsupported conversation action.')
  if (subscription.status !== 'active' || Date.parse(subscription.periodEndAt) <= deps.now()) return result('SUBSCRIPTION_INACTIVE',{followUpPrompts:['Review subscription status before continuing.']})
  if (raw.action === 'PREFERENCES') partial(raw.answers)
  if (raw.action === 'RESEARCH') {
    const invalid=taskResearchInputError(raw.research); if(invalid) throw new Error(invalid)
    if(typeof raw.useMemory !== 'boolean') return result('MEMORY_CHOICE_REQUIRED',{followUpPrompts:['Include owner-authorized receipt history, or research without private history?']})
    if(raw.useMemory && (!object(raw.memoryProof) || raw.memoryProof.owner !== raw.ownerAddress)) throw new Error('Memory proof must match the explicitly selected trading owner.')
  }
  if(raw.action === 'PREPARE_TRADE' && !object(raw.trade)) throw new Error('Exact trade preparation inputs are required.')
  if(raw.action==='CHECK_TRADE' && !object(raw.execution))throw new Error('Owner-signed execution access is required.')
  const currentStatus=await deps.status()
  if(currentStatus.enrolled && currentStatus.subscriptionState && currentStatus.subscriptionState !== 'active') return result('SUBSCRIPTION_INACTIVE',{followUpPrompts:['Resume or review the subscription before continuing.']})
  const initialPreferences=object(currentStatus.preferences) ? partial(currentStatus.preferences) : {}
  // No reusable credentials or recall signatures are persisted; only the complete input hash.
  const inputHash=digest(raw), key='polydesk:managed:session:'+digest([subscription.jobId,subscription.buyerAgentId])
  let acquired=false
  let session=await deps.mutate(key, old => {
    const s=old ?? {buyer:subscription.buyerAgentId,preferences:initialPreferences,revision:digest(initialPreferences),operations:{}}
    if(s.buyer!==subscription.buyerAgentId) throw new Error('Managed conversation buyer mismatch.')
    const op=s.operations[raw.requestId]
    if(op){if(op.hash!==inputHash)throw new Error('requestId is already bound to different inputs.');return s}
    if(s.busy)throw new Error('Previous operation is uncertain or running; reconcile it before another action.')
    if(Object.keys(s.operations).length>=500)throw new Error('Conversation retention limit reached; operator archival is required.')
    acquired=true
    return {...s,busy:raw.requestId,operations:{...s.operations,[raw.requestId]:{hash:inputHash,state:'pending'}}}
  })
  const previous=session.operations[raw.requestId]
  if(!acquired) return previous.state==='done' ? {...previous.result,idempotentReplay:true} : result('RECONCILIATION_REQUIRED',{followUpPrompts:['Check the existing operation; do not repeat its side effects.']})
  let output: Obj
  let updatedPreferences=session.preferences
  try {
    if(raw.action==='PREFERENCES'){
      const proposed={...session.preferences,...partial(raw.answers)}
      const missing=questions(proposed)
      if(!missing.length)deps.validatePreferences(preferences(proposed))
      updatedPreferences=proposed
      output=result(missing.length?'PREFERENCES_REQUIRED':'CONFIRM_PREFERENCES',{questions:missing,preferences:updatedPreferences,revision:digest(updatedPreferences),followUpPrompts:missing.length?missing.map(x=>x.prompt):['Confirm these monitoring preferences?']})
    } else if(raw.action==='CONFIRM_ONBOARDING'){
      if(raw.revision!==session.revision || questions(session.preferences).length)throw new Error('Confirm the current complete preference revision.')
      const enrollment=await deps.enroll(deps.validatePreferences(preferences(session.preferences)))
      output=result(enrollment.monitoringEnabled?'MONITORING_ACTIVE':'EMAIL_VERIFICATION_REQUIRED',{enrollment,followUpPrompts:enrollment.monitoringEnabled?['Show monitored positions?','Review a trade?','Change alerts or pause monitoring?']:['Verify the confirmation email, then check monitoring status.']})
    } else if(raw.action==='STATUS'){
      const status=currentStatus
      const active=status.monitoringEnabled===true
      output=result(active?'MONITORING_ACTIVE':status.enrolled?'EMAIL_VERIFICATION_REQUIRED':'PREFERENCES_REQUIRED',{status,questions:status.enrolled?[]:questions(session.preferences),followUpPrompts:active?['Show monitored positions?','Review a trade?','Change alerts or pause monitoring?']:status.enrolled?['Verify your notification email.']:questions(session.preferences).map(x=>x.prompt)})
    } else if(raw.action==='RESEARCH'){
      let context:Obj|undefined
      if(raw.useMemory){
        context=await deps.recall(raw.memoryProof)
        if(context.ok!==true || context.source!=='SIBYL_VERIFIED_RECEIPTS' || !Array.isArray(context.records))throw new Error('Owner-authorized receipt memory is unavailable; choose research without memory explicitly if desired.')
      }
      if(Date.parse(subscription.periodEndAt)<=deps.now())throw new Error('Subscription expired before research.')
      const research=await deps.research(raw.research,context)
      output=result(research.ok?'RESULTS_READY':'RESEARCH_UNAVAILABLE',{research,...(context?{receiptContext:{source:context.source,historyComplete:false,records:context.records,nextCursor:context.nextCursor??null}}:{}),followUpPrompts:research.ok?['Show findings and evidence gaps?','Prepare an independently approved exact trade?','Decline and analyze another market?']:['Review the research failure before starting another request.']})
    } else if(raw.action==='CHECK_TRADE'){
      if(!deps.continueTrade)throw new Error('Managed receipt continuation is unavailable.')
      output=await deps.continueTrade(raw.execution)
    } else {
      const trade=raw.trade
      if(!['BUY','SELL'].includes(trade.side))throw new Error('Exact BUY or SELL side is required.')
      const preview=trade.side==='BUY'?await deps.prepareBuy(trade):await deps.prepareSell(trade)
      output=result(preview.ok?'TRADE_PREVIEW':'TRADE_BLOCKED',{preview,followUpPrompts:preview.ok?['Review the exact preview and fees before authorizing execution.','Decline or revise this trade?']:['Resolve the reported readiness issue, then request a fresh preview.']})
    }
  } catch {
    output=result('OPERATOR_REVIEW_REQUIRED',{ok:false,followUpPrompts:['Review this operation before retrying; no automatic retry or trade is authorized.']})
  }
  session=await deps.mutate(key, old=>{
    if(!old || old.busy!==raw.requestId || old.operations[raw.requestId]?.hash!==inputHash)throw new Error('Managed operation binding changed.')
    return {...old,busy:undefined,preferences:updatedPreferences,revision:digest(updatedPreferences),operations:{...old.operations,[raw.requestId]:{hash:inputHash,state:'done',result:output}}}
  })
  return {...session.operations[raw.requestId].result,idempotentReplay:false}
}
