import assert from 'node:assert/strict'
import test from 'node:test'
import { validateScoutBook } from '../api/x402-polymarket-scout.js'
import { runLpPaidJob, type LpPaidJob } from '../api/lp-scout-paid-job.js'
const now = Date.now()
const book = () => ({ asset_id: '123', market: '0xabc', timestamp: String(now), tick_size: '0.01', bids: [{price:'0.45',size:'100'}], asks:[{price:'0.47',size:'200'}] })
test('book identity, source time, prices and sizes must all validate', () => {
  const valid = validateScoutBook(book(), '123','0xabc',now)
  assert.equal(valid.bookVerified,true); assert.equal(valid.bestBid,0.45)
  for (const patch of [{asset_id:'456'},{market:'0xdef'},{timestamp:String(now-120001)},{timestamp:String(now+5001)},{timestamp:'bad'},{bids:[{price:'0.48',size:'100'}]},{asks:[]},{bids:[{price:'0.45',size:'-5'}]},{bids:[{price:'50',size:'2'}]},{tick_size:'0'}]) {
    const result = validateScoutBook({...book(),...patch},'123','0xabc',now)
    assert.equal(result.bookVerified,false,JSON.stringify(patch)); assert.equal(result.bestBid,undefined)
  }
})
function store() {
  const rows = new Map<string,LpPaidJob>()
  return { rows, mutate: async (key: string, fn: (row:LpPaidJob|undefined)=>LpPaidJob) => {
    const next = fn(structuredClone(rows.get(key))); rows.set(key,structuredClone(next)); return structuredClone(next)
  } }
}
const settlement = { payment:{transaction:'receipt',payer:'buyer'}, headers:{'PAYMENT-RESPONSE':'receipt'} }
const reply = {status:200,headers:settlement.headers,body:{ok:true}}
test('completed job replay returns original receipt without settlement or delivery', async () => {
  const db=store(); let paid=0,work=0
  const input={paymentHeader:'signed-proof',request:{query:{budget:'4'}},settle:async()=>{paid++;return settlement},deliver:async()=>{work++;return reply}}
  assert.deepEqual(await runLpPaidJob(input,db.mutate),reply)
  assert.deepEqual(await runLpPaidJob(input,db.mutate),reply)
  assert.equal(paid,1);assert.equal(work,1)
  await assert.rejects(runLpPaidJob({...input,request:{query:{budget:'40'}}},db.mutate),/LP_PAYMENT_REQUEST_MISMATCH/)
})
test('intent is durable before settlement; receipt is durable before research',async()=>{
  const db=store()
  await runLpPaidJob({paymentHeader:'a',request:{},settle:async()=>{assert.equal([...db.rows.values()][0].state,'SETTLING');return settlement},deliver:async()=>{const row=[...db.rows.values()][0];assert.equal(row.state,'RUNNING');assert.deepEqual(row.settlement,settlement);return reply}},db.mutate)
})
test('uncertain settlement is retained and never automatically charged again',async()=>{
  const db=store();let calls=0
  const input={paymentHeader:'b',request:{},settle:async()=>{calls++;throw Error('connection lost after send')},deliver:async()=>reply}
  await assert.rejects(runLpPaidJob(input,db.mutate))
  await assert.rejects(runLpPaidJob(input,db.mutate),/LP_JOB_REVIEW_OR_IN_PROGRESS/)
  assert.equal(calls,1);assert.equal([...db.rows.values()][0].state,'SETTLING')
})
test('delivery failure preserves settlement and does not repeat paid compute',async()=>{
  const db=store();let paid=0,work=0
  const input={paymentHeader:'c',request:{},settle:async()=>{paid++;return settlement},deliver:async()=>{work++;throw Error('provider failed')}}
  await assert.rejects(runLpPaidJob(input,db.mutate),/LP_PAID_DELIVERY_REVIEW_REQUIRED/)
  await assert.rejects(runLpPaidJob(input,db.mutate),/LP_JOB_REVIEW_OR_IN_PROGRESS/)
  assert.equal(paid,1);assert.equal(work,1);assert.deepEqual([...db.rows.values()][0].settlement,settlement)
})
test('concurrent identical requests cannot settle twice',async()=>{
  const db=store();let paid=0
  const input={paymentHeader:'d',request:{},settle:async()=>{paid++;await new Promise(r=>setTimeout(r,10));return settlement},deliver:async()=>reply}
  const results=await Promise.allSettled([runLpPaidJob(input,db.mutate),runLpPaidJob(input,db.mutate)])
  assert.equal(paid,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
})
test('storage failure prevents settlement',async()=>{
  let paid=0
  await assert.rejects(runLpPaidJob({paymentHeader:'e',request:{},settle:async()=>{paid++;return settlement},deliver:async()=>reply},async()=>{throw Error('db down')}))
  assert.equal(paid,0)
})

test('restart after receipt save resumes delivery without another settlement',async()=>{
  const db=store();let paid=0,work=0
  const input={paymentHeader:'restart',request:{},settle:async()=>{paid++;return settlement},deliver:async()=>{work++;return reply}}
  await assert.rejects(runLpPaidJob(input,async(key,fn)=>db.mutate(key,row=>{
    const next=fn(row);if(next.state==='RUNNING') throw Error('process lost before delivery claim');return next
  })))
  assert.equal([...db.rows.values()][0].state,'PAID')
  assert.deepEqual(await runLpPaidJob(input,db.mutate),reply)
  assert.equal(paid,1);assert.equal(work,1)
})
