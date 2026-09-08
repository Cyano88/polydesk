// Dedicated synthetic localhost database only. Never loads .env or production URLs.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

async function main() {
  assert.ok(['--local-only','--local-sibyl','--reopen'].includes(process.argv[2]))
  process.env.DATABASE_URL = 'postgresql://polydesk_test@127.0.0.1:55490/polydesk_memory_test'
  delete process.env.POSTGRES_URL
  const { mutateDurableJson, readDurableJson, memoryDatabaseQuery: query } = await import('../api/render-durable-store.js')
  const { enqueueReceiptMemory, runMemoryDeliveryOnce } = await import('../api/receipt-memory-outbox.js')
  if (process.argv[2] === '--reopen') {
    const rows = await query('select state from polydesk_receipt_memory_outbox where execution_id=$1',[process.argv[3]])
    assert.equal(rows.rows[0].state,'delivered')
    assert.ok(await readDurableJson(`polymarket-governed-receipt:${process.argv[3]}`))
    console.log('PASS fresh-process durable receipt and memory state')
    return
  }
  const executionId = 'pex_'+randomBytes(12).toString('hex')
  const key = `polymarket-governed-execution:${executionId}`
  const owner = '0x'+'22'.repeat(20)
  const receipt = {receiptVersion:'polydesk-governed-trade-receipt-v1',executionId,status:'VERIFIED_FILLED',
    verifiedAt:'2026-09-08T00:00:00Z',market:{tokenId:'123'},
    execution:{orderId:'0x'+'aa'.repeat(32),transactionHash:'0x'+'bb'.repeat(32),fillSize:5,fillPrice:0.5,fillAmountUsdc:2.5},
    policy:{decision:'APPROVE',researchPolicy:'agent-independent-v1'},
    finality:{chainId:'eip155:137',blockHash:'0x'+'cc'.repeat(32),finalizedBlockHash:'0x'+'dd'.repeat(32)},
    proofs:Object.fromEntries(['polygonReceiptVerified','polygonFinalityVerified','allowedExchangeVerified','orderIdInReceipt',
      'publicTradeMatched','buyerAuthoritySignatureVerified','exactSignedOrderVerified'].map(k=>[k,true]))}
  await assert.rejects(mutateDurableJson(key,()=>({receipt}),async(next,client)=>{
    await enqueueReceiptMemory(client,owner,next.receipt)
    throw Error('synthetic crash before commit')
  }))
  assert.equal(await readDurableJson(key),undefined)
  assert.equal(await readDurableJson(`polymarket-governed-receipt:${executionId}`),undefined)
  assert.equal((await query('select execution_id from polydesk_receipt_memory_outbox where execution_id=$1',[executionId])).rowCount,0)
  console.log('PASS rollback leaves no execution, receipt index or orphan job')
  const complete = () => mutateDurableJson(key,current=>current ?? {receipt,executionId,authoritySigner:owner},async(next:any,client)=>enqueueReceiptMemory(client,owner,next.receipt))
  await Promise.all(Array.from({length:16},complete))
  assert.equal((await query('select execution_id from polydesk_receipt_memory_outbox where execution_id=$1',[executionId])).rowCount,1)
  console.log('PASS 16 concurrent completions commit exactly one memory job')
  await assert.rejects(mutateDurableJson(key,()=>({receipt:{...receipt,execution:{...receipt.execution,fillSize:9}}}),
    async(next,client)=>enqueueReceiptMemory(client,owner,next.receipt)))
  assert.equal((await readDurableJson<any>(key)).receipt.execution.fillSize,5)
  console.log('PASS conflicting replay rolls back without replacing receipt')
  // Only this test run's job can be claimed; leave older synthetic jobs untouched.
  const scopedQuery: typeof query = async(sql,values=[]) => {
    if(sql.startsWith('with candidate')) {
      sql=sql.replace("where (state='pending'", "where execution_id=$2 and ((state='pending'")
        .replace("lease_until<now())", "lease_until<now()))")
      values=[...values,executionId]
    }
    return query(sql,values)
  }
  let delivered=0
  let nativeRoot = ''
  if (process.argv[2] === '--local-sibyl') {
    const created = await promisify(execFile)('wsl.exe',['-d','Ubuntu','--','mktemp','-d','/tmp/polydesk-receipt-memory-test.XXXXXXXX'],{timeout:30000})
    nativeRoot = created.stdout.trim()
    assert.match(nativeRoot,/^\/tmp\/polydesk-receipt-memory-test\.[a-zA-Z0-9]+$/)
  }
  const deliver = async(job: {payload:string;payload_hash:string;owner:string;execution_id:string}) => {
    delivered++
    if (!nativeRoot) return
    const text = await new Promise<string>((resolve,reject)=>{
      const child=spawn('wsl.exe',['-d','Ubuntu','--',
        '/root/polydesk-buyer-candidate.hXrameVt/runtime/bin/python','-I','-B',
        '/mnt/c/Users/USER/Desktop/polydesk-memory-release/scripts/sibyl-receipt-memory.py','--root',nativeRoot],
        {windowsHide:true,stdio:['pipe','pipe','pipe']})
      let output='', size=0
      const timer=setTimeout(()=>{child.kill();reject(Error('synthetic adapter timeout'))},30000)
      child.stdout.on('data',part=>{size+=part.length;if(size>32768){child.kill();reject(Error('output bound'))}else output+=part})
      child.stderr.resume()
      child.stdin.on('error',()=>{})
      child.on('error',error=>{clearTimeout(timer);reject(error)})
      child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('synthetic adapter failed'))})
      child.stdin.end(job.payload)
    })
    const ack=JSON.parse(text)
    assert.equal(ack.state,'SIBYL_CAPTURED_AND_RECALLED')
    assert.equal(ack.owner,job.owner); assert.equal(ack.executionId,job.execution_id)
    assert.equal(ack.payloadHash,job.payload_hash)
  }
  await Promise.all(Array.from({length:8},()=>runMemoryDeliveryOnce(deliver,scopedQuery)))
  assert.equal(delivered,1)
  await complete()
  assert.equal((await query('select state,attempts from polydesk_receipt_memory_outbox where execution_id=$1',[executionId])).rows[0].state,'delivered')
  console.log('PASS 8 concurrent workers deliver once; completion replay preserves acknowledgement')
  await query("update polydesk_receipt_memory_outbox set state='delivering',lease_until=now()-interval '1 second' where execution_id=$1",[executionId])
  assert.equal(await runMemoryDeliveryOnce(async()=>{throw Error('synthetic SDK outage')},scopedQuery),true)
  assert.equal((await query('select state from polydesk_receipt_memory_outbox where execution_id=$1',[executionId])).rows[0].state,'pending')
  assert.ok(await readDurableJson(`polymarket-governed-receipt:${executionId}`))
  await query('update polydesk_receipt_memory_outbox set next_at=now() where execution_id=$1',[executionId])
  await runMemoryDeliveryOnce(deliver,scopedQuery)
  console.log('PASS expired lease recovered; failed memory delivery preserves authoritative receipt')
  const adminPath=fileURLToPath(new URL('./receipt-memory-admin.ts',import.meta.url))
  const admin=(command:string)=>promisify(execFile)(process.execPath,['--import','tsx',adminPath,command,executionId,'--execute'],
    {env:process.env,timeout:60000})
  await admin('enqueue')
  await assert.rejects(admin('retry')) // a delivered job cannot be retried accidentally
  await admin('rebuild')
  assert.equal((await query('select state from polydesk_receipt_memory_outbox where execution_id=$1',[executionId])).rows[0].state,'pending')
  await runMemoryDeliveryOnce(deliver,scopedQuery)
  console.log('PASS operator reindex preserves delivery; explicit rebuild replays only memory')
  const child = await promisify(execFile)(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--reopen',executionId],
    {env:process.env,timeout:60000})
  assert.match(child.stdout,/PASS fresh-process/)
  console.log(child.stdout.trim())
  console.log(nativeRoot
    ? 'ACCEPTANCE PASS: real local PostgreSQL to real pinned Sibyl capture/readback and retry; synthetic receipts only; no wallet, payment or trade'
    : 'ACCEPTANCE PASS: real local PostgreSQL; synthetic memory-delivery boundary; no wallet, payment or trade')
}
main().then(()=>process.exit(0)).catch(error=>{
  console.error(JSON.stringify({ok:false,state:'LOCAL_MEMORY_ACCEPTANCE_FAILED',category:error?.name || 'Error'}))
  process.exit(1)
})
