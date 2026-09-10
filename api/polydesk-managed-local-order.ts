import { createHash } from 'node:crypto'
import { verifyMessage } from 'ethers'
export type ManagedLocalOrder = {
 schema:'polydesk-managed-local-buy-v1'; jobId:string; buyerAgentId:string; executionId:string
 owner:string; wallet:string; marketSlug:string; outcome:string; tokenId:string; conditionId:string
 maxTotalUsdc:string; orderAmountUsdc:string; maximumPrice:string; expiresAt:number
 side:'BUY'; orderType:'FOK'
}
export type ManagedLocalDeps = {
 now:()=>number; active:(job:string,buyer:string)=>Promise<boolean>; owner:()=>Promise<string>
 preflight:(order:ManagedLocalOrder)=>Promise<any>
 submit:(order:ManagedLocalOrder,args:string[],constraints:Record<string,string|number>)=>Promise<any>
}
const keys=['schema','jobId','buyerAgentId','executionId','owner','wallet','marketSlug','outcome','tokenId','conditionId','maxTotalUsdc','orderAmountUsdc','maximumPrice','expiresAt','side','orderType'] as const
const units=(v:string)=>{if(typeof v!=='string'||!/^\d+(?:\.\d{1,6})?$/.test(v))throw new Error('Exact decimal amount required.');const [a,b='']=v.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'))}
export function managedLocalOrderMessage(order:ManagedLocalOrder){
 if(!order||typeof order!=='object'||Object.keys(order).length!==keys.length||Object.keys(order).some(k=>!keys.includes(k as any)))throw new Error('Unsupported managed local order.')
 if(order.schema!=='polydesk-managed-local-buy-v1'||order.side!=='BUY'||order.orderType!=='FOK')throw new Error('Managed local adapter supports exact FOK BUY only.')
 if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(order.executionId)||!/^0x[a-fA-F0-9]{64}$/.test(order.jobId)||!/^\d+$/.test(order.buyerAgentId))throw new Error('Exact task, buyer and stable execution ID required.')
 if(!/^0x[a-f0-9]{40}$/.test(order.owner)||!/^0x[a-f0-9]{40}$/.test(order.wallet)||!/^\d+$/.test(order.tokenId)||!/^0x[a-f0-9]{64}$/.test(order.conditionId)||!/^[-a-z0-9]{1,200}$/.test(order.marketSlug)||!/^[-a-zA-Z0-9 .()]{1,100}$/.test(order.outcome))throw new Error('Invalid exact owner or market identity.')
 if(units(order.maxTotalUsdc)<=0n||units(order.orderAmountUsdc)<=0n||units(order.orderAmountUsdc)>units(order.maxTotalUsdc)||units(order.maximumPrice)<=0n||units(order.maximumPrice)>=1000000n||!Number.isSafeInteger(order.expiresAt))throw new Error('Invalid exact trade limits.')
 return ['PolyDesk Managed Exact Local BUY v1','https://polydesk.trade','Chain: 137','One FOK BUY only; total cap includes fees; no funding, approvals, sells or retries','Independent buyer decision; no research approval is implied',...keys.map(k=>k+': '+order[k])].join('\n')
}
export async function runManagedLocalOrder(order:ManagedLocalOrder,signature:string|undefined,execute:boolean,deps:ManagedLocalDeps){
 const authorizationMessage=managedLocalOrderMessage(order)
 const current=()=>{if(order.expiresAt<=deps.now()||order.expiresAt>deps.now()+300000)throw new Error('Trade authorization must expire within five minutes.')}
 current()
 if(!execute)return{ok:true,state:'BUYER_AUTHORIZATION_REQUIRED',authorizationMessage,orderSubmitted:false,followUpPrompts:['Review this exact trade and total fee-inclusive cap, then sign with the trading owner.','Decline this trade or request a new preview?']}
 if(typeof signature!=='string'||verifyMessage(authorizationMessage,signature).toLowerCase()!==order.owner)throw new Error('Exact owner-signed execution authority required.')
 if(!await deps.active(order.jobId,order.buyerAgentId))throw new Error('Managed subscription is not active.')
 if((await deps.owner()).toLowerCase()!==order.owner)throw new Error('Local wallet is not the authorized buyer owner.')
 const p=await deps.preflight(order)
 current()
 if(p?.ok!==true||p.publicChecksPassed!==true||p.owner?.toLowerCase()!==order.owner||p.wallet?.toLowerCase()!==order.wallet||p.tokenId!==order.tokenId||p.conditionId?.toLowerCase()!==order.conditionId||p.marketSlug!==order.marketSlug||p.outcome?.toLowerCase()!==order.outcome.toLowerCase()||p.orderType!=='FOK'||p.postOnly!==false||units(p.limitPrice)!==units(order.maximumPrice)||units(p.orderAmount)!==units(order.orderAmountUsdc)||units(p.requiredBalance)>units(order.maxTotalUsdc)||( !Number.isFinite(Date.parse(p.validUntil)) || Date.parse(p.validUntil)<=deps.now())||(Date.parse(p.checkedAt)>deps.now() || deps.now()-Date.parse(p.checkedAt)>30000)||!Number.isFinite(Date.parse(p.checkedAt)))throw new Error('Fresh readiness differs from the signed exact order; request a new preview and authorization.')
 if(!await deps.active(order.jobId,order.buyerAgentId))throw new Error('Managed subscription stopped before submission.')
 current()
 const constraints={schema:'polydesk-managed-native-v1',executionId:order.executionId,owner:order.owner,wallet:order.wallet,tokenId:order.tokenId,conditionId:order.conditionId,maxTotalRaw:String(units(order.maxTotalUsdc)),maxOrderRaw:String(units(order.orderAmountUsdc)),maxPriceRaw:String(units(order.maximumPrice)),expiresAt:Math.min(order.expiresAt,Date.parse(p.validUntil)),approvalHash:createHash('sha256').update(authorizationMessage).digest('hex')}
 const args=['buy','--market-id',order.marketSlug,'--outcome',order.outcome,'--amount',order.orderAmountUsdc,'--price',order.maximumPrice,'--order-type','FOK']
 // The trusted local adapter must enforce constraints natively before signing and posting.
 // No caller-supplied command, API origin, environment, credential or executor is accepted.
 const result=await deps.submit(order,args,constraints)
 return{ok:true,state:'SUBMISSION_REQUIRES_RECEIPT',executionId:order.executionId,result,settlementVerified:false,automaticRetryAllowed:false,followUpPrompts:['Check the exact order and finalized receipt.','Do not repeat this execution, even after a timeout.']}
}

