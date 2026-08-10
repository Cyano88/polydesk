import { createHash } from 'node:crypto'

type JsonRecord = Record<string, unknown>

export const LOLAH_NEWS_EVENT_SCHEMA = 'lolah-news-event-v1' as const

export const LOLAH_EVENT_TYPES = [
  'shutdown',
  'exploit',
  'delisting',
  'listing',
  'token_unlock',
  'acquisition',
  'lawsuit',
  'regulatory_action',
  'leadership_change',
  'partnership',
  'governance_decision',
  'network_outage',
] as const

export type LolahEventType = (typeof LOLAH_EVENT_TYPES)[number]
export type LolahVerificationStatus = 'official_source' | 'corroborated' | 'unverified'

export type LolahNewsEvent = {
  schema: typeof LOLAH_NEWS_EVENT_SCHEMA
  eventId: string
  headline: string
  summary?: string
  publisher: string
  sourceUrl: string
  publishedAt: string
  detectedAt: string
  entities: string[]
  eventType: LolahEventType
  verification: {
    status: LolahVerificationStatus
    supportingSources: string[]
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requireOnlyFields(value: JsonRecord, allowedFields: readonly string[], label: string) {
  const allowed = new Set(allowedFields)
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown) throw new Error(`Unsupported ${label} field: ${unknown}.`)
}

function containsSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretField)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, item]) => (
    /(private.?key|seed|mnemonic|api.?secret|password|authorization|wallet.?key)/i.test(key)
    || containsSecretField(item)
  ))
}

function text(value: unknown, label: string, minimum: number, maximum: number) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must contain ${minimum} through ${maximum} characters.`)
  }
  return normalized
}

function timestamp(value: unknown, label: string) {
  const milliseconds = Date.parse(String(value ?? ''))
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a valid timestamp.`)
  return { milliseconds, iso: new Date(milliseconds).toISOString() }
}

function sourceUrl(value: unknown, label: string) {
  const normalized = text(value, label, 10, 500)
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error(`${label} must be an HTTPS URL.`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must be an HTTPS URL.`)
  parsed.hash = ''
  return parsed.toString()
}

function normalizeEntity(value: unknown) {
  return text(value, 'Each entity', 2, 80)
}

function stableId(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 40)
}

export function validateLolahNewsEvent(value: unknown): LolahNewsEvent {
  if (!isRecord(value)) throw new Error('Lolah news event must be a JSON object.')
  if (containsSecretField(value)) throw new Error('Lolah news event contains forbidden secret material.')
  requireOnlyFields(value, [
    'schema', 'eventId', 'headline', 'summary', 'publisher', 'sourceUrl', 'publishedAt',
    'detectedAt', 'entities', 'eventType', 'verification',
  ], 'news event')

  if (value.schema !== LOLAH_NEWS_EVENT_SCHEMA) throw new Error('Lolah news event schema is unsupported.')
  const headline = text(value.headline, 'headline', 8, 300)
  const summary = value.summary === undefined ? undefined : text(value.summary, 'summary', 1, 1_500)
  const publisher = text(value.publisher, 'publisher', 2, 100)
  const normalizedSourceUrl = sourceUrl(value.sourceUrl, 'sourceUrl')
  const publishedAt = timestamp(value.publishedAt, 'publishedAt')
  const detectedAt = timestamp(value.detectedAt, 'detectedAt')
  if (detectedAt.milliseconds < publishedAt.milliseconds - 60_000) {
    throw new Error('detectedAt cannot materially precede publishedAt.')
  }

  if (!Array.isArray(value.entities) || value.entities.length === 0 || value.entities.length > 12) {
    throw new Error('entities must contain 1 through 12 project, token, or person names.')
  }
  const entities = value.entities.map(normalizeEntity)
  if (new Set(entities.map(entity => entity.toLowerCase())).size !== entities.length) {
    throw new Error('entities must not contain duplicates.')
  }

  const eventType = String(value.eventType ?? '') as LolahEventType
  if (!LOLAH_EVENT_TYPES.includes(eventType)) throw new Error('eventType is unsupported.')
  if (!isRecord(value.verification)) throw new Error('verification is required.')
  requireOnlyFields(value.verification, ['status', 'supportingSources'], 'verification')
  const status = String(value.verification.status ?? '') as LolahVerificationStatus
  if (!['official_source', 'corroborated', 'unverified'].includes(status)) {
    throw new Error('verification.status is unsupported.')
  }
  if (!Array.isArray(value.verification.supportingSources) || value.verification.supportingSources.length > 8) {
    throw new Error('verification.supportingSources must contain at most 8 URLs.')
  }
  const supportingSources = value.verification.supportingSources.map((item, index) => (
    sourceUrl(item, `verification.supportingSources[${index}]`)
  ))
  if (status === 'corroborated' && supportingSources.length === 0) {
    throw new Error('Corroborated events require at least one supporting source.')
  }

  const proposedEventId = String(value.eventId ?? '').trim()
  const eventId = proposedEventId || `evt_${stableId({ headline, publisher, normalizedSourceUrl, publishedAt: publishedAt.iso })}`
  if (!/^evt_[a-zA-Z0-9_-]{12,80}$/.test(eventId)) throw new Error('eventId is invalid.')

  return {
    schema: LOLAH_NEWS_EVENT_SCHEMA,
    eventId,
    headline,
    ...(summary ? { summary } : {}),
    publisher,
    sourceUrl: normalizedSourceUrl,
    publishedAt: publishedAt.iso,
    detectedAt: detectedAt.iso,
    entities,
    eventType,
    verification: { status, supportingSources },
  }
}
