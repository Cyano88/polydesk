import test from 'node:test'
import assert from 'node:assert/strict'
import {createPolydeskResearchService} from '../api/polydesk-research-service.js'
import {createVeilDeskResearchEngine} from '../api/veildesk-research-engine.js'

test('ordinary PolyDesk research is independent of missing or invalid 0G configuration',async()=>{
  const previous=process.env.POLYDESK_0G_API_KEY
  process.env.POLYDESK_0G_API_KEY='invalid-not-an-inference-key'
  try{
    const research=createPolydeskResearchService()
    // Invalid input is rejected by the existing engine without any external calls.
    const result=await research({marketId:'fixture',side:'BUY'})
    assert.equal(result.ok,false)
    assert.equal(result.status,400)
  }finally{
    if(previous===undefined)delete process.env.POLYDESK_0G_API_KEY
    else process.env.POLYDESK_0G_API_KEY=previous
  }
})

test('VeilDesk provider construction does not require compute attestation',()=>{

  assert.doesNotThrow(()=>createVeilDeskResearchEngine())
})