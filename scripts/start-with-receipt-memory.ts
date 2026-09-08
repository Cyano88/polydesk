// Operator startup only. Never invoked by an agent request. No wallet or trade.
import { mkdir, lstat, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { deliverToSibyl } from '../api/receipt-memory-worker.js'

const enabled = process.env.SIBYL_MEMORY_WORKER_ENABLED === 'true'
let stage = 'mount'
process.env.SIBYL_MEMORY_WORKER_ENABLED = 'false'
async function privateDirectory(path: string) {
  await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
  const meta = await lstat(path)
  if (!meta.isDirectory() || meta.isSymbolicLink() || meta.mode & 0o077 || meta.uid !== process.getuid?.()) {
    throw new Error('Unsafe projection directory')
  }
}
async function prepare() {
  // A directory in an ephemeral filesystem is not proof of a persistent mount.
  const mounts = await readFile('/proc/self/mountinfo', 'utf8')
  if (!mounts.split('\n').some(line => line.split(' ')[4] === '/var/sibyl')) throw new Error('Persistent disk absent')
  stage = 'directories'
  await privateDirectory('/var/sibyl/receipt-memory')
  await privateDirectory('/var/sibyl/receipt-memory-canary')
  process.env.SIBYL_MEMORY_PYTHON = resolve('.sibyl-runtime/bin/python')
  process.env.SIBYL_MEMORY_BRIDGE = resolve('scripts/sibyl-receipt-memory.py')
  process.env.SIBYL_MEMORY_BRIDGE_SHA256 = '58ae37be1da74f6d0dc9d38d264612232664677656f9c3c0719447fb2d4dec18'
  process.env.SIBYL_MEMORY_ROOT = '/var/sibyl/receipt-memory-canary'
  const scope = createHash('sha256').update('polydesk-buyer-v1:0x'+'22'.repeat(20)).digest('hex')
  const previous = await lstat('/var/sibyl/receipt-memory-canary/'+scope+'/memory.db')
    .catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const payload = JSON.stringify({schema:'polydesk-receipt-memory-v1',owner:'0x'+'22'.repeat(20),
    executionId:'pex_'+'aa'.repeat(12),verifiedAt:'2026-09-08T00:00:00Z',tokenId:'123',
    orderId:'0x'+'aa'.repeat(32),transactionHash:'0x'+'bb'.repeat(32),fillSize:5,fillPrice:0.5,
    fillAmountUsdc:2.5,chainId:'eip155:137',blockHash:'0x'+'cc'.repeat(32),
    finalizedBlockHash:'0x'+'dd'.repeat(32),researchPolicy:'agent-independent-v1'})
  const job = {owner:'0x'+'22'.repeat(20),execution_id:'pex_'+'aa'.repeat(12),payload,
    payload_hash:createHash('sha256').update(payload).digest('hex'),lease_token:'startup-canary',attempts:1}
  // Repeated capture uses a fresh subprocess/SDK connection and must be idempotent.
  stage = 'capture'
  await deliverToSibyl(job)
  stage = 'repeat-readback'
  await deliverToSibyl(job)
  process.env.SIBYL_MEMORY_ROOT = '/var/sibyl/receipt-memory'
  process.env.SIBYL_MEMORY_WORKER_ENABLED = 'true'
  console.log('[receipt-memory-startup]', JSON.stringify({state:'PERSISTENT_CAPTURE_READBACK_VERIFIED',
    workerEnabled:true,priorCanaryPresent:Boolean(previous),syntheticOnly:true,signingAttempted:false,orderSubmitted:false}))
}
if (enabled) {
  try { await prepare() }
  catch (error) {
    const known = ['Persistent disk absent','Unsafe projection directory','Memory runtime not configured',
      'Unsafe memory bridge','Memory bridge pin mismatch','Memory payload mismatch','Memory timeout',
      'Memory output bound','Memory capture failed','Memory acknowledgement mismatch']
    const reason = error instanceof Error && known.includes(error.message) ? error.message : 'RUNTIME_CHECK_FAILED'
    const mount = await lstat('/var/sibyl').catch(() => null)
    console.error('[receipt-memory-startup]', JSON.stringify({state:'OPERATOR_CONFIGURATION_REQUIRED',stage,reason,
      mountMode:mount ? (mount.mode & 0o7777).toString(8) : null,mountOwned:mount?.uid === process.getuid?.(),
      workerEnabled:false,signingAttempted:false,orderSubmitted:false}))
  }
}
await import('../server.js')
