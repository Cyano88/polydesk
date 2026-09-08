// Operator CLI only; existing database identity, no public write endpoint or .env loading.
import { memoryDatabaseQuery, mutateDurableJson } from '../api/render-durable-store.js'
import { enqueueReceiptMemory } from '../api/receipt-memory-outbox.js'

async function main() {
  const [command, executionId, consent] = process.argv.slice(2)
  if (!['enqueue','retry','rebuild'].includes(command) || !/^pex_[a-f0-9]{24}$/.test(executionId || '')
      || consent !== '--execute' || process.argv.length !== 5) throw new Error('Explicit operator command required')
  if (command === 'enqueue') {
    await mutateDurableJson<Record<string, any>>(`polymarket-governed-execution:${executionId}`, current => {
      if (!current?.receipt || current.executionId !== executionId) throw new Error('Existing verified execution required')
      return current
    }, async (saved, client) => { await enqueueReceiptMemory(client,saved.authoritySigner,saved.receipt) })
  } else {
    const states = command === 'retry' ? ['failed'] : ['failed','delivered']
    const result = await memoryDatabaseQuery(`update polydesk_receipt_memory_outbox
      set state='pending',attempts=0,next_at=now(),lease_token=null,lease_until=null,error_code=null
      where execution_id=$1 and state=any($2::text[]) returning execution_id`,[executionId,states])
    if(result.rowCount !== 1) throw new Error('No eligible existing job; no state changed')
  }
  console.log(JSON.stringify({ok:true,state:'MEMORY_JOB_QUEUED',signingAttempted:false,orderSubmitted:false}))
}
main().then(()=>process.exit(0)).catch(()=>{
  console.error(JSON.stringify({ok:false,state:'OPERATOR_MEMORY_REVIEW_REQUIRED',signingAttempted:false,orderSubmitted:false}))
  process.exit(1)
})
