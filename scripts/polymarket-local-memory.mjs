// Local owner-scoped receipt projection. Never signs, submits or creates governed receipts.
import {createHash} from 'node:crypto'
import {readFileSync,lstatSync,openSync,closeSync,writeFileSync,fsyncSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {reconcileEvidence,defaultDependencies,recoveryOrderId} from './polymarket-execution-recovery.mjs'

const sha=x=>createHash('sha256').update(x).digest('hex')
const lower=x=>String(x??'').toLowerCase()
function requireThat(value,message){if(!value)throw Error(message)}
function read(path){const st=lstatSync(path);requireThat(st.isFile()&&!st.isSymbolicLink()&&st.size<=131072,'Unsafe local evidence file');return JSON.parse(readFileSync(path,'utf8'))}
function pathFor(directory,id){requireThat(/^[a-zA-Z0-9:_-]{8,100}$/.test(id),'Invalid execution identity');return join(directory,sha(id)+'.json')}
function immutable(path,body){const bytes=JSON.stringify(body);let fd;try{fd=openSync(path,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e;requireThat(JSON.stringify(read(path))===bytes,'Memory evidence conflict');return}try{writeFileSync(fd,bytes);fsyncSync(fd)}finally{closeSync(fd)}}

export async function verifiedLocalProjection(binding,deps){
 requireThat(/^0x[a-f0-9]{40}$/i.test(binding.owner)&&/^0x[a-f0-9]{64}$/i.test(binding.conditionId),'Invalid local owner or market')
 const finals=[]
 const result=await reconcileEvidence(binding,{...deps,readReceipt:async tx=>{
  const evidence=await deps.readReceipt(tx),r=evidence.receipt,b=evidence.canonicalBlock,f=evidence.finalizedHeader
  requireThat(evidence.chainId==='0x89'&&b&&f,'Exact Polygon finality evidence required')
  requireThat(/^0x[0-9a-f]{64}$/i.test(r.blockHash)&&/^0x[0-9a-f]{64}$/i.test(f.hash),'Invalid block hashes')
  requireThat(b.number===r.blockNumber&&lower(b.hash)===lower(r.blockHash)&&f.number===evidence.finalizedBlock,'Block identity mismatch')
  requireThat(BigInt(b.number)<=BigInt(f.number)&&(b.number!==f.number||lower(b.hash)===lower(f.hash)),'Finalized block mismatch')
  const index=Number(BigInt(r.transactionIndex))
  requireThat(Number.isSafeInteger(index)&&Array.isArray(b.transactions)&&lower(b.transactions[index])===tx&&b.transactions.filter(t=>lower(t)===tx).length===1,'Canonical transaction membership missing')
  for(const log of r.logs||[])if(lower(log.address)===lower(binding.exchange)){
   requireThat(log.removed===false&&lower(log.blockHash)===lower(r.blockHash)&&log.blockNumber===r.blockNumber&&log.transactionIndex===r.transactionIndex,'Incomplete fill log identity')
  }
  finals.push({transaction:tx,blockNumber:r.blockNumber,blockHash:lower(r.blockHash)})
  return evidence
 }})
 requireThat(result.state==='FILLED'&&result.transactions.length>0,'Only fully verified terminal fills enter local memory')
 return {schema:'polydesk-local-finalized-fill-v1',provenance:'LOCAL_BOUND_ORDER_AND_FINALIZED_CHAIN',
  owner:lower(binding.owner),executionId:binding.executionId,conditionId:lower(binding.conditionId),tokenId:String(binding.order.tokenId),
  side:binding.order.side===0?'BUY':'SELL',orderId:result.orderId,chainId:'eip155:137',
  matchedSharesRaw:result.matchedSharesRaw,collateralRaw:result.collateralRaw,feeRaw:result.feeRaw,
  fills:finals.sort((a,b)=>a.transaction.localeCompare(b.transaction)),bindingHash:sha(JSON.stringify(binding)),
  governedAuthorityVerified:false,signingAuthorized:false,paymentAuthorized:false,currentPositionVerified:false}
}

export async function captureLocalExecution(directory,id,bridge=runBridge,depsFactory=defaultDependencies){
 const file=pathFor(directory,id),record=read(file),binding=read(file+'.binding.json')
 requireThat(record.schema==='polydesk-local-execution-v1'&&record.id===id&&binding.executionId===id,'Local execution binding mismatch')
 requireThat(['SUBMITTED','FILLED'].includes(record.state)&&lower(record.orderId)===recoveryOrderId(binding),'Submission evidence required')
 // Default dependency construction independently binds current local credentials to owner/maker.
 const projection=await verifiedLocalProjection(binding,await depsFactory(binding))
 requireThat(JSON.stringify(read(file+'.binding.json'))===JSON.stringify(binding),'Binding changed during verification')
 const manifest={schema:'polydesk-local-memory-manifest-v1',owner:projection.owner,executionId:id,payloadHash:sha(JSON.stringify(projection)),projection}
 // Persist the exact expected inventory before SDK capture. Failure remains recoverable without a trade.
 immutable(file+'.memory.json',manifest)
 const response=await bridge('capture',projection)
 requireThat(response?.ok===true&&response.payloadHash===manifest.payloadHash,'Sibyl readback mismatch')
 return {ok:true,state:'LOCAL_FILL_MEMORY_VERIFIED',executionId:id,source:projection.provenance,governedAuthorityVerified:false,signingAuthorized:false,orderSubmitted:false,
  followUpPrompts:['Show receipt','Review remembered fills','Check current position']}
}

export async function reviewLocalMemory(directory,owner,tokenId,bridge=runBridge){
 owner=lower(owner);requireThat(/^0x[a-f0-9]{40}$/.test(owner)&&/^[1-9][0-9]{0,77}$/.test(tokenId),'Exact local owner and token required')
 let inventory
 try{inventory=readdirSync(directory)}catch(error){
  if(error.code!=='ENOENT')throw error
  const empty=await bridge('recall',{owner,records:[]})
  requireThat(empty?.ok===true&&Array.isArray(empty.records)&&empty.records.length===0,'Local memory runtime unavailable')
  return {ok:true,state:'LOCAL_HISTORY_NOT_INITIALIZED',source:'LOCAL_EXECUTION_LEDGER',historyComplete:false,matchingExecutionIds:[],nextAction:'REVIEW_EXISTING_ACCOUNT_HISTORY_AND_FRESH_PREVIEW',signingAuthorized:false,paymentAuthorized:false,currentPositionVerified:false,orderSubmitted:false}
 }
 const files=inventory.filter(f=>/^[a-f0-9]{64}\.json\.memory\.json$/.test(f))
 requireThat(files.length<=100,'Memory inventory exceeds bounded review')
 for(const f of readdirSync(directory).filter(f=>/^[a-f0-9]{64}\.json$/.test(f))){
  const record=read(join(directory,f));if(record.schema!=='polydesk-local-execution-v1')continue
  const b=read(join(directory,f+'.binding.json'))
  if(lower(b.owner)===owner&&['SUBMITTED','FILLED'].includes(record.state))requireThat(files.includes(f+'.memory.json'),'Known execution has no memory inventory; capture its existing receipt first')
 }
 const manifests=files.map(f=>read(join(directory,f))).filter(v=>v.owner===owner)
 for(const m of manifests){requireThat(m.schema==='polydesk-local-memory-manifest-v1'&&sha(JSON.stringify(m.projection))===m.payloadHash,'Corrupt memory inventory');const b=read(pathFor(directory,m.executionId)+'.binding.json');requireThat(sha(JSON.stringify(b))===m.projection.bindingHash&&lower(b.owner)===owner,'Memory owner binding changed')}
 const response=await bridge('recall',{owner,records:manifests.map(m=>({executionId:m.executionId,payloadHash:m.payloadHash}))})
 requireThat(response?.ok===true&&response.records?.length===manifests.length,'Sibyl inventory unavailable')
 response.records.forEach((r,i)=>requireThat(JSON.stringify(r)===JSON.stringify(manifests[i].projection),'Sibyl content mismatch'))
 const matches=response.records.filter(r=>r.tokenId===tokenId)
 const bought=matches.filter(r=>r.side==='BUY').reduce((n,r)=>n+BigInt(r.matchedSharesRaw),0n)
 const sold=matches.filter(r=>r.side==='SELL').reduce((n,r)=>n+BigInt(r.matchedSharesRaw),0n)
 return {ok:true,state:matches.length?'LOCAL_MEMORY_RECONCILIATION_REQUIRED':'LOCAL_HISTORY_REVIEWED_NOT_AUTHORIZED',
  source:'SIBYL_LOCAL_FINALIZED_FILLS',historyComplete:false,matchingExecutionIds:matches.map(r=>r.executionId),
  rememberedBoughtRaw:bought.toString(),rememberedSoldRaw:sold.toString(),rememberedNetRaw:(bought-sold).toString(),
  nextAction:matches.length?'REVIEW_PRIOR_BUYS_AND_SELLS_AND_REFRESH_POSITION':'REQUIRE_FRESH_RESEARCH_AND_ACCOUNT_CHECKS',
  governedAuthorityVerified:false,signingAuthorized:false,paymentAuthorized:false,currentPositionVerified:false,orderSubmitted:false}
}

export async function runBridge(action,payload){
 const bridge=fileURLToPath(new URL('./sibyl-local-execution-memory.py',import.meta.url))
 const python=process.env.POLYDESK_LOCAL_MEMORY_PYTHON,root=process.env.POLYDESK_LOCAL_MEMORY_ROOT
 requireThat(python?.startsWith('/')&&root?.startsWith('/')&&!root.includes('..')&&!/\/(\.codex|\.agents)(\/|$)/.test(root),'Configure private native local-memory runtime/root')
 let executable=python,args=['-I','-B',bridge,'--root',root,'--action',action]
 if(process.platform==='win32'){
  const converted=spawnSync('wsl.exe',['--exec','wslpath','-u',bridge],{encoding:'utf8',windowsHide:true,timeout:15000})
  requireThat(converted.status===0,'Cannot resolve local memory bridge')
  executable='wsl.exe';args=['--exec',python,'-I','-B',converted.stdout.trim(),'--root',root,'--action',action]
 }
 const run=spawnSync(executable,args,{input:JSON.stringify(payload),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:262144})
 requireThat(run.status===0,'Sibyl local memory unavailable; receipt retained, no trade retry')
 return JSON.parse(run.stdout)
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [action,directory,identity,token]=process.argv.slice(2)
 try{
  if(action==='review'){
   const owner=lower(identity),store=read(join(process.env.USERPROFILE||process.env.HOME||'','.config','polymarket','creds.json'))
   const entry=store._version===2?store[owner]:lower(store.signing_address)===owner?store:null
   requireThat(entry?.mode==='deposit_wallet','Local owner credentials unavailable; remote recall is not supported here')
  }
  const result=action==='capture'?await captureLocalExecution(directory,identity):action==='review'?await reviewLocalMemory(directory,identity,token):null
  requireThat(result,'Use capture or review');console.log(JSON.stringify(result))
 }catch{console.log(JSON.stringify({ok:false,state:'LOCAL_MEMORY_REVIEW_REQUIRED',signingAuthorized:false,orderSubmitted:false,retryTrade:false,
  nextAction:'Inspect the existing receipt, binding and memory configuration; never repeat the trade to repair memory.'}));process.exitCode=1}
}
