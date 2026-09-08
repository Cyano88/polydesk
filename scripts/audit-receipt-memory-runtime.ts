// Operator deployment verification. No receipt enumeration, secrets, payment or trade.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { memoryDatabaseQuery } from '../api/render-durable-store.js'

async function main() {
  assert.deepEqual(process.argv.slice(2), ['--schema-only'])
  const result = await memoryDatabaseQuery("select to_regclass('polydesk_receipt_memory_outbox') is not null as ready")
  assert.equal(result.rows[0].ready,true)
  const python = spawnSync('python3',['--version'],{encoding:'utf8',timeout:5000,windowsHide:true})
  const version = python.status === 0 && /^Python [0-9.]+\s*$/.test(python.stdout) ? python.stdout.trim() : null
  console.log(JSON.stringify({ok:true,databaseReachable:true,memorySchemaReady:true,python:version,
    workerEnabled:process.env.SIBYL_MEMORY_WORKER_ENABLED === 'true',receiptRowsRead:false,
    signingAttempted:false,orderSubmitted:false}))
}
main().then(()=>process.exit(0)).catch(()=>{
  console.error(JSON.stringify({ok:false,state:'MEMORY_SCHEMA_AUDIT_FAILED',signingAttempted:false,orderSubmitted:false}))
  process.exit(1)
})
