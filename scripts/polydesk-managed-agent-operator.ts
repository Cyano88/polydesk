import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { listExactManagedSubscriptions } from '../api/okx-managed-subscription-directory.js'
import {
  MANAGED_AGENT_SCHEMA,
  validateManagedSubscriptionIdentity,
} from '../api/polydesk-managed-agent-subscription.js'

type JsonRecord = Record<string, unknown>

function record(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function post(body: unknown) {
  const url = process.env.POLYDESK_MANAGED_AGENT_URL?.trim()
    || 'https://polydesk.trade/api/a2a/polydesk-managed-agent'
  const operatorKey = process.env.POLYDESK_A2A_OPERATOR_KEY?.trim()
  if (!operatorKey) throw new Error('POLYDESK_A2A_OPERATOR_KEY is required.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-PolyDesk-Operator-Key': operatorKey },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`Managed-agent endpoint returned HTTP ${response.status}: ${JSON.stringify(result)}`)
    return result
  } finally {
    clearTimeout(timer)
  }
}

export async function reconcileManagedSubscriptions() {
  const subscriptions = await listExactManagedSubscriptions()
  return post({ schema: MANAGED_AGENT_SCHEMA, action: 'reconcile_active', complete: true, subscriptions })
}

async function submitRequest(path: string) {
  const body: unknown = JSON.parse(await readFile(resolve(path), 'utf8'))
  if (!record(body) || body.schema !== MANAGED_AGENT_SCHEMA) throw new Error('Managed-agent request is invalid.')
  const action = String(body.action ?? '').toLowerCase()
  if (['enroll', 'update_preferences', 'resume'].includes(action)) {
    const requested = validateManagedSubscriptionIdentity(body.subscription)
    const active = await listExactManagedSubscriptions()
    const authoritative = active.find(item => item.jobId === requested.jobId && item.buyerAgentId === requested.buyerAgentId)
    if (!authoritative) throw new Error('The exact managed-agent subscription is not active in both official OKX directories.')
    body.subscription = { ...authoritative, periodStartAt: requested.periodStartAt }
  }
  return post(body)
}

async function main() {
  const requestIndex = process.argv.indexOf('--request')
  const once = process.argv.includes('--once')
  if (requestIndex >= 0) {
    const path = process.argv[requestIndex + 1]
    if (!path) throw new Error('--request requires a JSON path.')
    console.log(JSON.stringify(await submitRequest(path)))
    return
  }
  if (once) {
    console.log(JSON.stringify(await reconcileManagedSubscriptions()))
    return
  }
  const interval = Math.max(60_000, Number(process.env.POLYDESK_MANAGED_RECONCILE_MS ?? 300_000))
  const run = async () => {
    try { console.log(JSON.stringify(await reconcileManagedSubscriptions())) }
    catch (error) { console.error(error instanceof Error ? error.message : 'Managed subscription reconciliation failed.') }
  }
  await run()
  setInterval(() => void run(), interval)
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Managed-agent operator failed.')
    process.exitCode = 1
  })
}
