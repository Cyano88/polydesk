import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  MANAGED_AGENT_LISTING_ID,
  MANAGED_AGENT_SERVICE_ID,
  POLYDESK_AGENT_ID,
  type ManagedSubscriptionIdentity,
} from './polydesk-managed-agent-subscription.js'

type JsonRecord = Record<string, unknown>
const execFileAsync = promisify(execFile)

function record(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function epoch(value: unknown, label: string) {
  const seconds = Number(value)
  if (!Number.isInteger(seconds) || seconds <= 0) throw new Error(`${label} is invalid.`)
  return new Date(seconds * 1000).toISOString()
}

export function exactManagedSubscriptions(activeResponse: unknown, providerResponse: unknown): ManagedSubscriptionIdentity[] {
  if (!record(activeResponse) || activeResponse.ok !== true || !Array.isArray(activeResponse.data)) {
    throw new Error('Official active subscription response is invalid.')
  }
  if (!record(providerResponse) || providerResponse.ok !== true || !record(providerResponse.data)
    || !Array.isArray(providerResponse.data.list)) {
    throw new Error('Official provider subscription response is invalid.')
  }
  const active = new Map<string, JsonRecord>()
  for (const item of activeResponse.data) {
    if (!record(item) || Number(item.status) !== 1) continue
    const jobId = text(item.jobId)
    if (jobId) active.set(jobId, item)
  }
  const subscriptions = new Map<string, ManagedSubscriptionIdentity>()
  let intersectedProviderJobs = 0
  for (const value of providerResponse.data.list) {
    if (!record(value) || Number(value.status) !== 1) continue
    const jobId = text(value.jobId ?? value.subId ?? value.id)
    const activeItem = active.get(jobId)
    if (!activeItem) continue
    if (text(value.providerAgentId ?? value.aspAgentId) !== POLYDESK_AGENT_ID) continue
    intersectedProviderJobs += 1
    if (text(value.serviceId) !== MANAGED_AGENT_SERVICE_ID) continue
    const buyerAgentId = text(value.buyerAgentId ?? value.userAgentId)
    if (!/^\d{1,18}$/.test(buyerAgentId)) continue
    const periodStartAt = epoch(value.subStartTime ?? value.trailStartTime, 'subStartTime')
    const periodEndAt = epoch(value.subEndTime ?? activeItem.subEndTime, 'subEndTime')
    subscriptions.set(jobId, {
      jobId,
      providerAgentId: POLYDESK_AGENT_ID,
      serviceListingId: MANAGED_AGENT_LISTING_ID,
      serviceId: MANAGED_AGENT_SERVICE_ID,
      buyerAgentId,
      status: 'active',
      periodStartAt,
      periodEndAt,
    })
  }
  if (active.size > 0 && intersectedProviderJobs === 0) {
    throw new Error('Official subscription directories disagree about the active PolyDesk provider identity.')
  }
  return [...subscriptions.values()]
}

async function runJson(executable: string, args: string[]) {
  const result = await execFileAsync(executable, args, { windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 })
  const parsed: unknown = JSON.parse(result.stdout)
  if (!record(parsed) || parsed.ok !== true) throw new Error('Official OKX command was unsuccessful.')
  return parsed
}

export async function listExactManagedSubscriptions() {
  const executable = process.env.ONCHAINOS_BIN?.trim() || 'onchainos'
  const [active, provider] = await Promise.all([
    runJson(executable, ['agent', 'subscribe-active', '--agent-id', POLYDESK_AGENT_ID]),
    runJson(executable, ['agent', 'my-subscriptions', '--role', 'provider', '--status', 'ACTIVE']),
  ])
  return exactManagedSubscriptions(active, provider)
}
