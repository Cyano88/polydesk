import { createHash } from 'node:crypto'
import { verifyMessage } from 'ethers'
import type { Request, Response } from 'express'
import { readDurableJson } from './render-durable-store.js'
import { polymarketGovernedTradeCompleteHandler } from './a2mcp-polymarket-governed-open.js'

type Obj = Record<string, any>
type Identity = { jobId: string; buyerAgentId: string }
export type ManagedTradeDeps = { now: () => number; read: (key: string) => Promise<Obj | undefined | null>; complete: (body: Obj) => Promise<Obj> }
const object = (v: any): v is Obj => Boolean(v && typeof v === 'object' && !Array.isArray(v))
function validate(input: Obj) {
  if (!object(input) || Object.keys(input).some(k => !['executionId','owner','expiresAt','signature','completion'].includes(k))) throw new Error('Invalid managed trade request.')
  if (!/^pex_[a-f0-9]{24}$/.test(input.executionId) || !/^0x[a-f0-9]{40}$/.test(input.owner) || !Number.isSafeInteger(input.expiresAt)) throw new Error('Exact execution and owner are required.')
  if (input.completion !== undefined && (!object(input.completion) || Object.keys(input.completion).some(k => !['orderId','transactionHash','authoritySignature'].includes(k)) || !/^0x[a-fA-F0-9]{64}$/.test(input.completion.orderId) || !/^0x[a-fA-F0-9]{64}$/.test(input.completion.transactionHash))) throw new Error('Exact completion evidence is required.')
}
export function managedTradeAccessMessage(identity: Identity, input: Obj) {
  validate(input)
  const completion = input.completion ? [input.completion.orderId,input.completion.transactionHash,input.completion.authoritySignature ?? null] : null
  return ['PolyDesk Managed Trade Receipt Access v1','https://polydesk.trade','Chain: 137','No order submission, spending, or wallet permission',
    'jobId: '+identity.jobId,'buyerAgentId: '+identity.buyerAgentId,'executionId: '+input.executionId,'owner: '+input.owner,'expiresAt: '+input.expiresAt,
    'completionHash: '+createHash('sha256').update(JSON.stringify(completion)).digest('hex')].join('\n')
}
async function complete(body: Obj) {
  let status = 200, output: Obj = {}
  const response = { setHeader: () => undefined, status(code: number) { status=code; return this }, json(value: Obj) { output=value; return this } }
  await polymarketGovernedTradeCompleteHandler({method:'POST',body} as Request,response as unknown as Response)
  return {...output,httpStatus:status}
}
const live: ManagedTradeDeps = {now:Date.now,read:readDurableJson,complete}
/** Reuses actual governed receipt verification and its atomic receipt/outbox commit. Never submits orders. */
export async function continueManagedTrade(identity: Identity, input: Obj, deps: ManagedTradeDeps = live) {
  const message=managedTradeAccessMessage(identity,input)
  if (input.expiresAt <= deps.now() || input.expiresAt > deps.now()+300_000 || typeof input.signature !== 'string' || verifyMessage(message,input.signature).toLowerCase() !== input.owner) throw new Error('Current owner-signed managed receipt access is required.')
  const key='polymarket-governed-execution:'+input.executionId
  let record=await deps.read(key)
  if (!record || record.executionId!==input.executionId || record.authoritySigner?.toLowerCase()!==input.owner) throw new Error('Execution is unavailable for this owner.')
  const base={executionId:input.executionId,tradeAuthorized:false,orderSubmitted:false,automaticRetryAllowed:false}
  if (input.completion) {
    const verified=await deps.complete({executionId:input.executionId,...input.completion})
    if (!verified.ok) return {...base,ok:false,state:'RECEIPT_PENDING',verification:verified,followUpPrompts:['Review the receipt verification result.','Check this exact execution again; do not resubmit the order.']}
    record=await deps.read(key)
    if (!record || record.executionId!==input.executionId || record.authoritySigner?.toLowerCase()!==input.owner) throw new Error('Execution binding changed after completion.')
  }
  const receipt=record.receipt
  if (receipt) {
    if (receipt.executionId!==input.executionId || receipt.status!=='VERIFIED_FILLED' || !receipt.finality || receipt.proofs?.polygonFinalityVerified!==true || receipt.proofs?.exactSignedOrderVerified!==true || receipt.proofs?.buyerAuthoritySignatureVerified!==true) return {...base,ok:false,state:'RECEIPT_REVERIFICATION_REQUIRED',followUpPrompts:['Reverify the exact settlement before treating the trade as complete.']}
    return {...base,ok:true,state:'TRADE_COMPLETE',receipt,memory:{state:'NOT_CHECKED',instruction:'Use owner-authorized receipt memory status to verify Sibyl delivery; a verified receipt alone does not prove synchronization.'},followUpPrompts:['Show the verified receipt?','Check this position?','Analyze another market or keep funds?']}
  }
  return {...base,ok:true,state:record.decision==='APPROVE'?'SETTLEMENT_UNCONFIRMED':'TRADE_BLOCKED',decision:record.decision,
    completion:{endpoint:'/api/polymarket-agent-flow/complete',required:['executionId','orderId','transactionHash'],instruction:'Use the existing owner-signed completion flow for this exact order. Approval is not proof of submission.'},
    followUpPrompts:['Check the existing execution and settlement receipt.','Do not submit another order while the outcome is unresolved.']}
}