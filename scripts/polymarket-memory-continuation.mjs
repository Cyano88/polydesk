// Read-only continuation gate: never signs, submits, approves, or repairs memory.
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {Interface,parseUnits} from 'ethers'
import {reviewLocalMemory} from './polymarket-local-memory.mjs'
const run=promisify(execFile)
const fail=(ok,message)=>{if(!ok)throw Error(message)}
export function parseIntent(args){
 const side=args[0];fail(['buy','sell'].includes(side),'Exact BUY or SELL required')
 const allowed=['--market-id','--outcome',side==='buy'?'--amount':'--shares','--price','--order-type']
 const values={}
 for(let i=1;i<args.length;i+=2){fail(allowed.includes(args[i])&&!Object.hasOwn(values,args[i])&&typeof args[i+1]==='string','Unsupported, duplicate or missing trade argument');values[args[i]]=args[i+1]}
 fail(allowed.every(k=>values[k])&&values['--order-type']==='FOK','Exact FOK intent required')
 fail(/^[a-z0-9-]{1,200}$/.test(values['--market-id']),'Invalid market slug')
 for(const k of ['--price',side==='buy'?'--amount':'--shares'])fail(/^\d+(?:\.\d{1,6})?$/.test(values[k])&&Number(values[k])>0,'Invalid order amount')
 fail(Number(values['--price'])<1,'Invalid limit')
 return {side:side.toUpperCase(),marketSlug:values['--market-id'],outcome:values['--outcome'],quantity:values[side==='buy'?'--amount':'--shares'],price:values['--price'],orderType:'FOK'}
}
export async function evaluateContinuation(intent,identity,deps,ack=''){
 const memory=await deps.review(identity.owner,identity.tokenId)
 fail(memory?.ok===true&&['SIBYL_LOCAL_FINALIZED_FILLS','LOCAL_EXECUTION_LEDGER'].includes(memory.source),'Verified Sibyl review required')
 const first=memory.state==='LOCAL_HISTORY_NOT_INITIALIZED'
 fail(first||typeof memory.rememberedNetRaw==='string','Memory reconciliation summary missing')
 const net=BigInt(first?'0':memory.rememberedNetRaw)
 const position=await deps.position(identity.wallet,identity.tokenId)
 fail(typeof position==='bigint'&&position>=0n,'Fresh chain position required')
 const digest=createHash('sha256').update(JSON.stringify({intent,identity,ids:memory.matchingExecutionIds,net:net.toString(),position:position.toString()})).digest('hex')
 const base={ok:true,memoryGatePassed:false,source:'SIBYL_AND_LIVE_POLYGON_POSITION',intent,owner:identity.owner,tokenId:identity.tokenId,matchingExecutionIds:memory.matchingExecutionIds,rememberedNetRaw:net.toString(),positionRaw:position.toString(),reviewDigest:digest,historyComplete:false,signingAuthorized:false,paymentAuthorized:false,orderSubmitted:false}
 if(net!==position)return {...base,state:'MEMORY_POSITION_MISMATCH',nextAction:'RECONCILE_MISSING_FILLS_OR_EXTERNAL_POSITION_BEFORE_TRADING'}
 if(intent.side==='SELL'&&parseUnits(intent.quantity,6)>position)return {...base,state:'INSUFFICIENT_RECONCILED_POSITION',nextAction:'REFRESH_SELL_PREVIEW'}
 if(intent.side==='BUY'&&position>0n&&ack!==digest)return {...base,state:'EXISTING_EXPOSURE_REVIEW_REQUIRED',nextAction:'REVIEW_EXISTING_EXPOSURE_AND_APPROVE_EXACT_ADDITIONAL_BUY'}
 return {...base,memoryGatePassed:true,state:position===0n?'MEMORY_RECONCILED_CLOSED':'MEMORY_RECONCILED_OPEN',nextAction:'REQUIRE_FRESH_MARKET_CHECKS_AND_BUYER_APPROVAL'}
}
async function main(){
 try{
  const [directory,ack,...args]=process.argv.slice(2),intent=parseIntent(args)
  const profile=process.env.USERPROFILE;fail(/^[A-Za-z]:[\\/]/.test(profile||''),'Existing local Windows wallet required')
  const walletHome=profile.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,d)=>'/mnt/'+d.toLowerCase())+'/.onchainos'
  const {stdout}=await run('wsl.exe',['--exec','env','ONCHAINOS_HOME='+walletHome,'/root/.local/bin/onchainos','wallet','addresses','--chain','137'],{timeout:20000,windowsHide:true})
  const result=JSON.parse(stdout),addresses=result.data?.evm?.filter(a=>a.chainIndex==='137')
  fail(result.ok===true&&addresses?.length===1,'Active owner unavailable')
  const owner=addresses[0].address.toLowerCase(),store=JSON.parse(readFileSync(join(profile,'.config','polymarket','creds.json'),'utf8')),entry=store._version===2?store[owner]:null
  fail(entry?.mode==='deposit_wallet'&&/^0x[a-f0-9]{40}$/i.test(entry.deposit_wallet),'Owner-bound deposit wallet required')
  const response=await fetch('https://gamma-api.polymarket.com/markets/slug/'+intent.marketSlug,{signal:AbortSignal.timeout(15000)});fail(response.ok,'Market lookup unavailable')
  const market=await response.json(),labels=typeof market.outcomes==='string'?JSON.parse(market.outcomes):market.outcomes,tokens=typeof market.clobTokenIds==='string'?JSON.parse(market.clobTokenIds):market.clobTokenIds
  fail(market.slug===intent.marketSlug&&Array.isArray(labels)&&labels.filter(x=>x===intent.outcome).length===1,'Exact market outcome unavailable')
  const tokenId=tokens[labels.indexOf(intent.outcome)];fail(/^[1-9][0-9]{0,77}$/.test(tokenId),'Invalid token')
  const rpc=async(method,params)=>{const r=await fetch(process.env.POLYMARKET_RPC_URL||process.env.POLYGON_RPC_URL||'https://polygon-bor-rpc.publicnode.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});fail(r.ok,'Position provider unavailable');const b=await r.json();fail(!b.error&&b.result!=null,'Position evidence unavailable');return b.result}
  const abi=new Interface(['function balanceOf(address,uint256) view returns (uint256)'])
  const gate=await evaluateContinuation(intent,{owner,wallet:entry.deposit_wallet.toLowerCase(),tokenId},{review:(o,t)=>reviewLocalMemory(directory,o,t),position:async(w,t)=>{fail(await rpc('eth_chainId',[])==='0x89','Wrong position chain');return BigInt(await rpc('eth_call',[{to:'0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',data:abi.encodeFunctionData('balanceOf',[w,t])},'latest']))}},ack==='none'?'':ack)
  console.log(JSON.stringify(gate));if(!gate.memoryGatePassed)process.exitCode=2
 }catch{console.log(JSON.stringify({ok:false,memoryGatePassed:false,state:'MEMORY_CONTINUATION_BLOCKED',signingAuthorized:false,orderSubmitted:false,nextAction:'VERIFY_MEMORY_AND_POSITION; DO_NOT_SUBMIT_OR_RETRY_TRADE'}));process.exitCode=1}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)void main()
