import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { DiagnosticOkxFacilitator } from '../api/okx-facilitator-diagnostics.js'
const config = {apiKey:'test-key',secretKey:'test-secret',passphrase:'test-passphrase'}
test('supported GET preserves SDK signing contract and normalizes successful envelope', async () => {
 const client = new DiagnosticOkxFacilitator(config, (async (url, init) => {
  assert.equal(url,'https://web3.okx.com/api/v6/pay/x402/supported')
  assert.equal(init?.method,'GET'); assert.equal(init?.redirect,'error')
  const h = new Headers(init?.headers)
  assert.equal(h.get('OK-ACCESS-SIGN'),createHmac('sha256',config.secretKey).update(h.get('OK-ACCESS-TIMESTAMP')+'GET/api/v6/pay/x402/supported').digest('base64'))
  return Response.json({code:'0',data:{kinds:[],extensions:[],signers:{}}})
 }) as typeof fetch)
 assert.deepEqual(await client.getSupported(),{kinds:[],extensions:[],signers:{}})
})
test('only numeric provider code survives authentication errors', async () => {
 const client = new DiagnosticOkxFacilitator(config,(async()=>Response.json({code:'50113',msg:'test-secret test-key'},{status:401})) as typeof fetch)
 await assert.rejects(client.getSupported(),{message:'OKX_X402_SUPPORTED_HTTP_401_CODE_50113'})
})
test('arbitrary codes and transport errors cannot leak credentials', async () => {
 const client = new DiagnosticOkxFacilitator(config,(async()=>Response.json({code:'test-secret',msg:'test-key'},{status:401})) as typeof fetch)
 await assert.rejects(client.getSupported(),{message:'OKX_X402_SUPPORTED_HTTP_401_CODE_UNKNOWN'})
 const failed = new DiagnosticOkxFacilitator(config,(async()=>{throw Error('test-secret')}) as typeof fetch)
 await assert.rejects(failed.getSupported(),{message:'OKX_X402_SUPPORTED_TRANSPORT_UNAVAILABLE'})
})
test('provider failure on HTTP 200 fails closed and non-JSON is sanitized', async () => {
 const failed = new DiagnosticOkxFacilitator(config,(async()=>Response.json({code:'50111',msg:'test-secret'})) as typeof fetch)
 await assert.rejects(failed.getSupported(),{message:'OKX_X402_SUPPORTED_HTTP_200_CODE_50111'})
 const html = new DiagnosticOkxFacilitator(config,(async()=>new Response('test-secret',{status:403})) as typeof fetch)
 await assert.rejects(html.getSupported(),{message:'OKX_X402_SUPPORTED_HTTP_403_NON_JSON'})
})
