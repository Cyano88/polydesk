import {recoveryOrderId} from './polymarket-order-binding.mjs'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {Interface,parseUnits,formatUnits} from 'ethers'
import {createL2Headers} from '../node_modules/@polymarket/clob-client-v2/dist/headers/index.js'
import {executionStatus} from './polymarket-execution-guard.mjs'
const exchanges=['0xe111180000d2663c0091e4f400237545b87b996b','0xe2222d279d744050d28e00520010520000310f59']
export const fillInterface=new Interface(['event OrderFilled(bytes32 indexed orderHash,address indexed maker,address indexed taker,uint8 side,uint256 tokenId,uint256 makerAmountFilled,uint256 takerAmountFilled,uint256 fee,bytes32 builder,bytes32 metadata)'])
const lower=value=>String(value??'').toLowerCase()
function requireThat(ok,message){if(!ok)throw new Error(message)}
function atomic(value){requireThat(/^\d+(?:\.\d{1,6})?$/.test(String(value)),'Invalid provider order amount.');return parseUnits(String(value),6)}
export {recoveryOrderId} from './polymarket-order-binding.mjs'
export async function reconcileEvidence(binding,deps){
 const orderId=recoveryOrderId(binding),b=binding.order
 let order=await deps.readOrder(orderId)
 let historyEvidence=false
 if(!order&&deps.findTrades){
  const trades=await deps.findTrades(orderId)
  requireThat(Array.isArray(trades)&&trades.length>0,'No exact trade history; retain guard.')
  const shares=BigInt(b.side===0?b.takerAmount:b.makerAmount)
  const collateral=BigInt(b.side===0?b.makerAmount:b.takerAmount)
  requireThat(collateral*1000000n%shares===0n,'Signed price cannot be represented exactly.')
  // Only a complete finalized fill can resolve an absent order record. Partial
  // fills cannot prove the remainder is no longer open, and remain blocked.
  order={id:orderId,maker_address:b.maker,asset_id:b.tokenId,market:binding.conditionId,side:b.side===0?'BUY':'SELL',
   original_size:formatUnits(shares,6),size_matched:formatUnits(shares,6),price:formatUnits(collateral*1000000n/shares,6),status:'MATCHED',associate_trades:trades.map(t=>t.id)}
  historyEvidence=true
 }
 requireThat(order&&lower(order.id)===orderId&&lower(order.maker_address)===lower(b.maker)
  &&String(order.asset_id)===String(b.tokenId)&&lower(order.market)===lower(binding.conditionId)
  &&order.side===(b.side===0?'BUY':'SELL'),'Authenticated order identity mismatch or order not found; retain guard.')
 const expectedShares=BigInt(b.side===0?b.takerAmount:b.makerAmount),matched=atomic(order.size_matched)
 requireThat(atomic(order.original_size)===expectedShares&&matched<=expectedShares,'Order size differs from saved binding.')
 const price=atomic(order.price)
 requireThat(b.side===0?price*BigInt(b.takerAmount)===BigInt(b.makerAmount)*1000000n:price*BigInt(b.makerAmount)===BigInt(b.takerAmount)*1000000n,'Order price differs from saved binding.')
 const status=String(order.status).toUpperCase()
 requireThat(['LIVE','MATCHED','CANCELED','CANCELLED'].includes(status),'Unknown or transitional order state; retain guard.')
 if(status==='MATCHED')requireThat(matched===expectedShares,'Matched order is not fully accounted for.')
 let totalShares=0n,totalCollateral=0n,totalFee=0n
 const transactions=[]
 if(matched>0n){
  requireThat(Array.isArray(order.associate_trades)&&order.associate_trades.length>0&&order.associate_trades.length<=1000,'Missing or excessive trade references.')
  const txs=new Set()
  for(const id of new Set(order.associate_trades)){
   requireThat(typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id),'Invalid trade reference.')
   const trade=await deps.readTrade(id)
   requireThat(trade?.id===id&&(lower(trade.taker_order_id)===orderId||trade.maker_orders?.some(m=>lower(m.order_id)===orderId)),'Trade does not reference exact order.')
   requireThat(/^0x[a-fA-F0-9]{64}$/.test(trade.transaction_hash),'Trade lacks settlement transaction.')
   txs.add(lower(trade.transaction_hash))
  }
  for(const tx of txs){
   const {receipt,canonicalBlockHash,finalizedBlock}=await deps.readReceipt(tx)
   requireThat(receipt?.status==='0x1'&&lower(receipt.transactionHash)===tx&&lower(receipt.blockHash)===lower(canonicalBlockHash)
    &&/^0x[0-9a-f]+$/i.test(receipt.blockNumber)&&BigInt(receipt.blockNumber)<=BigInt(finalizedBlock),'Receipt is unsuccessful, noncanonical or not finalized.')
   requireThat(Array.isArray(receipt.logs),'Receipt has no logs.')
   const seen=new Set();let found=false
   for(const log of receipt.logs){
    if(lower(log.address)!==lower(binding.exchange))continue
    let event;try{event=fillInterface.parseLog(log)}catch{continue}
    if(!event||lower(event.args.orderHash)!==orderId)continue
    const a=event.args
    requireThat(log.removed!==true&&lower(log.transactionHash)===tx&&/^0x[0-9a-f]+$/i.test(log.logIndex),'Removed or invalid fill log.')
    const index=BigInt(log.logIndex).toString();requireThat(!seen.has(index),'Duplicate fill log.');seen.add(index)
    requireThat(lower(a.maker)===lower(b.maker)&&a.side===BigInt(b.side)&&a.tokenId===BigInt(b.tokenId)
     &&lower(a.builder)===lower(b.builder)&&lower(a.metadata)===lower(b.metadata),'Fill identity, side, token or attribution differs from saved binding.')
    const shares=b.side===0?a.takerAmountFilled:a.makerAmountFilled,collateral=b.side===0?a.makerAmountFilled:a.takerAmountFilled
    requireThat(shares>0n&&collateral>0n&&(b.side===0?collateral*BigInt(b.takerAmount)<=shares*BigInt(b.makerAmount):collateral*BigInt(b.makerAmount)>=shares*BigInt(b.takerAmount)),'Fill violates signed price bound.')
    totalShares+=shares;totalCollateral+=collateral;totalFee+=a.fee;found=true
   }
   requireThat(found,'No exact bound order fill in transaction.');transactions.push(tx)
  }
  requireThat(totalShares===matched,'Finalized fills do not account for matched shares.')
  if(b.side===0)requireThat(totalCollateral<=BigInt(b.makerAmount),'Fill exceeds signed collateral amount.')
 }else requireThat(!order.associate_trades?.length,'Unmatched order unexpectedly references trades.')
 const state=status==='LIVE'?(matched>0n?'OPEN_PARTIALLY_FILLED':'OPEN'):status==='MATCHED'?'FILLED':matched>0n?'CANCELED_PARTIALLY_FILLED':'CANCELED_UNFILLED'
 return {state,orderId,transactions,evidenceSource:historyEvidence?'finalized-exact-order-trade-history':'authenticated-order-and-finalized-fills',matchedSharesRaw:totalShares.toString(),collateralRaw:totalCollateral.toString(),feeRaw:totalFee.toString(),
  executionAuthorized:false,retryAuthorized:false,next:state.startsWith('OPEN')?'Track the existing order; do not submit it again.':state==='FILLED'?'Show the recovered receipt and refresh the position.':'Show the cancellation and any fills. A new order needs a fresh preview and authorization.'}
}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return true;try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}}
function save(path,value){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd)}finally{closeSync(fd)}}
export async function recoverPending(directory,depsFactory=defaultDependencies,isAlive=alive){
 const pending=executionStatus(directory)
 if(pending.state==='NO_UNCERTAIN_EXECUTION')return {ok:true,state:pending.state,executionAuthorized:false,next:'No interrupted submission requires recovery.'}
 requireThat(!isAlive(pending.guardPid),'Submission process may still be running; retain guard.')
 const key=createHash('sha256').update(pending.id).digest('hex'),record=join(directory,`${key}.json`),lock=join(directory,'pending.json')
 const lease=join(directory,'recovery.lock');save(lease,{id:pending.id,pid:process.pid})
 try{
  const saved=JSON.parse(readFileSync(record,'utf8')),binding=JSON.parse(readFileSync(`${record}.binding.json`,'utf8'))
  requireThat(saved.id===pending.id&&saved.intentHash===pending.intentHash&&binding.executionId===pending.id,'Recovery record identity mismatch.')
  const orderId=recoveryOrderId(binding)
  requireThat(!saved.orderId||lower(saved.orderId)===orderId,'Submitted order hash differs from binding.')
  const result=await reconcileEvidence(binding,await depsFactory(binding))
  requireThat(executionStatus(directory).id===pending.id,'Pending execution changed during recovery.')
  const next={...saved,...result,recoveredAt:new Date().toISOString()}
  const temp=`${record}.recovered-${process.pid}`;save(temp,next);renameSync(temp,record)
  unlinkSync(lock)
  return {ok:true,...result,recovered:true,executionId:pending.id}
 }finally{unlinkSync(lease)}
}
export async function defaultDependencies(binding){
 const owner=lower(binding.owner)
 requireThat(/^0x[a-f0-9]{40}$/.test(owner),'Invalid bound owner.')
 const store=JSON.parse(readFileSync(join(process.env.USERPROFILE||process.env.HOME||'','.config','polymarket','creds.json'),'utf8'))
 const entry=store._version===2?store[owner]:lower(store.signing_address)===owner?store:null
 requireThat(entry?.mode==='deposit_wallet'&&lower(entry.deposit_wallet)===lower(binding.order.maker),'Local wallet credentials do not match bound maker.')
 const signer={getAddress:async()=>owner,_signTypedData:async()=>{throw new Error('Signing prohibited in recovery')}}
 const creds={key:entry.api_key,secret:entry.secret,passphrase:entry.passphrase}
 const get=async(path,query='')=>{
  const headers=await createL2Headers(signer,creds,{method:'GET',requestPath:path})
  const r=await fetch(`https://clob.polymarket.com${path}${query}`,{headers,signal:AbortSignal.timeout(15000)})
  if(r.status===404&&path.startsWith('/data/order/'))return null
  requireThat(r.ok,`Authenticated order lookup HTTP ${r.status}; retain guard.`);return r.json()
 }
 const rpc=async(method,params)=>{
  const r=await fetch(process.env.POLYMARKET_RPC_URL||process.env.POLYGON_RPC_URL||'https://polygon-bor-rpc.publicnode.com',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)})
  requireThat(r.ok,'Receipt provider unavailable.');const value=await r.json();requireThat(!value.error&&value.result!=null,'Receipt or finalized block unavailable.');return value.result
 }
 return {readOrder:id=>get(`/data/order/${id}`),readTrade:async id=>{const value=await get('/data/trades',`?id=${encodeURIComponent(id)}`);const rows=Array.isArray(value)?value:value.data;requireThat(Array.isArray(rows),'Invalid trade response.');return rows.find(t=>t.id===id)},
  findTrades:async orderId=>{
   const found=[],seen=new Set();let cursor='MA=='
   const after=(BigInt(binding.order.timestamp)/1000n-60n).toString()
   for(let page=0;page<20;page++){
    const query=new URLSearchParams({market:binding.conditionId,asset_id:String(binding.order.tokenId),after,next_cursor:cursor})
    const value=await get('/data/trades',`?${query}`),rows=Array.isArray(value)?value:value.data
    requireThat(Array.isArray(rows),'Invalid trade history.')
    for(const trade of rows)if(lower(trade.taker_order_id)===orderId||trade.maker_orders?.some(m=>lower(m.order_id)===orderId))found.push(trade)
    if(Array.isArray(value)||value.next_cursor==='LTE=')return found
    requireThat(typeof value.next_cursor==='string'&&!seen.has(value.next_cursor),'Invalid trade pagination.')
    seen.add(value.next_cursor);cursor=value.next_cursor
   }
   throw new Error('Trade history pagination limit reached; retain guard.')
  },
  readReceipt:async tx=>{const receipt=await rpc('eth_getTransactionReceipt',[tx]);const [block,finalized,chainId]=await Promise.all([rpc('eth_getBlockByNumber',[receipt.blockNumber,false]),rpc('eth_getBlockByNumber',['finalized',false]),rpc('eth_chainId',[])]);return {receipt,canonicalBlockHash:block.hash,finalizedBlock:finalized.number,canonicalBlock:block,finalizedHeader:finalized,chainId}}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const directory=process.argv[2];requireThat(Boolean(directory),'Execution ledger directory required.');const result=await recoverPending(directory);if(result.recovered&&result.state==='FILLED'){try{const {captureLocalExecution}=await import('./polymarket-local-memory.mjs');result.memory=await captureLocalExecution(directory,result.executionId)}catch{result.memory={ok:false,state:'LOCAL_MEMORY_REVIEW_REQUIRED',retryTrade:false}}}console.log(JSON.stringify(result))}
 catch{console.log(JSON.stringify({ok:false,state:'UNRESOLVED',executionAuthorized:false,retryAuthorized:false,next:'Keep submission blocked. Exact order or finalized receipt evidence is unavailable; check recovery records and provider status.'}));process.exitCode=1}
}