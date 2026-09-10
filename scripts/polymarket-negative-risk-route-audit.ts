import { createPublicClient, http, parseAbi } from 'viem'
import { polygon } from 'viem/chains'
const client = createPublicClient({chain:polygon,transport:http('https://polygon.drpc.org')})
const exchange = '0xe2222d279d744050d28e00520010520000310F59' as const
const abi = parseAbi(['function getCollateral() view returns (address)','function getOutcomeTokenFactory() view returns (address)','function getCtfCollateral() view returns (address)'])
for (const functionName of ['getCollateral','getOutcomeTokenFactory','getCtfCollateral'] as const) {
 try { console.log(JSON.stringify({contract:exchange,functionName,value:await client.readContract({address:exchange,abi,functionName})})) }
 catch(e) { console.log(JSON.stringify({functionName,error:(e as Error).message.slice(0,200)})) }
}
const adapter='0xadA2005600Dec949baf300f4C6120000bDB6eAab' as const
const adapterAbi=parseAbi(['function COLLATERAL_TOKEN() view returns (address)','function USDCE() view returns (address)','function NEG_RISK_ADAPTER() view returns (address)'])
for (const functionName of ['COLLATERAL_TOKEN','USDCE','NEG_RISK_ADAPTER'] as const) {
 try { console.log(JSON.stringify({contract:adapter,functionName,value:await client.readContract({address:adapter,abi:adapterAbi,functionName})})) }
 catch(e) { console.log(JSON.stringify({functionName,error:(e as Error).message.slice(0,200)})) }
}
const factory = await client.readContract({address:exchange,abi,functionName:'getOutcomeTokenFactory'})
for (const functionName of ['COLLATERAL_TOKEN','USDCE','NEG_RISK_ADAPTER'] as const) {
 try { console.log(JSON.stringify({contract:factory,functionName,value:await client.readContract({address:factory,abi:adapterAbi,functionName})})) }
 catch(e) { console.log(JSON.stringify({contract:factory,functionName,error:(e as Error).message.slice(0,200)})) }
}
const allowanceAbi=parseAbi(['function allowance(address owner,address spender) view returns (uint256)'])
const collateral=await client.readContract({address:exchange,abi,functionName:'getCollateral'})
console.log(JSON.stringify({check:'exchange approves its own factory',allowance:String(await client.readContract({address:collateral,abi:allowanceAbi,functionName:'allowance',args:[exchange,factory]}))}))
const legacy=await client.readContract({address:factory,abi:adapterAbi,functionName:'NEG_RISK_ADAPTER'})
const legacyAbi=parseAbi(['function col() view returns (address)','function wcol() view returns (address)'])
for(const functionName of ['col','wcol'] as const) console.log(JSON.stringify({contract:legacy,functionName,value:await client.readContract({address:legacy,abi:legacyAbi,functionName})}))
