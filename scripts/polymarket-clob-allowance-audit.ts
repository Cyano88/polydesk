import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createL2Headers } from '../node_modules/@polymarket/clob-client-v2/dist/headers/index.js'
const owner=process.argv[2]
if (!/^0x[0-9a-fA-F]{40}$/.test(owner || '')) throw new Error('Explicit owner address required')
const store=JSON.parse(await readFile(join(process.env.USERPROFILE!,'.config','polymarket','creds.json'),'utf8'))
const entry=store._version === 2 ? store[owner.toLowerCase()] : store.signing_address?.toLowerCase() === owner.toLowerCase() ? store : null
if (!entry || entry.mode !== 'deposit_wallet' || !entry.deposit_wallet) throw new Error('Verified deposit-wallet credentials required')
const signer={getAddress:async()=>owner,_signTypedData:async()=>{throw new Error('Signing prohibited in this diagnostic')}} as any
const creds={key:entry.api_key,secret:entry.secret,passphrase:entry.passphrase}
async function check(update=false) {
 const path=update?'/balance-allowance/update':'/balance-allowance'
 const headers=await createL2Headers(signer,creds,{method:'GET',requestPath:path})
 const response=await fetch('https://clob.polymarket.com'+path+'?asset_type=COLLATERAL&signature_type=3',{headers,signal:AbortSignal.timeout(20000)})
 if (update) { if (!response.ok) throw new Error('Cache refresh HTTP '+response.status); console.log(JSON.stringify({stage:'cache_refresh',httpStatus:response.status})); return }
 let value:any; try {value=await response.json()} catch {throw new Error('Non-JSON allowance response')}
 if(!response.ok) throw new Error('Allowance query HTTP '+response.status)
 // Only these public financial fields may leave this process; never headers/credentials.
 console.log(JSON.stringify({stage:update?'cache_refresh':'allowance_read',httpStatus:response.status,balance:value.balance,allowances:value.allowances,mode:entry.mode,wallet:entry.deposit_wallet}))
}
try {await check(); if(process.argv.includes('--refresh')) {await check(true);await check()}}
catch {console.log(JSON.stringify({ok:false,error:'Authenticated allowance diagnostic failed; credentials were not printed'}));process.exitCode=1}
