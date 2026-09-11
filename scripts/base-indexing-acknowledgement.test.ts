import test from 'node:test'
import assert from 'node:assert/strict'
import {baseIndexingAcknowledgement as parse} from '../api/base-indexing-acknowledgement.js'
test('status parsing stores bounded Bazaar metadata only',()=>{
 for(const status of ['success','processing','rejected']){
 const r=parse({bazaar:{status,rejectedReason:'invalid_schema',payload:'secret'},other:{secret:'hidden'}})
 assert.equal(r.status,status);assert.equal(JSON.stringify(r).includes('hidden'),false);assert.equal(JSON.stringify(r).includes('payload'),false)
 }
 assert.equal(parse({bazaar:{status:'rejected',rejectedReason:'invalid_schema'}}).reason,'invalid_schema')
})
test('missing and malformed acknowledgements are unknown and unsafe reasons are withheld',()=>{
 for(const value of [undefined,null,'raw',[],{}, {bazaar:null},{bazaar:[]},{bazaar:{status:'accepted'}},{bazaar:{}}])assert.equal(parse(value).status,'unknown')
 for(const reason of ['Bearer sensitive-token','x'.repeat(1000),'0x'+'a'.repeat(64),'signature:secret','arbitrary prose with data']){
 const r=parse({bazaar:{status:'rejected',rejectedReason:reason}});assert.equal(r.status,'rejected');assert.equal(r.reason,'rejection_reason_absent_or_withheld')
 }
})
