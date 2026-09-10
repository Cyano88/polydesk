import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {verifyMessage} from 'ethers'
import {recoveryOrderId,defaultDependencies,reconcileEvidence,recoverPending} from './polymarket-execution-recovery.mjs'
import {executionStatus} from './polymarket-execution-guard.mjs'
const lower=v=>String(v??'').toLowerCase()
const units=v=>{const[a,b='']=v.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'))}
export async function checkManagedLocalReceipt(directory,order,signature,message,depsFactory=defaultDependencies){
 if(verifyMessage(message,signature).toLowerCase()!==order.owner)throw Error('Original buyer order signature required.')
 const path=join(directory,createHash('sha256').update(order.executionId).digest('hex')+'.json')
 const saved=JSON.parse(readFileSync(path,'utf8')),binding=JSON.parse(readFileSync(path+'.binding.json','utf8')),b=binding.order
 if(saved.id!==order.executionId||binding.executionId!==order.executionId||lower(binding.owner)!==order.owner||lower(b.maker)!==order.wallet||String(b.tokenId)!==order.tokenId||lower(binding.conditionId)!==order.conditionId||b.side!==0||BigInt(b.makerAmount)>units(order.orderAmountUsdc)||BigInt(b.makerAmount)*1000000n>BigInt(b.takerAmount)*units(order.maximumPrice))throw Error('Saved order does not match buyer authorization.')
 const orderId=recoveryOrderId(binding)
 if(saved.orderId&&lower(saved.orderId)!==orderId)throw Error('Saved order hash mismatch.')
 const pending=executionStatus(directory)
 const receipt=pending.id===order.executionId?await recoverPending(directory,depsFactory):await reconcileEvidence(binding,await depsFactory(binding))
 const total=BigInt(receipt.collateralRaw??'0')+BigInt(receipt.feeRaw??'0')
 if(total>units(order.maxTotalUsdc))throw Error('Verified debit exceeds authorized total; operator review required.')
 return{ok:true,executionId:order.executionId,state:receipt.state,settlementVerified:receipt.state==='FILLED',receipt,actualTotalDebitRaw:String(total),memoryStatus:'NOT_SYNCHRONIZED',orderSubmitted:false,automaticRetryAllowed:false,followUpPrompts:receipt.state==='FILLED'?['Show the verified fill, actual fee and total debit?','Check this position?','Analyze another market or keep funds?']:['Check this exact order again.','Do not resubmit an unresolved execution.']}
}