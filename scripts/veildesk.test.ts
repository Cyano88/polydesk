import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEnvelope, veildeskManifest } from '../api/veildesk.js'
import { reply } from './veildesk-mcp.js'
import express from 'express'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { veildeskDiscovery, veildeskValidate } from '../api/veildesk.js'

test('preview never advertises research or payment readiness', () => {
  assert.equal(veildeskManifest.scope, 'polydesk_public_discovery_and_validation')
  assert.equal(veildeskManifest.paidResearchPilot.publicPaidEndpoint, false)
  assert.equal(veildeskManifest.paidResearchPilot.executionAuthorized, false)
  assert.equal(veildeskManifest.marketplace.listed, false)
  assert.ok(veildeskManifest.unavailable.includes('zcash_settlement'))
  assert.ok(veildeskManifest.unavailable.includes('research_submission'))
  assert.equal(veildeskManifest.localTestnet.shieldedPaymentTestCompleted, false)
  assert.equal(veildeskManifest.localTestnet.hostedSettlementAvailable, false)
  assert.equal(veildeskManifest.localTestnet.executionAuthorized, false)
})
test('validation rejects plaintext, extra fields and noncanonical binary data', () => {
  const e = { version: 1, id: '00000000-0000-4000-8000-000000000001', direction: 'request', ephemeralPublicKey: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64'), salt: Buffer.alloc(32).toString('base64'), iv: Buffer.alloc(12).toString('base64'), ciphertext: Buffer.alloc(4112).toString('base64') }
  assert.equal(validateEnvelope(e), true)
  for (const bad of [{...e, brief: 'secret'}, {...e, salt: e.salt + '!'}, {...e, version: 2}, {...e, ciphertext: 'text'}, null]) assert.equal(validateEnvelope(bad), false)
})
test('MCP discovery works without accepting research or payment tools', () => {
  const call = (method: string, params = {}) => reply({jsonrpc:'2.0',id:1,method,params}) as any
  assert.equal(call('initialize').result.serverInfo.name,'veildesk-by-polydesk')
  assert.equal(call('tools/list').result.tools.length,1)
  assert.equal(JSON.parse(call('tools/call',{name:'veildesk_capabilities'}).result.content[0].text).status,'preview')
  assert.equal(call('tools/call',{name:'pay'}).error.code,-32602)
  assert.equal(reply({jsonrpc:'2.0',method:'notifications/initialized'}),undefined)
})

test('HTTP discovery and invalid envelope responses expose no submitted secrets', async () => {
  const app = express()
  app.use(express.json({limit:'16kb'}))
  app.get('/api/veildesk',veildeskDiscovery)
  app.post('/api/veildesk/validate',veildeskValidate)
  const server = app.listen(0,'127.0.0.1')
  await once(server,'listening')
  try {
    const address = server.address() as {port:number}
    const root = `http://127.0.0.1:${address.port}`
    const discovery = await fetch(root+'/api/veildesk')
    assert.equal((await discovery.json()).schema,'veildesk.discovery.v1')
    const invalid = await fetch(root+'/api/veildesk/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brief:'private_strategy_do_not_echo'})})
    assert.equal(invalid.status,400)
    assert.equal((await invalid.text()).includes('private_strategy_do_not_echo'),false)
  } finally { server.closeAllConnections(); await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())) }
})

test('MCP subprocess emits only valid JSON-RPC messages', async () => {
  const child = spawn(process.execPath,['--import','tsx','scripts/veildesk-mcp.ts'],{stdio:['pipe','pipe','pipe']})
  let output = '', errors = ''
  child.stdout.on('data', chunk=>output+=chunk)
  child.stderr.on('data', chunk=>errors+=chunk)
  child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}})+'\n'+JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'veildesk_capabilities',arguments:{}}})+'\n')
  const [code] = await once(child,'close')
  assert.equal(code,0,errors)
  const messages = output.trim().split('\n').map(line=>JSON.parse(line))
  assert.equal(messages.length,2)
  assert.equal(messages[0].result.serverInfo.name,'veildesk-by-polydesk')
  assert.equal(JSON.parse(messages[1].result.content[0].text).marketplace.listed,false)
})
