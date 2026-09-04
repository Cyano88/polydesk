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

function activeRows(value: unknown) {
  if (!record(value) || value.ok !== true || !Array.isArray(value.data)) {
    throw new Error('Official active subscription response is invalid.')
  }
  return value.data.filter((item): item is JsonRecord => record(item) && Number(item.status) === 1)
}

export function exactManagedSubscriptions(activeResponse: unknown, providerResponse: unknown): ManagedSubscriptionIdentity[] {
  const currentActiveRows = activeRows(activeResponse)
  if (!record(providerResponse) || providerResponse.ok !== true || !record(providerResponse.data)
    || !Array.isArray(providerResponse.data.list)) {
    throw new Error('Official provider subscription response is invalid.')
  }
  const active = new Map<string, JsonRecord>()
  for (const item of currentActiveRows) {
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

export function catalogAndStatusManagedSubscriptions(
  activeResponse: unknown,
  serviceResponse: unknown,
  statusOutputs: ReadonlyMap<string, string>,
): ManagedSubscriptionIdentity[] {
  const currentActiveRows = activeRows(activeResponse)
  if (!record(serviceResponse) || serviceResponse.ok !== true || !record(serviceResponse.data)
    || !Array.isArray(serviceResponse.data.list)) {
    throw new Error('Official PolyDesk service catalog response is invalid.')
  }
  const subscriptionServices = serviceResponse.data.list.filter(item => (
    record(item) && Array.isArray(item.subscription) && item.subscription.length > 0
  ))
  if (subscriptionServices.length !== 1) {
    throw new Error('PolyDesk must have exactly one subscription listing for status-based reconciliation.')
  }
  const service = subscriptionServices[0]
  if (!record(service)
    || String(service.id) !== MANAGED_AGENT_LISTING_ID
    || text(service.serviceId) !== MANAGED_AGENT_SERVICE_ID
    || text(service.serviceName) !== 'PolyDesk Trading Membership') {
    throw new Error('The sole PolyDesk subscription listing does not match the managed-agent contract.')
  }
  const result: ManagedSubscriptionIdentity[] = []
  for (const item of currentActiveRows) {
    const jobId = text(item.jobId)
    const output = statusOutputs.get(jobId) ?? ''
    const status = output.match(/^Task status:\s*([^\r\n]+)/mi)?.[1]?.trim().toLowerCase()
    const returnedJobId = output.match(/^\s*jobId:\s*(\S+)/mi)?.[1]?.trim()
    const title = output.match(/^\s*title:\s*(.+)$/mi)?.[1]?.trim() ?? ''
    const buyerAgentId = output.match(/^\s*user:\s*(\d{1,18})\s*$/mi)?.[1]
    const providerAgentId = output.match(/^\s*asp:\s*(\d{1,18})\s*$/mi)?.[1]
    if (status !== 'accepted' || returnedJobId !== jobId || providerAgentId !== POLYDESK_AGENT_ID
      || !buyerAgentId || !title.includes('PolyDesk Trading Membership')) {
      throw new Error(`Official status did not bind active subscription ${jobId} to PolyDesk's managed listing.`)
    }
    const periodEndAt = epoch(item.subEndTime, 'subEndTime')
    const periodStartAt = new Date(Date.parse(periodEndAt) - 31 * 24 * 60 * 60_000).toISOString()
    result.push({
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
  return result
}

async function runRaw(executable: string, args: string[]) {
  const result = await execFileAsync(executable, args, { windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 })
  return result.stdout
}

async function runJson(executable: string, args: string[]) {
  const stdout = await runRaw(executable, args)
  const parsed: unknown = JSON.parse(stdout)
  if (!record(parsed) || parsed.ok !== true) throw new Error('Official OKX command was unsuccessful.')
  return parsed
}

export async function listExactManagedSubscriptions() {
  const executable = process.env.ONCHAINOS_BIN?.trim() || 'onchainos'
  const [active, provider] = await Promise.all([
    runJson(executable, ['agent', 'subscribe-active', '--agent-id', POLYDESK_AGENT_ID]),
    runJson(executable, ['agent', 'my-subscriptions', '--role', 'provider', '--status', 'ACTIVE']),
  ])
  try {
    return exactManagedSubscriptions(active, provider)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('directories disagree')) throw error
  }
  const serviceResponse = await runJson(executable, ['agent', 'service-list', '--agent-id', POLYDESK_AGENT_ID])
  const rows = activeRows(active)
  const statuses = await Promise.all(rows.map(async item => {
    const jobId = text(item.jobId)
    return [jobId, await runRaw(executable, ['agent', 'status', jobId, '--agent-id', POLYDESK_AGENT_ID])] as const
  }))
  return catalogAndStatusManagedSubscriptions(active, serviceResponse, new Map(statuses))
}