export async function prepareManagedLocalOrder(identity:{jobId:string;buyerAgentId:string},requestId:string,input:Record<string,any>,preflight:(input:Record<string,any>)=>Promise<any>,now=Date.now){
 if(!input||Object.keys(input).some(k=>!['ownerAddress','marketSlug','outcome','maxTotalUsdc','limitPrice','acknowledgeIndependentDecision'].includes(k))||input.acknowledgeIndependentDecision!==true)throw new Error('An explicit independent decision and exact native preview inputs are required.')
 const {acknowledgeIndependentDecision,...intent}=input
 const preview=await preflight({...intent,orderType:'FOK',postOnly:false})
 if(preview?.ok!==true||preview.publicChecksPassed!==true)return{ok:false,state:'TRADE_BLOCKED',preview,orderSubmitted:false,tradeAuthorized:false,followUpPrompts:['Resolve the reported readiness issue, then request a fresh preview.']}
 const order:ManagedLocalOrder={schema:'polydesk-managed-local-buy-v1',jobId:identity.jobId,buyerAgentId:identity.buyerAgentId,executionId:'pml_'+createHash('sha256').update(JSON.stringify([identity.jobId,identity.buyerAgentId,requestId])).digest('hex').slice(0,48),owner:String(preview.owner).toLowerCase(),wallet:String(preview.wallet).toLowerCase(),marketSlug:preview.marketSlug,outcome:preview.outcome,tokenId:preview.tokenId,conditionId:String(preview.conditionId).toLowerCase(),maxTotalUsdc:input.maxTotalUsdc,orderAmountUsdc:preview.orderAmount,maximumPrice:input.limitPrice,expiresAt:now()+300000,side:'BUY',orderType:'FOK'}
 return{ok:true,state:'BUYER_LOCAL_AUTHORIZATION_REQUIRED',preview,order,authorizationMessage:managedLocalOrderMessage(order),orderSubmitted:false,tradeAuthorized:false,buyerLocalCommand:'npm run managed-agent:local -- --request ORDER_FILE --execute',followUpPrompts:['Review the exact order and total cap, then sign the authorization with the buyer owner wallet.','Decline or analyze another market?']}
}
