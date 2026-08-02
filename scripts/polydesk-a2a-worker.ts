import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import {
  runA2aTradingWorker,
  validateA2aWorkerRequest,
  type A2aWorkerDependencies,
  type A2aWorkerRequest,
  type A2aWorkerState,
} from '../api/polydesk-a2a-worker.js'

type StateFile = {
  schema: 'polydesk-a2a-worker-store-v1'
  jobs: Record<string, A2aWorkerState>
}

const args = process.argv.slice(2)
const requestIndex = args.indexOf('--request')
const requestPath = requestIndex >= 0 ? args[requestIndex + 1] : ''
const execute = args.includes('--execute')
const dryRun = args.includes('--dry-run') || !execute
const baseUrl = String(process.env.POLYDESK_A2A_URL || 'https://polydesk-i96m.onrender.com/api/a2a/polydesk-trading-agent').replace(/\/+$/, '')
const receiptOrigin = String(process.env.POLYDESK_A2A_RECEIPT_ORIGIN || 'https://polydesk.trade/api/a2a/polydesk-trading-agent').replace(/\/+$/, '')
const statePath = resolve(process.env.POLYDESK_A2A_WORKER_STATE || './data/polydesk-a2a-worker.json')
const operatorKey = String(process.env.POLYDESK_A2A_OPERATOR_KEY || '').trim()
const onchainosBin = String(process.env.ONCHAINOS_BIN || (process.platform === 'win32' ? 'onchainos.exe' : 'onchainos'))
const a2aBin = String(process.env.OKX_A2A_BIN || (process.platform === 'win32' ? 'okx-a2a.exe' : 'okx-a2a'))

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function parseJson(text: string, label: string) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} did not return valid JSON.`)
  }
}

async function run(command: string, commandArgs: string[]) {
  return await new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', code => {
      if (code !== 0) return reject(new Error((stdout || stderr || `${command} exited ${code}`).trim()))
      resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

async function readStore(): Promise<StateFile> {
  if (!existsSync(statePath)) return { schema: 'polydesk-a2a-worker-store-v1', jobs: {} }
  const parsed = parseJson(await readFile(statePath, 'utf8'), 'Worker state file') as StateFile
  if (parsed.schema !== 'polydesk-a2a-worker-store-v1' || !parsed.jobs || typeof parsed.jobs !== 'object') {
    throw new Error('Worker state file has an unsupported schema.')
  }
  return parsed
}

async function saveStore(store: StateFile) {
  await mkdir(dirname(statePath), { recursive: true })
  const temporary = `${statePath}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, statePath)
}

async function acquireLease() {
  await mkdir(dirname(statePath), { recursive: true })
  // One store-wide lease prevents two different jobs from racing the shared
  // JSON state file. This deliberately serializes the first production pilot.
  const lockPath = `${statePath}.lock`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600)
      closeSync(fd)
      await writeFile(lockPath, JSON.stringify({ pid: process.pid, expiresAt: Date.now() + 120_000 }), { mode: 0o600 })
      return async () => { await unlink(lockPath).catch(() => undefined) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const details = await stat(lockPath).catch(() => null)
      if (details && Date.now() - details.mtimeMs > 120_000) {
        await unlink(lockPath).catch(() => undefined)
        continue
      }
      throw new Error('WORKER_STORE_LEASED')
    }
  }
  throw new Error('WORKER_STORE_LEASED')
}

async function postOperator(body: Record<string, unknown>) {
  if (!operatorKey) throw new Error('POLYDESK_A2A_OPERATOR_KEY is required in execute mode.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${operatorKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    const payload = parseJson(text, 'PolyDesk operator endpoint') as Record<string, unknown>
    if (!response.ok || payload.ok !== true) throw new Error(String(payload.error || `PolyDesk returned HTTP ${response.status}.`))
    return payload
  } finally {
    clearTimeout(timer)
  }
}

