import { createHash } from 'node:crypto'
import { getAddress, isAddress } from 'viem'
import type { AutoTradeSignal } from './polydesk-a2a-trading-agent.js'

type JsonRecord = Record<string, unknown>
const SUPPORTED_A2A_SERVICE_IDS = new Set(['38484'] as const)
type SupportedA2aServiceId = '38484'

export type A2aWorkerRequest = {
  schema: 'polydesk-a2a-worker-request-v1'
  agentId: '5427'
  serviceId: SupportedA2aServiceId
  jobId: string
  taskStatus: 'job_accepted'
  buyerAgentId: string
  watchedWallet: string
  ownerAddress: string
  selectionMode: 'TRADE' | 'POSITION' | 'AUTO_BEST_FIT'
  transactionHash?: string
  tokenId?: string
  conditionId?: string
  maxSpendUsdc: string
  maximumPrice: number
  expiresAt: string
  maxSignalAgeSeconds?: number
  selectionPolicy?: JsonRecord
}

export type A2aWorkerState = {
  schema: 'polydesk-a2a-worker-state-v1'
  jobId: string
  inputHash: string
  status: 'requires_action' | 'delivery_started' | 'delivered' | 'pnl_pending' | 'pnl_reported'
  updatedAt: string
  missionId?: string
  deliveryId?: string
  actionHash?: string
  transactionHash?: string
  receiptProofHash?: string
}

type PrepareResult = {
  missionId: string
  state: 'requires_action' | 'signal_ready'
  nextAction: unknown
  autoTrade?: AutoTradeSignal
}

type SnapshotResult = {
  state: 'open' | 'closed' | 'not_found'
  proofHash: string
}

export type A2aWorkerDependencies = {
  now: () => number
  loadState: (jobId: string) => Promise<A2aWorkerState | undefined>
  saveState: (state: A2aWorkerState) => Promise<void>
  grantCheck: (request: A2aWorkerRequest) => Promise<{ ok: boolean; reason?: string }>
  prepare: (request: A2aWorkerRequest, grantCheck: { ok: true; venue: 'polymarket'; action: 'buy'; amountUsdc: string }) => Promise<PrepareResult>
  deliver: (request: A2aWorkerRequest, prepared: PrepareResult & { autoTrade: AutoTradeSignal }) => Promise<{ transactionHash?: string }>
  notifyBuyer: (request: A2aWorkerRequest, message: JsonRecord) => Promise<void>
  snapshot: (missionId: string) => Promise<SnapshotResult>
  receiptUrl: (missionId: string) => string
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')
}

function decimal(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d+(?:\.\d{1,6})?$/.test(text) && Number(text) > 0 ? text : null
}

function validJobId(value: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(value) || /^[A-Za-z0-9_-]{6,64}$/.test(value)
}

function hasSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecretField)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, item]) => (
    /(private.?key|seed|mnemonic|clob.?secret|api.?secret|password|authorization)/i.test(key)
    || hasSecretField(item)
  ))
}

export function validateA2aWorkerRequest(value: unknown): A2aWorkerRequest {
  if (!isRecord(value)) throw new Error('Worker request must be a JSON object.')
  if (hasSecretField(value)) throw new Error('Worker request contains forbidden secret material.')
  const allowed = new Set([
    'schema', 'agentId', 'serviceId', 'jobId', 'taskStatus', 'buyerAgentId', 'watchedWallet',
    'ownerAddress', 'selectionMode', 'transactionHash', 'tokenId', 'conditionId', 'maxSpendUsdc',
    'maximumPrice', 'expiresAt', 'maxSignalAgeSeconds', 'selectionPolicy',
  ])
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown) throw new Error(`Unsupported worker field: ${unknown}.`)
  if (value.schema !== 'polydesk-a2a-worker-request-v1') throw new Error('Worker request schema is unsupported.')
  if (String(value.agentId) !== '5427') throw new Error('Worker is restricted to PolyDesk Agent #5427.')
  const serviceId = String(value.serviceId)
  if (!SUPPORTED_A2A_SERVICE_IDS.has(serviceId as SupportedA2aServiceId)) {
    throw new Error('The bounded trade worker is restricted to PolyDesk A2A service #38484.')
  }
  const jobId = String(value.jobId ?? '').trim()
  if (!validJobId(jobId)) throw new Error('jobId is invalid.')
  if (value.taskStatus !== 'job_accepted') throw new Error('Worker executes only job_accepted tasks.')
  const buyerAgentId = String(value.buyerAgentId ?? '').trim()
  if (!/^\d{1,18}$/.test(buyerAgentId)) throw new Error('buyerAgentId is invalid.')
  const watchedWallet = String(value.watchedWallet ?? '').trim()
  const ownerAddress = String(value.ownerAddress ?? '').trim()
  if (!isAddress(watchedWallet)) throw new Error('watchedWallet must be a public EVM address.')
  if (!isAddress(ownerAddress)) throw new Error('ownerAddress must be a public EVM address.')
  const selectionMode = String(value.selectionMode ?? '').toUpperCase()
  if (!['TRADE', 'POSITION', 'AUTO_BEST_FIT'].includes(selectionMode)) throw new Error('selectionMode is invalid.')
  const maxSpendUsdc = decimal(value.maxSpendUsdc)
  if (!maxSpendUsdc) throw new Error('maxSpendUsdc must be positive with at most 6 decimals.')
  const maximumPrice = Number(value.maximumPrice)
  if (!Number.isFinite(maximumPrice) || maximumPrice <= 0 || maximumPrice > 1) throw new Error('maximumPrice must be greater than 0 and at most 1.')
  const expiresAtMs = Date.parse(String(value.expiresAt ?? ''))
  if (!Number.isFinite(expiresAtMs)) throw new Error('expiresAt must be a valid timestamp.')
  if (selectionMode === 'TRADE' && !/^0x[a-fA-F0-9]{64}$/.test(String(value.transactionHash ?? ''))) {
    throw new Error('TRADE selection requires a full public transactionHash.')
  }
  return {
    ...value,
    schema: 'polydesk-a2a-worker-request-v1',
    agentId: '5427',
    serviceId: serviceId as SupportedA2aServiceId,
    jobId,
    taskStatus: 'job_accepted',
    buyerAgentId,
    watchedWallet: getAddress(watchedWallet),
    ownerAddress: getAddress(ownerAddress),
    selectionMode: selectionMode as A2aWorkerRequest['selectionMode'],
    maxSpendUsdc,
    maximumPrice,
    expiresAt: new Date(expiresAtMs).toISOString(),
  } as A2aWorkerRequest
}

