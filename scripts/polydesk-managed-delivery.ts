import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { listExactManagedSubscriptions } from '../api/okx-managed-subscription-directory.js'
import { MANAGED_AGENT_SCHEMA, validateManagedSubscriptionIdentity, type ManagedSubscriptionIdentity } from '../api/polydesk-managed-agent-subscription.js'
import type { DeliveryItem } from '../api/polydesk-managed-delivery.js'
import { submitManagedRequest } from './polydesk-managed-agent-operator.js'
const exec = promisify(execFile)
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export function deliverySucceeded(value: any) {
  const d = value?.data ?? value
  return value?.ok !== false && (d?.delivered === true || d?.reason === 'alreadyDelivered')
}
function durable(path: string, value: unknown, exclusive = false) {
  const temp = exclusive ? path : path + '.tmp'
  const fd = openSync(temp, exclusive ? 'wx' : 'w', 0o600)
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd) } finally { closeSync(fd) }
  if (!exclusive) renameSync(temp,path)
}
type Deps = {
  list: () => Promise<ManagedSubscriptionIdentity[]>;
  items: (s: ManagedSubscriptionIdentity) => Promise<DeliveryItem[]>;
  send: (s: ManagedSubscriptionIdentity, item: DeliveryItem) => Promise<unknown>;
}
export async function runDeliveryCycle(deps: Deps, root: string, deliver = false) {
  const subscriptions = (await deps.list()).map(validateManagedSubscriptionIdentity)
  const output: Record<string, unknown>[] = []
  for (const s of subscriptions) {
    if (s.status !== 'active' || Date.parse(s.periodEndAt) <= Date.now()) continue
    const dir = join(root, hash(s.jobId)); mkdirSync(dir, {recursive:true,mode:0o700})
    const lock = join(dir,'cycle.lock'); let fd: number
    try { fd = openSync(lock,'wx',0o600) } catch { output.push({jobId:s.jobId,state:'LOCKED_REVIEW_REQUIRED'});continue }
    try {
      const pending = join(dir,'pending.json')
      if (existsSync(pending)) { output.push({jobId:s.jobId,state:'DELIVERY_RECONCILIATION_REQUIRED'}); continue }
      const items = await deps.items(s)
      if (!Array.isArray(items)) throw new Error('Invalid delivery items.')
      for (const item of items) {
        if (!item || !['setup','alert'].includes(item.kind) || typeof item.id !== 'string' || typeof item.text !== 'string' || item.text.length > 12000) throw new Error('Invalid delivery item.')
        const payload = JSON.parse(item.text)
        if (payload.jobId !== s.jobId || payload.tradeAuthorized !== false || payload.orderSubmitted !== false) throw new Error('Delivery authority binding mismatch.')
        const record = join(dir,hash(item.id)+'.json'), payloadHash = hash(item.text)
        if (existsSync(record)) {
          const saved = JSON.parse(readFileSync(record,'utf8'))
          if (saved.payloadHash !== payloadHash || saved.buyerAgentId !== s.buyerAgentId) throw new Error('Saved delivery binding mismatch.')
          output.push({jobId:s.jobId,id:item.id,state:'ALREADY_SENT'});continue
        }
        if (!deliver) { output.push({jobId:s.jobId,id:item.id,state:'PREVIEW',kind:item.kind,text:item.text});continue }
        // Re-query the authoritative directory immediately before each outbound call.
        const current = (await deps.list()).find(x=>x.jobId===s.jobId && x.buyerAgentId===s.buyerAgentId && x.serviceId===s.serviceId && x.providerAgentId===s.providerAgentId && x.status==='active' && Date.parse(x.periodEndAt)>Date.now())
        if (!current) { output.push({jobId:s.jobId,state:'NO_LONGER_ACTIVE'});break }
        const fresh = await deps.items(current)
        if (!Array.isArray(fresh) || !fresh.some(x=>x.id===item.id && x.text===item.text)) { output.push({jobId:s.jobId,state:'MONITORING_CHANGED'});break }
        const claim = {jobId:s.jobId,buyerAgentId:s.buyerAgentId,itemId:item.id,payloadHash,text:item.text,claimedAt:new Date().toISOString(),state:'pending'}
        durable(pending,claim,true)
        let result: unknown
        try { result = await deps.send(s,item) } catch { output.push({jobId:s.jobId,id:item.id,state:'DELIVERY_RECONCILIATION_REQUIRED'});break }
        if (!deliverySucceeded(result)) { durable(pending,{...claim,result}); output.push({jobId:s.jobId,id:item.id,state:'DELIVERY_RECONCILIATION_REQUIRED'});break }
        durable(record,{...claim,state:'sent',result,completedAt:new Date().toISOString()})
        unlinkSync(pending)
        output.push({jobId:s.jobId,id:item.id,state:'SENT',result})
      }
    } catch (error) { output.push({jobId:s.jobId,state:'BLOCKED',error:error instanceof Error?error.message:'Delivery failed'}) }
    finally { closeSync(fd);unlinkSync(lock) }
  }
  return output
}
async function command(args: string[]) {
  const {stdout} = await exec(process.env.ONCHAINOS_BIN || 'onchainos',args,{timeout:90000,maxBuffer:1024*1024,windowsHide:true})
  try { return JSON.parse(stdout) } catch {
    for (const line of stdout.trim().split('\n').reverse()) { try { return JSON.parse(line) } catch {} }
    throw new Error('Unrecognized CLI output; verify before retrying.')
  }
}
async function main() {
  const args = process.argv.slice(2)
  if(args.some(x=>!['--once','--deliver'].includes(x)))throw new Error('Supported flags: --once --deliver')
  const gate = await command(['agent','gate-check','--role','asp'])
  if(gate?.data?.ready!==true)throw new Error('Official ASP readiness check failed.')
  const results=await runDeliveryCycle({list:listExactManagedSubscriptions,items:async subscription=>{
    const result:any=await submitManagedRequest({schema:MANAGED_AGENT_SCHEMA,action:'delivery_items',subscription})
    if(result?.ok!==true || !Array.isArray(result.items))throw new Error('Authenticated delivery feed unavailable.')
    return result.items
  },send:(s,item)=>command(['agent','deliver',s.jobId,'--agent-id',s.providerAgentId,'--deliverable-text',item.text,'--message',item.kind==='setup'?'Monitoring setup requires your input.':'New portfolio monitoring result. Review findings before any trade.'])},
    resolve(process.env.POLYDESK_MANAGED_DELIVERY_DIR || '/var/lib/polydesk-a2a/managed-delivery'),args.includes('--deliver'))
  console.log(JSON.stringify({ok:!results.some(r=>['BLOCKED','DELIVERY_RECONCILIATION_REQUIRED','LOCKED_REVIEW_REQUIRED'].includes(String(r.state))),results}))
}
if(process.argv[1] && import.meta.url === new URL(process.argv[1],'file:').href)main().catch(e=>{console.error(e.message);process.exitCode=1})
