import {TypedDataEncoder} from 'ethers'
const exchanges=['0xe111180000d2663c0091e4f400237545b87b996b','0xe2222d279d744050d28e00520010520000310f59']
const types={Order:[['salt','uint256'],['maker','address'],['signer','address'],['tokenId','uint256'],['makerAmount','uint256'],['takerAmount','uint256'],['side','uint8'],['signatureType','uint8'],['timestamp','uint256'],['metadata','bytes32'],['builder','bytes32']].map(([name,type])=>({name,type}))}
const lower=value=>String(value??'').toLowerCase()
function requireThat(ok,message){if(!ok)throw new Error(message)}
export function recoveryOrderId(binding){
 requireThat(binding?.schema==='polydesk-order-binding-v1'&&exchanges.includes(lower(binding.exchange)),'Invalid recovery binding or exchange.')
 const o=binding.order
 requireThat(o && [0,1].includes(o.side)&&o.signatureType===3&&lower(o.maker)===lower(o.signer),'Only bound deposit-wallet V2 orders are recoverable.')
 requireThat(BigInt(o.makerAmount)>0n&&BigInt(o.takerAmount)>0n,'Invalid signed-order amounts.')
 return TypedDataEncoder.hash({name:'Polymarket CTF Exchange',version:'2',chainId:137,verifyingContract:binding.exchange},types,o).toLowerCase()
}
