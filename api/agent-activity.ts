import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import { archivePayment } from './og-storage.js'
import { mutateDurableJson, readDurableJson, writeDurableJson } from './render-durable-store.js'

const STORE_PATH = process.env.AGENT_WALLET_PROVISION_STORE ?? './data/agent-wallet-provisioning.json'
const STORE_KEY = (process.env.AGENT_ACTIVITY_STORE_KEY ?? 'polydesk:agent-activity').trim()

export type AgentActivityType =
  | 'wallet_connected'
  | 'funded'
  | 'gateway_activated'
  | 'x402_spent'
  | 'x402_sold'
  | 'scout_returned'
  | 'scout_verification_queued'
  | 'scout_verification_failed'
  | 'governance'

export type AgentActivityProof = {
  kind: 'circle_gateway_x402' | 'okx_agent_payments_x402'
  provider?: string
  service?: string
  buyerAgent?: string
  sellerAgent?: string
  payer?: string
  seller?: string
  amount?: string
  network?: string
  transaction?: string
  serviceUrl?: string
  generatedAt?: string
  receiptHash?: string
  circleOutputHash?: string
  proofHash: string
  legal?: Record<string, unknown>
  governance?: Record<string, unknown>
}

export type AgentActivityOgProof = {
  rootHash: string
  ogTxHash: string
  ogExplorer: string
  archivedAt: number
}

export type AgentActivity = {
  id: string
  agentSlug: string
  type: AgentActivityType
  title: string
  amount?: string
  asset?: string
  direction?: 'in' | 'out' | 'result' | 'system'
  network?: string
  wallet?: string
  txHash?: string
  serviceUrl?: string
  detail?: string
  result?: Record<string, unknown>
  proof?: AgentActivityProof
  og?: AgentActivityOgProof
  createdAt: number
}

type ActivityStore = {
  pending?: Record<string, unknown>
  agents?: Record<string, unknown>
  activity?: Record<string, AgentActivity[]>
}

function normalizeActivityStore(value: Partial<ActivityStore> | undefined): ActivityStore {
  return {
    pending: value?.pending ?? {},
    agents: value?.agents ?? {},
    activity: value?.activity ?? {},
  }
}

export function normalizeActivitySlug(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

async function readActivityStore(): Promise<ActivityStore> {
  try {
    const remote = await readDurableJson<Partial<ActivityStore>>(STORE_KEY)
    if (remote) return normalizeActivityStore(remote)
  } catch (err) {
    console.warn('[agent-activity] durable load failed; using file fallback.', err instanceof Error ? err.message : String(err))
  }

  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as ActivityStore
  } catch {
    return { pending: {}, agents: {}, activity: {} }
  }
}

async function writeActivityStore(data: ActivityStore) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2))
  try {
    await writeDurableJson(STORE_KEY, data)
  } catch (err) {
    console.warn('[agent-activity] durable save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
  }
}

async function writeActivityFile(data: ActivityStore) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2))
}

async function mutateActivityStore(mutate: (store: ActivityStore) => ActivityStore | Promise<ActivityStore>) {
  try {
    const next = await mutateDurableJson<Partial<ActivityStore>>(STORE_KEY, async current => mutate(normalizeActivityStore(current)))
    const normalized = normalizeActivityStore(next)
    await writeActivityFile(normalized).catch(() => undefined)
    return normalized
  } catch (err) {
    console.warn('[agent-activity] durable mutation failed; using file fallback.', err instanceof Error ? err.message : String(err))
  }

  const next = await mutate(await readActivityStore())
  await writeActivityStore(next)
  return next
}

function shouldArchiveActivity(item: AgentActivity) {
  return !!item.txHash || !!item.proof?.proofHash
}

async function patchActivityOgProof(agentSlug: string, activityId: string, og: AgentActivityOgProof) {
  const slug = normalizeActivitySlug(agentSlug)
  await mutateActivityStore(store => {
    const items = store.activity?.[slug]
    if (!items?.length) return store
    const index = items.findIndex(item => item.id === activityId)
    if (index === -1) return store
    items[index] = { ...items[index], og }
    return store
  })
}

async function archiveAgentActivity(item: AgentActivity) {
  if (!shouldArchiveActivity(item) || item.og) return
  const result = await archivePayment({
    eventId: `agent:${item.agentSlug}:${item.id}`,
    txHash: item.txHash || item.proof?.transaction || item.proof?.proofHash || item.id,
    chain: item.network || item.proof?.network || 'agentic',
    payer: item.wallet || item.proof?.payer || item.agentSlug,
    amount: item.amount ? `${item.amount} ${item.asset ?? 'USDC'}` : item.title,
    ts: item.createdAt,
    metadata: {
      type: 'hashpaylink_agent_activity',
      activity: item,
    },
  })
  if (!result) return
  await patchActivityOgProof(item.agentSlug, item.id, {
    rootHash: result.rootHash,
    ogTxHash: result.ogTxHash,
    ogExplorer: `https://chainscan.0g.ai/tx/${result.ogTxHash}`,
    archivedAt: Date.now(),
  })
}

export async function ensureAgentActivityArchived(activityId: string) {
  const found = await findAgentActivity(activityId)
  if (!found || found.og || !shouldArchiveActivity(found)) return found
  await archiveAgentActivity(found)
  return findAgentActivity(activityId)
}

export async function listAgentActivity(agentSlug: string, limit = 12) {
  const slug = normalizeActivitySlug(agentSlug)
  if (!slug) return []
  const store = await readActivityStore()
  return [...(store.activity?.[slug] ?? [])]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

export async function findAgentActivity(activityId: string) {
  const id = String(activityId ?? '').trim()
  if (!id) return undefined
  const store = await readActivityStore()
  for (const [agentSlug, items] of Object.entries(store.activity ?? {})) {
    const found = items.find(item => item.id === id)
    if (found) return { ...found, agentSlug }
  }
  return undefined
}

export async function appendAgentActivity(input: Omit<AgentActivity, 'id' | 'createdAt'> & { createdAt?: number }) {
  const slug = normalizeActivitySlug(input.agentSlug)
  if (!slug) return undefined
  const next: AgentActivity = {
    ...input,
    agentSlug: slug,
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
  }
  let duplicate: AgentActivity | undefined
  let appended: AgentActivity | undefined
  await mutateActivityStore(store => {
    store.activity = store.activity ?? {}
    const existing = store.activity[slug] ?? []
    duplicate = existing.find(item => (
      (input.txHash && item.txHash?.toLowerCase() === input.txHash.toLowerCase() && item.type === input.type)
      || (input.proof?.proofHash && item.proof?.proofHash === input.proof.proofHash && item.type === input.type)
    ))
    if (duplicate) return store
    appended = next
    store.activity[slug] = [next, ...existing].slice(0, 80)
    return store
  })
  if (duplicate) {
    if (shouldArchiveActivity(duplicate) && !duplicate.og) void archiveAgentActivity(duplicate).catch(() => {})
    return duplicate
  }
  if (appended) void archiveAgentActivity(appended).catch(() => {})
  return appended
}
