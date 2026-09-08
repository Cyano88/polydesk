// Disposable identity, read-only HTTP acceptance. No real wallet or stored secret.
import assert from 'node:assert/strict'
import { Wallet } from 'ethers'
import { memoryRecallAuthorization } from '../api/receipt-memory-api.js'

const wallet = Wallet.createRandom()
const body = { owner: wallet.address.toLowerCase(), expiresAt: Date.now()+120000, after:'', limit:20 }
const signature = await wallet.signMessage(memoryRecallAuthorization(body, Date.now(), true).message)
const response = await fetch('https://polydesk.trade/api/polymarket-agent-memory/recall-sibyl', {
  method:'POST', redirect:'error', signal:AbortSignal.timeout(25000),
  headers:{'Content-Type':'application/json'}, body:JSON.stringify({...body,signature}),
})
assert.equal(response.status,200)
assert.equal(response.headers.get('cache-control'),'no-store')
const result = await response.json()
assert.equal(result.ok,true)
assert.equal(result.schema,'polydesk-sibyl-memory-recall-v1')
assert.equal(result.source,'SIBYL_VERIFIED_RECEIPTS')
assert.equal(result.historyComplete,false)
assert.deepEqual(result.records,[])
assert.equal(result.nextCursor,null)
assert.equal(result.signingAuthorized,false)
assert.equal(result.orderSubmitted,false)
console.log(JSON.stringify({ok:true,liveAuthenticatedSibylRoute:true,syntheticIdentity:true,
  historyComplete:false,verifiedFillCycle:false,paymentAttempted:false,orderSubmitted:false}))
