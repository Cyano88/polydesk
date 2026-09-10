import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

function durableCreate(path,value) {
 const fd=openSync(path,'wx',0o600)
 try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd)}finally{closeSync(fd)}
}
export function claimExecution(directory,id,args) {
 if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(id))throw new Error('Set a stable POLYDESK_EXECUTION_ID for this buyer-authorized order; reuse it after interruptions.')
 mkdirSync(directory,{recursive:true})
 const key=createHash('sha256').update(id).digest('hex')
 const record=join(directory,`${key}.json`), lock=join(directory,'pending.json')
 if(existsSync(record))throw new Error('Execution ID already recorded. Check its receipt/status; never submit it again.')
 const state={schema:'polydesk-local-execution-v1',id,intentHash:createHash('sha256').update(JSON.stringify(args)).digest('hex'),state:'PENDING',createdAt:new Date().toISOString()}
 try{durableCreate(lock,state)}catch(error){if(error.code==='EEXIST')throw new Error('An execution is pending or uncertain. Reconcile it before any new submission; do not delete the guard or generate a new ID.');throw error}
 // Any failure after acquiring the lock intentionally leaves it in place.
 durableCreate(record,state)
 return {directory,record,lock,state}
}
export function recordSubmission(claim,orderId) {
 if(!/^0x[a-fA-F0-9]{64}$/.test(orderId))throw new Error('No verified-format order ID returned; execution remains uncertain.')
 const state={...claim.state,state:'SUBMITTED',orderId,submittedAt:new Date().toISOString()}
 const pending=`${claim.record}.next`
 durableCreate(pending,state)
 renameSync(pending,claim.record)
 // Receipt settlement is separate. The permanent record prevents reusing this ID.
 unlinkSync(claim.lock)
 return state
}
export function executionStatus(directory) {
 const lock=join(directory,'pending.json')
 return existsSync(lock)?JSON.parse(readFileSync(lock,'utf8')):{state:'NO_UNCERTAIN_EXECUTION'}
}
export function runGuard(directory,id,command,args,run=spawnSync) {
 const claim=claimExecution(directory,id,[command,...args])
 const result=run(command,args,{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true})
 if(result.stdout)process.stdout.write(result.stdout)
 if(result.stderr)process.stderr.write(result.stderr)
 if(result.error||result.signal||result.status!==0)throw new Error('Execution did not finish cleanly. Submission guard retained; reconcile before retrying.')
 const lines=String(result.stdout??'').trim().split(/\r?\n/)
 let response
 for(let i=lines.length-1;i>=0;i--){try{response=JSON.parse(lines[i]);break}catch{}}
 if(response?.ok!==true||!response?.data?.order_id)throw new Error('Order response is uncertain. Submission guard retained; reconcile before retrying.')
 return recordSubmission(claim,response.data.order_id)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [directory,id,command,...args]=process.argv.slice(2)
  if(!directory)throw new Error('Execution ledger directory is required.')
  if(id==='status')console.log(JSON.stringify(executionStatus(directory)))
  else{if(!command)throw new Error('Execution command is required.');runGuard(directory,id,command,args)}
 }catch(error){console.error(error.message);process.exitCode=1}
}