import type { AgentActivity } from './agent-activity.js'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function cleanActivityCapability(value: unknown) {
  const id = String(value ?? '').trim()
  return /^[a-zA-Z0-9_-]{12,100}$/.test(id) ? id : ''
}

export function authorizedLpScoutReceipt(
  scout: AgentActivity,
  activity: AgentActivity[],
  rawReceiptId: unknown,
) {
  const receiptId = cleanActivityCapability(rawReceiptId)
  if (!receiptId) return undefined
  const linkedReceiptId = cleanActivityCapability(record(scout.result).receiptActivityId)
  if (!linkedReceiptId || linkedReceiptId !== receiptId) return undefined
  return activity.find(item => (
    item.id === receiptId
    && item.agentSlug === scout.agentSlug
    && item.type === 'x402_spent'
  ))
}
