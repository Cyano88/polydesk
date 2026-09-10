import type { Request, Response } from 'express'
import { createPublicClient, formatUnits, getAddress, http, parseUnits } from 'viem'
import { polygon } from 'viem/chains'
import { inspectPolymarketDepositWallet } from './polymarket-deposit-wallet.js'
import { readTradeFees, type VerifiedFees } from './polymarket-native-fees.js'
const CTF = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045' as const
const EX = '0xE111180000d2663C0091e4f400237545B87B996B' as const
const NEG = '0xe2222d279d744050d28e00520010520000310F59' as const
const ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296' as const
const abi = [
 {type:'function',name:'balanceOf',stateMutability:'view',inputs:[{type:'address',name:'owner'},{type:'uint256',name:'id'}],outputs:[{type:'uint256'}]},
 {type:'function',name:'isApprovedForAll',stateMutability:'view',inputs:[{type:'address',name:'owner'},{type:'address',name:'operator'}],outputs:[{type:'bool'}]},
] as const
export type SellDependencies = {
 fetchJson:(url:string)=>Promise<any>; inspectWallet:typeof inspectPolymarketDepositWallet; now:()=>number; builderCode:()=>string
 readPosition:(wallet:`0x${string}`,token:string,operators:readonly `0x${string}`[])=>Promise<{balance:bigint;approved:boolean[]}>
 readFees?:(condition:string,token:string,code:string)=>Promise<VerifiedFees>
}
const defaults: SellDependencies = {
 fetchJson:async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Provider HTTP ${r.status}`);return r.json()},
 inspectWallet:inspectPolymarketDepositWallet, now:Date.now,builderCode:()=>process.env.POLYMARKET_BUILDER_CODE || '',
 readPosition:async(wallet,token,operators)=>{
  const client=createPublicClient({chain:polygon,transport:http(process.env.POLYMARKET_RPC_URL || process.env.POLYGON_RPC_URL || undefined,{timeout:12000,retryCount:0})})
  const [balance,approved]=await Promise.all([
   client.readContract({address:CTF,abi,functionName:'balanceOf',args:[wallet,BigInt(token)]}),
   Promise.all(operators.map(operator=>client.readContract({address:CTF,abi,functionName:'isApprovedForAll',args:[wallet,operator]}))),
  ]);return {balance,approved}
 },
}
function units(value:unknown) {
 const text=String(value ?? '')
 if(!/^\d+(?:\.\d{1,6})?$/.test(text))throw new Error('Expected positive amount with at most six decimals.')
 return parseUnits(text,6)
}
export async function preflightPolymarketSell(input:Record<string,any>,deps=defaults) {
 const started=deps.now(), owner=getAddress(String(input.ownerAddress ?? ''))
 const slug=String(input.marketSlug ?? ''), shares=units(input.shares), price=units(input.minimumPrice)
 if(!/^[a-z0-9-]{1,200}$/.test(slug)||shares<=0n||price<=0n||price>=1000000n)throw new Error('Provide exact market, positive shares and minimum price below one.')
 if((input.orderType ?? 'FOK')!=='FOK'||input.postOnly===true)throw new Error('Sell preflight currently supports FOK only; preserve buyer policy.')
 const code=deps.builderCode()
 if(!/^0x[a-fA-F0-9]{64}$/.test(code)||/^0x0+$/.test(code))throw new Error('Verified builder code required.')
 const [market,wallet]=await Promise.all([deps.fetchJson(`https://gamma-api.polymarket.com/markets/slug/${slug}`),deps.inspectWallet(owner)])
 if(market.slug!==slug||market.active!==true||market.closed!==false||market.acceptingOrders!==true||!/^0x[a-fA-F0-9]{64}$/.test(market.conditionId))throw new Error('Exact market is not accepting orders.')
 const labels=typeof market.outcomes==='string'?JSON.parse(market.outcomes):market.outcomes
 const tokens=typeof market.clobTokenIds==='string'?JSON.parse(market.clobTokenIds):market.clobTokenIds
 if(!Array.isArray(labels)||!Array.isArray(tokens)||labels.length!==tokens.length)throw new Error('Invalid outcome mapping.')
 const matches=labels.map((label,index)=>({label,token:String(tokens[index])})).filter(x=>String(x.label).toLowerCase()===String(input.outcome).toLowerCase())
 if(matches.length!==1||!/^\d+$/.test(matches[0].token))throw new Error('Outcome must map uniquely.')
 const token=matches[0].token
 const [book,fees]=await Promise.all([
  deps.fetchJson(`https://clob.polymarket.com/book?token_id=${token}`),
  deps.readFees?deps.readFees(market.conditionId,token,code):readTradeFees(deps.fetchJson,market.conditionId,token,code),
 ])
 const timestamp=Number(book.timestamp), tick=units(book.tick_size)
 if(book.asset_id!==token||book.market!==market.conditionId||typeof book.neg_risk!=='boolean'||!Number.isSafeInteger(timestamp)||timestamp<=0||timestamp>deps.now()+5000||tick<=0n||price%tick!==0n)throw new Error('Unverified book identity, timestamp or price tick.')
 if(!Array.isArray(book.bids))throw new Error('Missing bid depth.')
 let depth=0n
 for(const level of book.bids){const p=units(level.price),s=units(level.size);if(p<=0n||p>=1000000n||s<0n)throw new Error('Malformed bid level.');if(p>=price)depth+=s}
 if(shares % 1000000n !== 0n)throw new Error('Local executor requires whole shares; never silently round buyer quantity.')
 const operators=book.neg_risk?[NEG,ADAPTER]:[EX]
 const state=await deps.readPosition(wallet.depositWalletAddress as `0x${string}`,token,operators)
 const issues:string[]=[]
 if(!wallet.deployed)issues.push('DEPOSIT_WALLET_NOT_DEPLOYED')
 if(state.balance<shares)issues.push('INSUFFICIENT_OUTCOME_SHARES')
 if(state.approved.length!==operators.length||state.approved.some(value=>value!==true))issues.push('OUTCOME_OPERATOR_APPROVAL_REQUIRED')
 if(depth<shares)issues.push('INSUFFICIENT_DEPTH_AT_MINIMUM_PRICE')
 if(deps.now()-timestamp>30000)issues.push('STALE_ORDER_BOOK')
 if(deps.now()-started>30000)issues.push('PREFLIGHT_EXPIRED_DURING_CHECKS')
 // Local plugin deliberately supports zero-fee attribution until its fee cap is upgraded.
 if(fees.makerBps!==0||fees.takerBps!==0)issues.push('LOCAL_EXECUTOR_BUILDER_FEES_UNSUPPORTED')
 const gross=shares*price/1000000n
 const rate=BigInt(Math.ceil(fees.marketRate*1000000)), builder=BigInt(fees.takerBps)*100n
 const reserve=(gross*rate+999999n)/1000000n+(gross*builder+999999n)/1000000n
 return {ok:true,publicChecksPassed:issues.length===0,issues,orderAuthorized:false,signingVerified:false,
  wallet:wallet.depositWalletAddress,marketSlug:slug,conditionId:market.conditionId,tokenId:token,outcome:matches[0].label,
  shares:formatUnits(shares,6),minimumPrice:formatUnits(price,6),orderType:'FOK',positionShares:formatUnits(state.balance,6),bidDepthShares:formatUnits(depth,6),
  operators,operatorApprovals:state.approved,builderCode:code,builderRateBps:fees.takerBps,
  minimumGrossProceeds:formatUnits(gross,6),feeReserveAtMinimum:formatUnits(reserve,6),conservativeMinimumNetProceeds:formatUnits(gross>reserve?gross-reserve:0n,6),
  checkedAt:new Date(deps.now()).toISOString(),validUntil:new Date(Math.min(timestamp+30000,started+30000)).toISOString(),
  previewArgs:['sell','--market-id',slug,'--outcome',String(matches[0].label),'--shares',formatUnits(shares,6),'--price',formatUnits(price,6),'--order-type','FOK','--dry-run'],
  next:issues.length?'Resolve these blockers, then request a fresh sell preview.':'Review the sell preview and separately confirm execution. Fees shown are reserves, not settled charges.'}
}
export default async function handler(req:Request,res:Response){res.setHeader('Cache-Control','no-store');try{return res.json(await preflightPolymarketSell(req.body??{}))}catch(error){return res.status(409).json({ok:false,publicChecksPassed:false,orderAuthorized:false,error:error instanceof Error?error.message:'Sell preflight failed.'})}}