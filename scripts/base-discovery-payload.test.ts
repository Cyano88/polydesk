import test from 'node:test'
import Ajv from 'ajv/dist/2020.js'
import assert from 'node:assert/strict'
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server'
import { bazaarResourceServerExtension } from '@x402/extensions/bazaar'
import { withServerDiscovery } from '../api/base-discovery-payload.js'
import { baseSmartTraderDiscoveryExtension } from '../api/base-agentic-market-smart-trader.js'
const resource={url:'https://polydesk.trade/api/x402/base/polymarket-smart-trader',description:'PolyDesk',mimeType:'application/json'}
const requirements={scheme:'exact',network:'eip155:8453',asset:'0x'+'1'.repeat(40),amount:'300000',payTo:'0x'+'2'.repeat(40),maxTimeoutSeconds:600}
const payload:any={x402Version:2,accepted:requirements,payload:{signature:'synthetic-not-a-real-signature',authorization:{value:'300000'}}}
test('real SDK reproduces omitted discovery metadata; wrapper supplies it on verify and settle',async()=>{
 const originalFetch=globalThis.fetch;const sent:any[]=[]
 globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify(String(_url).endsWith('/verify')?{isValid:true,payer:'0x'+'3'.repeat(40)}:{success:true,transaction:'0x'+'4'.repeat(64),network:'eip155:8453'}),{headers:{'Content-Type':'application/json','EXTENSION-RESPONSES':Buffer.from(JSON.stringify({bazaar:{status:'processing'}})).toString('base64')}})}
 try{
 const client=new HTTPFacilitatorClient({url:'https://facilitator.invalid'})
 await client.verify(payload,requirements)
 assert.equal(sent[0].paymentPayload.resource,undefined);assert.equal(sent[0].paymentPayload.extensions,undefined)
 const rs=new x402ResourceServer(client).registerExtension(bazaarResourceServerExtension)
 const metadata=()=>rs.enrichExtensions(baseSmartTraderDiscoveryExtension(),{method:'POST',adapter:{getPath:()=>'/api/x402/base/polymarket-smart-trader'}})
 const wrapped=withServerDiscovery(client,resource,metadata),before=structuredClone(payload)
 await wrapped.verify(payload,requirements);const settled=await wrapped.settle(payload,requirements)
 for(const wire of sent.slice(1)){
 assert.equal(wire.paymentPayload.resource.url,resource.url)
 assert.equal(wire.paymentPayload.extensions.bazaar.info.input.method,'POST')
 assert.equal(wire.paymentPayload.extensions.bazaar.info.input.body.outcome,'Yes')
 assert.deepEqual(wire.paymentPayload.payload,before.payload)
 assert.deepEqual(wire.paymentPayload.accepted,before.accepted)
 assert.deepEqual(wire.paymentRequirements,requirements)
 }
 assert.deepEqual(payload,before);assert.equal((settled.extensionResponses as any).bazaar.status,'processing')
 assert.throws(()=>wrapped.verify({...payload,resource:{url:'https://other.example'}},requirements),/resource/)
 assert.equal(sent.length,3)
 }finally{globalThis.fetch=originalFetch}
})
test('server metadata replaces untrusted Bazaar declaration and preserves other extensions',async()=>{
 let captured:any;const client:any={verify:async(p:any)=>{captured=p;return {isValid:true}},settle:async()=>({}),getSupported:async()=>({})}
 const wrapped=withServerDiscovery(client,resource,()=>({bazaar:{trusted:true}}))
 await wrapped.verify({...payload,extensions:{bazaar:{spoofed:true},other:{preserved:true}}},requirements)
 assert.deepEqual(captured.extensions,{bazaar:{trusted:true},other:{preserved:true}})
})

test('published research example validates and missing outcome is rejected by discovery schema',()=>{
 const server=new x402ResourceServer(new HTTPFacilitatorClient({url:'https://facilitator.invalid'})).registerExtension(bazaarResourceServerExtension)
 const declaration=server.enrichExtensions(baseSmartTraderDiscoveryExtension(),{method:'POST',adapter:{getPath:()=>'/api/x402/base/polymarket-smart-trader'}}).bazaar as any
 const validate=new Ajv({strict:false}).compile(declaration.schema)
 assert.equal(validate(declaration.info),true,JSON.stringify(validate.errors))
 const invalid=structuredClone(declaration.info);delete invalid.input.body.outcome
 assert.equal(validate(invalid),false)
})
