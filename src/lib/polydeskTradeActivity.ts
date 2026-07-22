export type SavedLpScoutActivity = {
  resultActivityId: string
  receiptActivityId?: string
  agentSlug?: string
  savedAt: number
}

const STORAGE_KEY = 'polydesk:trade-activity:lp-scout:v1'
const MAX_SAVED_SCOUTS = 20

function cleanId(value: unknown) {
  return String(value ?? '').trim().slice(0, 128)
}

export function readSavedLpScoutActivity(): SavedLpScoutActivity[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const record = item as Partial<SavedLpScoutActivity>
      const resultActivityId = cleanId(record.resultActivityId)
      if (!resultActivityId) return []
      const savedAt = Number(record.savedAt)
      return [{
        resultActivityId,
        receiptActivityId: cleanId(record.receiptActivityId) || undefined,
        agentSlug: cleanId(record.agentSlug) || undefined,
        savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : Date.now(),
      }]
    }).slice(0, MAX_SAVED_SCOUTS)
  } catch {
    return []
  }
}

export function rememberLpScoutActivity(input: Omit<SavedLpScoutActivity, 'savedAt'> & { savedAt?: number }) {
  if (typeof window === 'undefined') return
  const resultActivityId = cleanId(input.resultActivityId)
  if (!resultActivityId) return
  const next: SavedLpScoutActivity = {
    resultActivityId,
    receiptActivityId: cleanId(input.receiptActivityId) || undefined,
    agentSlug: cleanId(input.agentSlug) || undefined,
    savedAt: input.savedAt ?? Date.now(),
  }
  const existing = readSavedLpScoutActivity().filter(item => item.resultActivityId !== resultActivityId)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...existing].slice(0, MAX_SAVED_SCOUTS)))
  } catch {
    // Saving activity history must never turn a completed paid request into a UI failure.
  }
}
