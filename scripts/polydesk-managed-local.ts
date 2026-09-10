import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve,dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listExactManagedSubscriptions } from '../api/okx-managed-subscription-directory.js'
import { checkManagedLocalReceipt } from './polydesk-managed-local-receipt.mjs'
import { managedLocalOrderMessage, runManagedLocalOrder } from '../api/polydesk-managed-local-order.js'
const run=promisify(execFile),root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
async function main(){
 const args=process.argv.slice(2)
 if(args.some(a=>a.startsWith('--')&&!['--request','--execute','--receipt'].includes(a))||args.filter(a=>a==='--request').length!==1)throw new Error('Use --request FILE and optionally --execute.')
 if(args.length!==2 && args.length!==3)throw new Error('Use exactly one request and at most one mode.')
 const requestPath=args[args.indexOf('--request')+1]
 if(!requestPath||requestPath.startsWith('--'))throw new Error('A request file is required.')
 const raw=JSON.parse(await readFile(resolve(requestPath),'utf8'))
 if(!raw||Object.keys(raw).some(k=>!['order','signature'].includes(k)))throw new Error('Only order and its owner signature are accepted.')
 if(args.includes('--receipt')){
  if(args.includes('--execute'))throw new Error('Receipt checks cannot submit orders.')
  const message=managedLocalOrderMessage(raw.order)
  console.log(JSON.stringify(await checkManagedLocalReceipt(resolve(process.env.USERPROFILE??'', '.config/polymarket/polydesk-executions'),raw.order,raw.signature,message)))
  return
 }
 const result=await runManagedLocalOrder(raw.order,raw.signature,args.includes('--execute'),{
  now:Date.now,
  active:async(job,buyer)=>(await listExactManagedSubscriptions()).some(s=>s.jobId===job&&s.buyerAgentId===buyer&&s.status==='active'&&Date.parse(s.periodEndAt)>Date.now()),
  owner:async()=>{
   const profile=process.env.USERPROFILE??''
   if(process.platform!=='win32'||!/^[A-Za-z]:[\\/]/.test(profile))throw new Error('This transport requires the reviewed Windows/WSL buyer runtime.')
   const home=profile.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/mnt/'+drive.toLowerCase())+'/.onchainos'
   const {stdout}=await run('wsl.exe',['--exec','env','ONCHAINOS_HOME='+home,'/root/.local/bin/onchainos','wallet','addresses','--chain','137'],{timeout:20000,maxBuffer:100000,windowsHide:true})
   const envelope=JSON.parse(stdout),addresses=envelope.data?.evm?.filter((a:any)=>a.chainIndex==='137')
   if(envelope.ok!==true||addresses?.length!==1)throw new Error('Exact active Polygon owner unavailable.')
   return addresses[0].address
  },
  preflight:async o=>{
   const response=await fetch('https://polydesk.trade/api/polymarket-account/trade-preflight',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({ownerAddress:o.owner,marketSlug:o.marketSlug,outcome:o.outcome,maxTotalUsdc:o.maxTotalUsdc,limitPrice:o.maximumPrice,orderType:'FOK',postOnly:false})})
   if(!response.ok)throw new Error('Current readiness failed; no order attempted.')
   return response.json()
  },
  submit:async(o,args,constraints)=>{
   try{
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve(root,'scripts/polymarket-wsl.ps1'),...args],{cwd:root,windowsHide:true,maxBuffer:1000000,env:{...process.env,POLYDESK_EXECUTION_ID:o.executionId,POLYDESK_MANAGED_CONSTRAINTS:Buffer.from(JSON.stringify(constraints)).toString('base64')}})
    // No raw plugin output or credentials are forwarded to the service or persisted here.
    const response=stdout.trim().split(/\r?\n/).reverse().map(line=>{try{return JSON.parse(line)}catch{return null}}).find(value=>value?.ok===true&&value?.data?.order_id)
    if(!/^0x[a-fA-F0-9]{64}$/.test(response?.data?.order_id??''))throw new Error('Submission outcome requires reconciliation.')
    return{state:'GUARDED_SUBMISSION_RETURNED',orderId:response.data.order_id,receiptVerified:false}
   }catch{throw new Error('Local execution did not finish conclusively. Inspect the existing execution guard; never resubmit automatically.')}
  }
 })
 console.log(JSON.stringify(result))
}
main().catch(()=>{console.error(JSON.stringify({ok:false,state:'LOCAL_REVIEW_REQUIRED',automaticRetryAllowed:false,followUpPrompts:['Review the local authorization, readiness, or existing execution guard.','Do not repeat an uncertain submission.']}));process.exitCode=1})