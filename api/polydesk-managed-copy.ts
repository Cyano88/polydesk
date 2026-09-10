import { createHash } from 'node:crypto'
import { verifyMessage } from 'ethers'

export type ManagedCopyPolicy = {
  schema: 'polydesk-managed-copy-policy-v1'; jobId: string; buyerAgentId: string
  owner: string; sourceWallet: string; nonce: string
  perTradeUsdc: string; dailyCapUsdc: string; maximumPrice: string
  maximumTrades: number; issuedAt: number; expiresAt: number
  side: 'BUY'; orderType: 'FOK'
}
export type CopySignal = { id: string; sourceWallet: string; tokenId: string; conditionId: string; side: 'BUY'; observedAt: number }
export type CopyPlan = { owner: string; tokenId: string; conditionId: string; side: 'BUY'; orderType: 'FOK'; price: string; maximumCostUsdc: string; expiresAt: number; ready: boolean }
export type VerifiedCopyReceipt = { verified: true; finalized: true; executionId: string; owner: string; tokenId: string; conditionId: string; side: 'BUY'; orderId: string; transactionHash: string; spentUsdc: string }
type Attempt = { executionId: string; policyId: string; state: 'reserved'|'uncertain'|'complete'; plan: CopyPlan; receipt?: VerifiedCopyReceipt }
export type CopyLedger = { revokedPolicies: string[]; attempts: Record<string,Attempt>; daily: Record<string,string>; counts: Record<string,number> }
export type ManagedCopyDeps = {
  now:()=>number
  active:(jobId:string,buyer:string)=>Promise<boolean>
  mutate:(key:string,change:(ledger:CopyLedger|undefined)=>CopyLedger)=>Promise<CopyLedger>
  signal:(sourceWallet:string,signalId:string)=>Promise<CopySignal>
  prepare:(signal:CopySignal,policy:ManagedCopyPolicy)=>Promise<CopyPlan>
  execute:(executionId:string,plan:CopyPlan)=>Promise<void>
  reconcile:(executionId:string,plan:CopyPlan)=>Promise<VerifiedCopyReceipt|null>
}
const hash=(v:string)=>createHash('sha256').update(v).digest('hex')
const keys=['schema','jobId','buyerAgentId','owner','sourceWallet','nonce','perTradeUsdc','dailyCapUsdc','maximumPrice','maximumTrades','issuedAt','expiresAt','side','orderType'] as const
function units(value: string) {
  if(typeof value!=='string'||!/^\d+(?:\.\d{1,6})?$/.test(value))throw new Error('Exact decimal-string limit required.')
  const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))
}
export function managedCopyPolicyMessage(policy: ManagedCopyPolicy) {
  if(!policy||typeof policy!=='object'||Object.keys(policy).some(k=>!keys.includes(k as any)))throw new Error('Unsupported copy policy fields.')
  if(policy.schema!=='polydesk-managed-copy-policy-v1'||policy.side!=='BUY'||policy.orderType!=='FOK')throw new Error('Only bounded FOK BUY copying is supported.')
  if(!/^[a-zA-Z0-9_-]{6,128}$/.test(policy.jobId)&&!/^0x[a-fA-F0-9]{64}$/.test(policy.jobId))throw new Error('Invalid subscription job.')
  if(!/^\d{1,20}$/.test(policy.buyerAgentId)||!/^0x[a-f0-9]{40}$/.test(policy.owner)||!/^0x[a-f0-9]{40}$/.test(policy.sourceWallet)||!/^[a-zA-Z0-9_-]{8,100}$/.test(policy.nonce))throw new Error('Invalid owner, source, buyer or policy nonce.')
  if(units(policy.perTradeUsdc)<=0n||units(policy.dailyCapUsdc)<units(policy.perTradeUsdc)||units(policy.maximumPrice)<=0n||units(policy.maximumPrice)>=1000000n||!Number.isInteger(policy.maximumTrades)||policy.maximumTrades<1||policy.maximumTrades>1000||!Number.isSafeInteger(policy.issuedAt)||!Number.isSafeInteger(policy.expiresAt)||policy.issuedAt>=policy.expiresAt)throw new Error('Invalid bounded copy limits.')
  return ['PolyDesk Managed Copy Authorization v1','https://polydesk.trade','Chain: 137','Fees included in all spend caps','UTC daily budget; no sell, claim, transfer or unlimited approval authority',...keys.map(k=>k+': '+policy[k])].join('\n')
}
function identity(policy:ManagedCopyPolicy,signature:string){
 const message=managedCopyPolicyMessage(policy)
 if(verifyMessage(message,signature).toLowerCase()!==policy.owner)throw new Error('Copy authorization owner mismatch.')
 return hash(message)
}
const ledgerKey=(p:ManagedCopyPolicy)=>'polydesk:managed:copy:'+hash(p.jobId+':'+p.buyerAgentId+':'+p.owner)
const empty=():CopyLedger=>({revokedPolicies:[],attempts:{},daily:{},counts:{}})
const follow=(state:string,extra:Record<string,unknown>={})=>({state,...extra,followUpPrompts:state==='COMPLETE'?['Show the verified trade receipt?','Monitor this position?','Pause copying or review the next market?']:state==='UNCERTAIN'?['Reconcile this exact execution before any further copying.']:['Review the copy policy, limits, or subscription status.']})
function receiptMatches(r:VerifiedCopyReceipt,a:Attempt,p:ManagedCopyPolicy){
 return r.verified===true&&r.finalized===true&&r.executionId===a.executionId&&r.owner===p.owner&&r.tokenId===a.plan.tokenId&&r.conditionId===a.plan.conditionId&&r.side==='BUY'&&/^0x[a-fA-F0-9]{64}$/.test(r.orderId)&&/^0x[a-fA-F0-9]{64}$/.test(r.transactionHash)&&units(r.spentUsdc)>0n&&units(r.spentUsdc)<=units(a.plan.maximumCostUsdc)
}
/** Executor and reconciler must be trusted adapters, never fields supplied by a buyer request. */
export async function processManagedCopySignal(policy:ManagedCopyPolicy,signature:string,signalId:string,deps:ManagedCopyDeps):Promise<Record<string,any>>{
 const policyId=identity(policy,signature), key=ledgerKey(policy)
 if(!/^[a-zA-Z0-9:_-]{8,160}$/.test(signalId))throw new Error('Stable observed signal ID required.')
 const attemptId=hash(policy.sourceWallet+':'+signalId)
 let ledger=await deps.mutate(key,old=>old??empty())
 const previous=ledger.attempts[attemptId]
 if(previous){
  if(previous.policyId!==policyId)return follow('SIGNAL_ALREADY_BOUND')
  if(previous.state==='complete')return follow('COMPLETE',{receipt:previous.receipt,idempotentReplay:true})
  let receipt:VerifiedCopyReceipt|null=null
  try{receipt=await deps.reconcile(previous.executionId,previous.plan)}catch{}
  if(!receipt||!receiptMatches(receipt,previous,policy))return follow('UNCERTAIN',{executionId:previous.executionId})
  await deps.mutate(key,old=>{
   if(!old||old.attempts[attemptId]?.executionId!==previous.executionId)throw new Error('Execution binding changed.')
   return {...old,attempts:{...old.attempts,[attemptId]:{...old.attempts[attemptId],state:'complete',receipt}}}
  })
  return follow('COMPLETE',{receipt})
 }
 if(ledger.revokedPolicies.includes(policyId)||policy.issuedAt>deps.now()||policy.expiresAt<=deps.now()||policy.expiresAt>policy.issuedAt+7*86400000||!await deps.active(policy.jobId,policy.buyerAgentId))return follow('POLICY_INACTIVE')
 const signal=await deps.signal(policy.sourceWallet,signalId)
 if(signal.id!==signalId||signal.sourceWallet!==policy.sourceWallet||signal.side!=='BUY'||!Number.isSafeInteger(signal.observedAt)||signal.observedAt<policy.issuedAt||signal.observedAt>deps.now()+1000||deps.now()-signal.observedAt>60000||!/^\d+$/.test(signal.tokenId)||!/^0x[a-fA-F0-9]{64}$/.test(signal.conditionId))throw new Error('Observed signal does not match the approved source and market.')
 const plan=await deps.prepare(signal,policy)
 if(!plan.ready||plan.owner!==policy.owner||plan.tokenId!==signal.tokenId||plan.conditionId!==signal.conditionId||plan.side!=='BUY'||plan.orderType!=='FOK'||units(plan.price)<=0n||units(plan.price)>units(policy.maximumPrice)||units(plan.maximumCostUsdc)<=0n||units(plan.maximumCostUsdc)>units(policy.perTradeUsdc)||!Number.isSafeInteger(plan.expiresAt)||plan.expiresAt<=deps.now())return follow('READINESS_BLOCKED')
 if(!await deps.active(policy.jobId,policy.buyerAgentId))return follow('POLICY_INACTIVE')
 const executionId='pmc_'+hash(key+':'+attemptId).slice(0,48)
 let acquired=false
 ledger=await deps.mutate(key,old=>{
  const s=old??empty()
  if(s.attempts[attemptId])return s
  if(s.revokedPolicies.includes(policyId)||policy.expiresAt<=deps.now()||plan.expiresAt<=deps.now())throw new Error('Policy revoked or expired before reservation.')
  if(Object.values(s.attempts).some(a=>a.state!=='complete'))throw new Error('An unresolved execution blocks additional copy trades.')
  const day=new Date(deps.now()).toISOString().slice(0,10)
  const reserved=BigInt(s.daily[day]??'0')+units(plan.maximumCostUsdc)
  if(reserved>units(policy.dailyCapUsdc)||(s.counts[policyId]??0)>=policy.maximumTrades)throw new Error('Copy budget or trade count exhausted.')
  acquired=true
  return {...s,daily:{...s.daily,[day]:String(reserved)},counts:{...s.counts,[policyId]:(s.counts[policyId]??0)+1},attempts:{...s.attempts,[attemptId]:{executionId,policyId,state:'reserved',plan}}}
 })
 if(!acquired)return follow('UNCERTAIN',{executionId:ledger.attempts[attemptId]?.executionId})
 // Reserving a durable identity is not permission to retry after a crash.
 // The adapter must recheck live readiness and bind the exact order before broadcast.
 try{await deps.execute(executionId,plan)}catch{}
 await deps.mutate(key,old=>{
  if(!old||old.attempts[attemptId]?.executionId!==executionId)throw new Error('Execution reservation missing.')
  if(old.attempts[attemptId].state==='complete')return old
  return {...old,attempts:{...old.attempts,[attemptId]:{...old.attempts[attemptId],state:'uncertain'}}}
 })
 return processManagedCopySignal(policy,signature,signalId,deps)
}
export const managedCopyRevocationMessage=(policy:ManagedCopyPolicy)=>'PolyDesk Managed Copy Revocation v1\nhttps://polydesk.trade\n'+hash(managedCopyPolicyMessage(policy))
export async function revokeManagedCopyPolicy(policy:ManagedCopyPolicy,signature:string,deps:Pick<ManagedCopyDeps,'mutate'>){
 const policyId=hash(managedCopyPolicyMessage(policy))
 if(verifyMessage(managedCopyRevocationMessage(policy),signature).toLowerCase()!==policy.owner)throw new Error('Owner-signed revocation required.')
 await deps.mutate(ledgerKey(policy),old=>{const s=old??empty();return {...s,revokedPolicies:[...new Set([...s.revokedPolicies,policyId])]}})
 return follow('POLICY_REVOKED')
}
