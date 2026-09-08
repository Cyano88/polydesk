import { createHash } from 'node:crypto'
import { readFile, lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { spawn } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { type MemoryJob, runMemoryDeliveryOnce } from './receipt-memory-outbox.js'

// Memory-only subprocess: no wallet executable, signing inputs or credentials.
async function runSibyl(payload: string, recall = false) {
  const python = process.env.SIBYL_MEMORY_PYTHON || ''
  const bridge = process.env.SIBYL_MEMORY_BRIDGE || ''
  const root = process.env.SIBYL_MEMORY_ROOT || ''
  const expectedHash = process.env.SIBYL_MEMORY_BRIDGE_SHA256 || ''
  if (![python, bridge, root].every(isAbsolute) || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Memory runtime not configured')
  const meta = await lstat(bridge)
  if (!meta.isFile() || meta.isSymbolicLink() || meta.mode & 0o022) throw new Error('Unsafe memory bridge')
  const bytes = await readFile(bridge)
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('Memory bridge pin mismatch')
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, ['-I', '-B', bridge, '--root', root, ...(recall ? ['--recall'] : [])], {
      env: { PATH: '', LANG: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Memory timeout')) }, 20000)
    let stdout = '', size = 0
    const read = (data: Buffer, keep: boolean) => {
      size += data.length
      if (size > (recall ? 262144 : 32768)) { child.kill('SIGKILL'); reject(new Error('Memory output bound')) }
      else if (keep) stdout += data.toString('utf8')
    }
    child.stdout.on('data', data => read(data, true))
    child.stderr.on('data', data => read(data, false))
    child.stdin.on('error', () => { /* exit/error handles closed input */ })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error('Memory capture failed')) })
    child.stdin.end(payload)
  })
  return JSON.parse(output)
}

export async function deliverToSibyl(job: MemoryJob) {
  if (createHash('sha256').update(job.payload).digest('hex') !== job.payload_hash) throw new Error('Memory payload mismatch')
  const result = await runSibyl(job.payload)
  if (result.ok !== true || result.state !== 'SIBYL_CAPTURED_AND_RECALLED'
      || result.owner !== job.owner || result.executionId !== job.execution_id
      || result.payloadHash !== job.payload_hash) throw new Error('Memory acknowledgement mismatch')
}

type RecallRow = { execution_id: string; payload: string; payload_hash: string }
let activeRecalls = 0
export async function recallFromSibyl(owner: string, rows: RecallRow[]) {
  if (process.env.SIBYL_MEMORY_WORKER_ENABLED !== 'true' || activeRecalls >= 2
      || !/^0x[a-f0-9]{40}$/.test(owner) || rows.length > 100) throw new Error('Memory unavailable')
  activeRecalls++
  try {
    const result = await runSibyl(JSON.stringify({ owner, records: rows.map(row => ({
      executionId: row.execution_id, payloadHash: row.payload_hash,
    })) }), true)
    if (result.ok !== true || result.state !== 'SIBYL_RECALLED' || result.owner !== owner
        || !Array.isArray(result.records) || result.records.length !== rows.length) throw new Error('Memory recall mismatch')
    return rows.map((row, i) => {
      const record = result.records[i]
      const expected = JSON.parse(row.payload)
      if (expected.owner !== owner || expected.executionId !== row.execution_id
          || createHash('sha256').update(row.payload).digest('hex') !== row.payload_hash
          || record?.payloadHash !== row.payload_hash
          || !isDeepStrictEqual(record?.receipt, expected)) throw new Error('Memory recall mismatch')
      return record.receipt
    })
  } finally { activeRecalls-- }
}

export function startReceiptMemoryWorker() {
  if (process.env.SIBYL_MEMORY_WORKER_ENABLED !== 'true') return
  if (![process.env.SIBYL_MEMORY_PYTHON,process.env.SIBYL_MEMORY_BRIDGE,process.env.SIBYL_MEMORY_ROOT]
      .every(value => Boolean(value) && isAbsolute(value!)) || !/^[a-f0-9]{64}$/.test(process.env.SIBYL_MEMORY_BRIDGE_SHA256 || '')) {
    console.warn('[receipt-memory]', { state: 'OPERATOR_CONFIGURATION_REQUIRED', signingAttempted: false })
    return
  }
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await runMemoryDeliveryOnce(deliverToSibyl) }
    catch { console.warn('[receipt-memory]', { state: 'UNAVAILABLE', signingAttempted: false }) }
    finally { running = false }
  }
  const timer = setInterval(() => void tick(), 10000)
  timer.unref()
  void tick()
}