export function workerInputHash(request: A2aWorkerRequest) {
  return sha256(request)
}

function stateAt(request: A2aWorkerRequest, status: A2aWorkerState['status'], now: number, extra: Partial<A2aWorkerState> = {}): A2aWorkerState {
  return {
    ...extra,
    schema: 'polydesk-a2a-worker-state-v1',
    jobId: request.jobId,
    inputHash: workerInputHash(request),
    status,
    updatedAt: new Date(now).toISOString(),
  }
}

export async function runA2aTradingWorker(raw: unknown, dependencies: A2aWorkerDependencies) {
  const request = validateA2aWorkerRequest(raw)
  const inputHash = workerInputHash(request)
  const existing = await dependencies.loadState(request.jobId)
  if (existing && existing.inputHash !== inputHash) throw new Error('WORKER_INPUT_DRIFT')
  if (existing?.status === 'pnl_reported') {
    return { ok: true as const, status: 'pnl_reported' as const, idempotentReplay: true, state: existing }
  }
  if (existing?.status === 'delivery_started') {
    return { ok: false as const, status: 'recovery_required' as const, reason: 'Delivery started previously but no terminal result was stored. Reconcile the task deliverable before retrying.' }
  }
  if (existing && ['delivered', 'pnl_pending'].includes(existing.status)) {
    if (!existing.missionId) throw new Error('WORKER_STATE_MISSING_MISSION')
    const receipt = await dependencies.snapshot(existing.missionId)
    if (receipt.state === 'not_found') {
      const pending = stateAt(request, 'pnl_pending', dependencies.now(), { ...existing, missionId: existing.missionId })
      await dependencies.saveState(pending)
      return { ok: true as const, status: 'pnl_pending' as const, receiptUrl: dependencies.receiptUrl(existing.missionId), state: pending }
    }
    await dependencies.notifyBuyer(request, {
      schema: 'polydesk-a2a-pnl-ready-v1',
      missionId: existing.missionId,
      receiptUrl: dependencies.receiptUrl(existing.missionId),
      proofHash: receipt.proofHash,
      positionState: receipt.state,
    })
    const reported = stateAt(request, 'pnl_reported', dependencies.now(), {
      ...existing,
      missionId: existing.missionId,
      receiptProofHash: receipt.proofHash,
    })
    await dependencies.saveState(reported)
    return { ok: true as const, status: 'pnl_reported' as const, receiptUrl: dependencies.receiptUrl(existing.missionId), state: reported }
  }

  const grant = await dependencies.grantCheck(request)
  if (!grant.ok) return { ok: false as const, status: 'grant_denied' as const, reason: grant.reason || 'The written buyer grant does not authorize this BUY.' }
  const prepared = await dependencies.prepare(request, {
    ok: true,
    venue: 'polymarket',
    action: 'buy',
    amountUsdc: request.maxSpendUsdc,
  })
  if (prepared.state === 'requires_action') {
    const actionHash = sha256(prepared.nextAction)
    if (existing?.status !== 'requires_action' || existing.actionHash !== actionHash) {
      await dependencies.notifyBuyer(request, {
        schema: 'polydesk-a2a-action-required-v1',
        missionId: prepared.missionId,
        actionId: actionHash,
        nextAction: prepared.nextAction,
      })
    }
    const pending = stateAt(request, 'requires_action', dependencies.now(), {
      missionId: prepared.missionId,
      actionHash,
    })
    await dependencies.saveState(pending)
    return { ok: true as const, status: 'requires_action' as const, idempotentReplay: existing?.actionHash === actionHash, state: pending }
  }
  if (!prepared.autoTrade) throw new Error('SIGNAL_READY_WITHOUT_AUTOTRADE')
  const started = stateAt(request, 'delivery_started', dependencies.now(), {
    missionId: prepared.missionId,
    deliveryId: prepared.autoTrade.deliveryId,
  })
  await dependencies.saveState(started)
  const delivery = await dependencies.deliver(request, prepared as PrepareResult & { autoTrade: AutoTradeSignal })
  const delivered = stateAt(request, 'delivered', dependencies.now(), {
    missionId: prepared.missionId,
    deliveryId: prepared.autoTrade.deliveryId,
    transactionHash: delivery.transactionHash,
  })
  await dependencies.saveState(delivered)
  return {
    ok: true as const,
    status: 'delivered' as const,
    missionId: prepared.missionId,
    receiptUrl: dependencies.receiptUrl(prepared.missionId),
    state: delivered,
  }
}
