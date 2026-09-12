import { createHash } from 'node:crypto'
import { Router } from 'express'
import { ReceiptCorrections, CorrectionError, correctionOperator } from './receipt-correction.js'
import { readDurableJson, mutateDurableJson } from './render-durable-store.js'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type ResearchAcceptance = {
  schema: 'polydesk-research-acceptance-v1'; transaction: string; originalAnalysisHash: string;
  originalResultHash: string; revisionHash: string | null; acceptedAt: string;
  acknowledgeLimitations: true; actor: string; previousAcceptances?: ResearchAcceptance[];
}
type Store = {
  read(key: string): Promise<ResearchAcceptance | undefined>;
  mutate(key: string, fn: (value: ResearchAcceptance | undefined) => ResearchAcceptance): Promise<ResearchAcceptance>;
}
export const acceptanceInputSchema = {
  type: 'object', additionalProperties: false,
  required: ['action', 'originalAnalysisHash', 'revisionHash', 'acknowledgeLimitations'],
  properties: { action: {const: 'ACCEPT_RESEARCH'}, originalAnalysisHash: {type:'string',pattern:'^[a-f0-9]{64}$'},
    revisionHash: {type:['string','null'],pattern:'^[a-f0-9]{64}$'}, acknowledgeLimitations: {const:true} },
}
function input(raw: unknown) {
  const b = raw as {action?: string; originalAnalysisHash: string; revisionHash: string | null; acknowledgeLimitations?: boolean}
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['action','originalAnalysisHash','revisionHash','acknowledgeLimitations'].includes(k))
    || b.action !== 'ACCEPT_RESEARCH' || b.acknowledgeLimitations !== true || !/^[a-f0-9]{64}$/.test(b.originalAnalysisHash)
    || !(b.revisionHash === null || (typeof b.revisionHash === 'string' && /^[a-f0-9]{64}$/.test(b.revisionHash))))
    throw new CorrectionError(400, 'EXPLICIT_RESEARCH_ACCEPTANCE_REQUIRED')
  return b
}
export class ReceiptAcceptance {
  constructor(private store: Store = {read: readDurableJson, mutate: mutateDurableJson}, private corrections = new ReceiptCorrections()) {}
  private key(tx: string, actor: string) { return 'polydesk:research-acceptance:' + tx.toLowerCase() + ':' + digest(actor) }
  private async target(tx: string) {
    const paid = await this.corrections.original(tx)
    let correction
    try { correction = await this.corrections.get(tx) }
    catch(e) { if (!(e instanceof CorrectionError) || e.code !== 'CORRECTION_NOT_FOUND') throw e }
    const resultHash = digest(paid.response)
    if (correction && (correction.originalAnalysisHash !== paid.analysisHash || correction.originalResultHash !== resultHash))
      throw new CorrectionError(409, 'ORIGINAL_CHANGED')
    return {paid, correction, resultHash}
  }
  async get(tx: string, actor = 'operator') {
    const {paid, correction, resultHash} = await this.target(tx)
    const acceptance = await this.store.read(this.key(tx, actor))
    const researchAvailable=(paid.response as {decision?:{evidence?:{researchStatus?:string}}}).decision?.evidence?.researchStatus==='AVAILABLE'
    const blockedReason=correction?.status==='REQUESTED'?'CORRECTION_PENDING':!researchAvailable?'AVAILABLE_RESEARCH_REQUIRED':null
    const current = Boolean(!blockedReason && acceptance && acceptance.originalAnalysisHash === paid.analysisHash && acceptance.originalResultHash === resultHash
      && acceptance.revisionHash === (correction?.revisionHash ?? null) && correction?.status !== 'REQUESTED')
    return {status: current ? 'ACCEPTED' : acceptance ? 'REVIEW_REQUIRED' : 'NOT_ACCEPTED', acceptance: acceptance ?? null, blockedReason, acceptanceAllowed:!blockedReason, correctionStatus:correction?.status??null, correctionRound:correction?.round??(correction?1:null)}
  }
  async accept(tx: string, raw: unknown, actor = 'operator') {
    const b = input(raw), {paid, correction, resultHash} = await this.target(tx)
    const research = (paid.response as {decision?: {evidence?: {researchStatus?: string}}}).decision?.evidence?.researchStatus
    if (research !== 'AVAILABLE') throw new CorrectionError(409, 'AVAILABLE_RESEARCH_REQUIRED')
    if (correction?.status === 'REQUESTED') throw new CorrectionError(409, 'CORRECTION_PENDING')
    if (b.originalAnalysisHash !== paid.analysisHash || b.revisionHash !== (correction?.revisionHash ?? null)) throw new CorrectionError(409, 'REVIEW_TARGET_CHANGED')
    await this.store.mutate(this.key(tx, actor), existing => {
      if (existing) {
        if (existing.originalAnalysisHash === b.originalAnalysisHash && existing.originalResultHash === resultHash && existing.revisionHash === b.revisionHash) return existing
      }
      return {schema:'polydesk-research-acceptance-v1', transaction:tx.toLowerCase(), originalAnalysisHash:b.originalAnalysisHash,
        originalResultHash:resultHash, revisionHash:b.revisionHash, acceptedAt:new Date().toISOString(), acknowledgeLimitations:true, actor, ...(existing ? {previousAcceptances:[...(existing.previousAcceptances ?? []), {...existing,previousAcceptances:undefined}]} : {})}
    })
    // Re-read current targets so a concurrent correction cannot silently remain accepted.
    return this.get(tx, actor)
  }
}
export function acceptanceView(result: Awaited<ReturnType<ReceiptAcceptance['get']>>) {
  const {actor: _actor, previousAcceptances: _history, ...acceptance} = result.acceptance ?? {actor:undefined,previousAcceptances:undefined}
  return {ok:true, status:result.status, acceptanceAllowed:result.acceptanceAllowed, blockedReason:result.blockedReason, correctionStatus:result.correctionStatus, correctionRound:result.correctionRound, acceptance:result.acceptance ? acceptance : null, additionalPaymentRequired:false,
    tradeAuthorized:false, orderSubmitted:false, paymentStatus:'settled',
    reviewMeaning:'Acknowledges this research and its disclosed limitations. Does not release escrow, approve an order or change the original report.',
    followUpPrompts:result.blockedReason==='CORRECTION_PENDING' ? ['Show original findings and correction history','Check correction status'] : result.blockedReason ? ['Show delivery issue','Request research recovery under the existing payment','Describe a specific defect'] : result.status === 'ACCEPTED' ? ['Show accepted research and correction', 'Check whether a fresh trade preview is available', 'Decline this trade', 'Analyze another market (review any new fee first)']
      : ['Show results', 'Show correction and remaining gaps', 'Accept this research with its disclosed limitations', 'Describe a specific defect'],
  }
}
export function createReceiptAcceptanceRouter(service = new ReceiptAcceptance(), authorize = correctionOperator) {
  const router = Router({mergeParams:true})
  router.all('/', async(req,res) => {
    res.setHeader('Cache-Control','no-store')
    try {
      const tx = (req.params as Record<string,string>).transaction
      if (Object.keys(req.query).length) throw new CorrectionError(400,'INVALID_INPUT')
      if (req.method === 'GET') return res.json(acceptanceView(await service.get(tx)))
      if (req.method !== 'POST') {res.setHeader('Allow','GET, POST'); throw new CorrectionError(405,'METHOD_NOT_ALLOWED')}
      authorize(req.headers.authorization)
      return res.json(acceptanceView(await service.accept(tx, req.body)))
    } catch(e) {
      const error = e instanceof CorrectionError ? e : new CorrectionError(503,'ACCEPTANCE_UNAVAILABLE')
      return res.status(error.status).json({ok:false,error:error.code,retryPayment:false,tradeAuthorized:false})
    }
  })
  return router
}
