type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null
}

function clean(value: unknown, max = 180) {
  return String(value ?? '').trim().slice(0, max)
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
  } catch {
    return []
  }
}

export function polymarketLpSlugFromUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? ''))
    if (url.protocol !== 'https:' || url.hostname !== 'polymarket.com') return null
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[0] !== 'event' || !segments[1]) return null
    return segments.at(-1) ?? null
  } catch {
    return null
  }
}

export function polymarketLpGammaIdentity(value: unknown, marketTitle: string, outcome?: string | null) {
  const roots = Array.isArray(value) ? value : [value]
  const markets = roots.flatMap(item => {
    const itemRecord = record(item)
    return Array.isArray(itemRecord?.markets) ? itemRecord.markets : itemRecord ? [itemRecord] : []
  })
  const normalizedTitle = clean(marketTitle).toLowerCase()
  const matched = markets.find(item => {
    const itemRecord = record(item)
    return clean(itemRecord?.question ?? itemRecord?.title).toLowerCase() === normalizedTitle
  }) ?? (markets.length === 1 ? markets[0] : null)
  const market = record(matched)
  const marketId = clean(market?.conditionId ?? market?.condition_id, 96).toLowerCase()
  if (!/^0x[a-f0-9]{64}$/.test(marketId)) return null
  const outcomes = stringArray(market?.outcomes)
  const tokenIds = stringArray(market?.clobTokenIds ?? market?.clob_token_ids)
  const requestedOutcome = clean(outcome, 24).toLowerCase()
  const outcomeIndex = outcomes.findIndex(item => item.trim().toLowerCase() === requestedOutcome)
  const assetId = outcomeIndex >= 0 && /^\d+$/.test(tokenIds[outcomeIndex] ?? '') ? tokenIds[outcomeIndex] : null
  return assetId ? { marketId, assetId } : null
}