function dependencies(): A2aWorkerDependencies {
  return {
    now: () => Date.now(),
    loadState: async jobId => (await readStore()).jobs[jobId],
    saveState: async state => {
      const store = await readStore()
      store.jobs[state.jobId] = state
      await saveStore(store)
    },
    grantCheck: async request => {
      const result = await run(onchainosBin, [
        'agent', 'autotrade-grant-check', '--job-id', request.jobId,
        '--venue', 'polymarket', '--action', 'buy', '--amount', request.maxSpendUsdc, '--format', 'json',
      ])
      const payload = parseJson(result.stdout, 'Autotrade grant check') as { ok?: boolean; reason?: string }
      return { ok: payload.ok === true, reason: payload.reason }
    },
    prepare: async (request, grantCheck) => {
      const payload = await postOperator({
        action: 'PREPARE_SIGNAL',
        jobId: request.jobId,
        taskStatus: request.taskStatus,
        watchedWallet: request.watchedWallet,
        ownerAddress: request.ownerAddress,
        selectionMode: request.selectionMode,
        transactionHash: request.transactionHash,
        tokenId: request.tokenId,
        conditionId: request.conditionId,
        maxSpendUsdc: request.maxSpendUsdc,
        maximumPrice: request.maximumPrice,
        expiresAt: request.expiresAt,
        maxSignalAgeSeconds: request.maxSignalAgeSeconds,
        selectionPolicy: request.selectionPolicy,
        grantCheck,
      })
      return payload as any
    },
    deliver: async (request, prepared) => {
      const receiptUrl = `${receiptOrigin}/receipt/${prepared.missionId}`
      const deliverable = JSON.stringify({
        schema: 'polydesk-a2a-trade-delivery-v1',
        missionId: prepared.missionId,
        deliveryId: prepared.autoTrade.deliveryId,
        action: 'BUY',
        receiptUrl,
        autoTrade: prepared.autoTrade,
      })
      const result = await run(onchainosBin, [
        'agent', 'deliver', request.jobId, '--agent-id', '5427',
        '--message', 'Bounded Polymarket BUY prepared',
        '--deliverable-text', deliverable,
        '--autotrade', JSON.stringify(prepared.autoTrade),
      ])
      // Exit code is the delivery success contract. Older CLI builds do not
      // consistently emit JSON, so never turn a successful delivery into an
      // uncertain retry merely because its display format changed.
      let transactionHash: string | undefined
      try {
        const payload = JSON.parse(result.stdout) as Record<string, unknown>
        const candidate = String(payload.txHash || payload.transactionHash || '')
        if (/^0x[a-fA-F0-9]{64}$/.test(candidate)) transactionHash = candidate
      } catch {
        transactionHash = result.stdout.match(/0x[a-fA-F0-9]{64}/)?.[0]
      }
      return { transactionHash }
    },
    notifyBuyer: async (request, message) => {
      await run(a2aBin, [
        'xmtp-send', '--job-id', request.jobId, '--to-agent-id', request.buyerAgentId,
        '--message', JSON.stringify(message),
      ])
    },
    snapshot: async missionId => await postOperator({ action: 'PNL_SNAPSHOT', missionId }) as any,
    receiptUrl: missionId => `${receiptOrigin}/receipt/${missionId}`,
  }
}

if (!requestPath) fail('Usage: npm run a2a:worker -- --request <request.json> [--dry-run|--execute]')

const raw = parseJson(await readFile(resolve(requestPath), 'utf8'), 'Worker request file')
const request = validateA2aWorkerRequest(raw)

if (dryRun) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    dryRun: true,
    request: {
      agentId: request.agentId,
      serviceId: request.serviceId,
      jobId: request.jobId,
      buyerAgentId: request.buyerAgentId,
      selectionMode: request.selectionMode,
      maxSpendUsdc: request.maxSpendUsdc,
      maximumPrice: request.maximumPrice,
      expiresAt: request.expiresAt,
    },
    plan: [
      'Verify the exact OKX Polymarket BUY grant.',
      'Prepare or refresh the immutable PolyDesk mission.',
      'Notify the buyer once if funding or collateral approval is required.',
      'Otherwise persist delivery_started before submitting one bounded autotrade signal.',
      'On later replays, publish public PnL evidence without delivering the trade twice.',
    ],
  }, null, 2)}\n`)
  process.exit(0)
}

const release = await acquireLease()
try {
  const result = await runA2aTradingWorker(request, dependencies())
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 2
} finally {
  await release()
}
