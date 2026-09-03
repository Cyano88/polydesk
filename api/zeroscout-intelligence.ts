export type ZeroScoutPayload = {
  partner: string
  productType: string
  analysisType: string
  proofClass?: string
  objective: string
  outputStyle: string
  data: Record<string, unknown>
  includeClaudeReview?: boolean
  includeOpenAiReview?: boolean
}

export type ZeroScoutIntelligenceResult = {
  id: string
  aiProvider?: string
  intelligenceScore?: number
  confidence?: number
  summary?: string
  suggestedAnswer?: string
  reasoningSummary?: string
  intent?: string
  missingFields?: string[]
  safetyBoundaries?: string[]
  tradeAssessment?: {
    stance: 'SUPPORT' | 'OPPOSE' | 'INSUFFICIENT'
    side: 'BUY' | 'SELL'
    thesis: string
    counterThesis: string
    resolutionRisk: string
    evidenceQuality: 'HIGH' | 'MEDIUM' | 'LOW'
  }
  proofMetadata?: Record<string, unknown>
  signals?: string[]
  riskFlags?: string[]
  recommendedActions?: string[]
  dataGaps?: string[]
  suggestedVisuals?: string[]
  disclaimer?: string
  claudeReview?: {
    provider?: string
    intelligenceRating?: number
    strengths?: string[]
    gaps?: string[]
    recommendation?: string
  }
  openAiReview?: {
    provider?: string
    intelligenceRating?: number
    strengths?: string[]
    gaps?: string[]
    recommendation?: string
  }
  proof?: {
    storageRoot?: string
    storageUri?: string
    contentHash?: string
    storageTxHash?: string
  }
  network?: string
  storageMode?: string
  createdAt?: string
}

const MAX_PAYLOAD_BYTES = 96_000
const DEFAULT_INTELLIGENCE_PATH = '/api/integrations/intelligence'
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_REQUEST_TIMEOUT_MS ?? 120_000) || 120_000)
const RETRY_ATTEMPTS = Math.max(0, Math.min(3, Number(process.env.ZEROSCOUT_RETRY_ATTEMPTS ?? 1) || 0))
const RETRY_DELAY_MS = Math.max(100, Number(process.env.ZEROSCOUT_RETRY_DELAY_MS ?? 500) || 500)

type ZeroScoutCallOptions = {
  requireProof?: boolean
  endpointPath?: string
  timeoutMs?: number
}

export type ZeroScoutGeneralResearchArticle = {
  title: string
  description: string
  source: string
  url: string
  publishedAt: string
}

export type ZeroScoutGeneralResearchMarket = {
  conditionId: string
  question: string
  description?: string
  resolutionRules: string
  resolutionSource?: string
}

type ZeroScoutReadinessRequest = Pick<ZeroScoutPayload, 'analysisType' | 'proofClass'>

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function configuredEndpoint(endpointPath?: string) {
  const base = (process.env.ZEROSCOUT_API_URL ?? '').trim().replace(/\/+$/, '')
  if (!base) {
    const error = new Error('ZeroScout integration is not configured. Set ZEROSCOUT_API_URL on the server.') as Error & { status?: number }
    error.status = 503
    throw error
  }
  const path = (endpointPath ?? process.env.ZEROSCOUT_INTELLIGENCE_PATH ?? DEFAULT_INTELLIGENCE_PATH).trim() || DEFAULT_INTELLIGENCE_PATH
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export function hasZeroScoutProof(result: ZeroScoutIntelligenceResult) {
  return Boolean(
    result.proof
    && (
      result.proof.contentHash
      || result.proof.storageRoot
      || result.proof.storageTxHash
      || result.proof.storageUri
    ),
  )
}

function validateZeroScoutResult(value: unknown, options: ZeroScoutCallOptions): ZeroScoutIntelligenceResult {
  if (!value || typeof value !== 'object') {
    const error = new Error('ZeroScout returned an invalid response object.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  const result = value as ZeroScoutIntelligenceResult
  if (typeof result.id !== 'string' || !result.id.trim()) {
    const error = new Error('ZeroScout response is missing result id.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  for (const [field, fieldValue] of Object.entries({
    signals: result.signals,
    riskFlags: result.riskFlags,
    recommendedActions: result.recommendedActions,
    dataGaps: result.dataGaps,
    suggestedVisuals: result.suggestedVisuals,
  })) {
    if (fieldValue !== undefined && !isStringArray(fieldValue)) {
      const error = new Error(`ZeroScout response field ${field} must be an array of strings.`) as Error & { status?: number }
      error.status = 502
      throw error
    }
  }
  if (result.proof !== undefined && (typeof result.proof !== 'object' || result.proof === null)) {
    const error = new Error('ZeroScout response proof must be an object when supplied.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  if (options.requireProof && !hasZeroScoutProof(result)) {
    const error = new Error('ZeroScout response is missing stored proof metadata.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  return result
}

function shouldRetry(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : 0
  return !status || status === 408 || status === 429 || status >= 500
}

export async function preflightZeroScoutIntelligenceAccess(payload: ZeroScoutReadinessRequest): Promise<void> {
  const endpoint = configuredEndpoint('/api/integrations/intelligence/readiness')
  const secret = (process.env.ZEROSCOUT_INTEGRATION_SECRET ?? '').trim()
  if (!secret) {
    const error = new Error('ZeroScout integration is not configured. Set ZEROSCOUT_INTEGRATION_SECRET on the server.') as Error & { status?: number }
    error.status = 503
    throw error
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(10_000, REQUEST_TIMEOUT_MS))
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
        'x-hashpaylink-request-id': cryptoRandomId(),
        'x-hashpaylink-analysis-type': payload.analysisType,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    let json: Record<string, unknown>
    try {
      json = text ? JSON.parse(text) as Record<string, unknown> : {}
    } catch {
      const error = new Error(`ZeroScout readiness returned a non-JSON response: ${text.slice(0, 180)}`) as Error & { status?: number }
      error.status = 502
      throw error
    }
    if (!response.ok || json.ok !== true) {
      const message = typeof json.error === 'string' ? json.error : `ZeroScout readiness failed with HTTP ${response.status}`
      const error = new Error(message) as Error & { status?: number }
      error.status = response.status || 502
      throw error
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function callZeroScoutIntelligence(payload: ZeroScoutPayload, options: ZeroScoutCallOptions = {}): Promise<ZeroScoutIntelligenceResult> {
  const endpoint = configuredEndpoint(options.endpointPath)
  const secret = (process.env.ZEROSCOUT_INTEGRATION_SECRET ?? '').trim()
  if (!secret) {
    const error = new Error('ZeroScout integration is not configured. Set ZEROSCOUT_INTEGRATION_SECRET on the server.') as Error & { status?: number }
    error.status = 503
    throw error
  }

  const body = JSON.stringify(payload)
  if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
    const error = new Error('ZeroScout payload is too large. Send a summarized request under 96 KB.') as Error & { status?: number }
    error.status = 413
    throw error
  }

  const requestId = cryptoRandomId()
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS)
  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
          'x-hashpaylink-request-id': requestId,
          'x-hashpaylink-analysis-type': payload.analysisType,
        },
        body,
        signal: controller.signal,
      })
      const text = await response.text()
      let json: Record<string, unknown>
      try {
        json = text ? JSON.parse(text) as Record<string, unknown> : {}
      } catch {
        const error = new Error(`ZeroScout returned non-JSON response: ${text.slice(0, 180)}`) as Error & { status?: number }
        error.status = 502
        throw error
      }
      if (!response.ok) {
        const message = typeof json.error === 'string' ? json.error : `ZeroScout request failed with HTTP ${response.status}`
        const error = new Error(message) as Error & { status?: number }
        error.status = response.status
        throw error
      }
      return validateZeroScoutResult(json, options)
    } catch (err) {
      lastError = err
      if (attempt >= RETRY_ATTEMPTS || !shouldRetry(err)) break
      await sleep(RETRY_DELAY_MS * (attempt + 1))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('ZeroScout request failed.')
}

export async function getZeroScoutGeneralResearch(
  query: string,
  market: ZeroScoutGeneralResearchMarket,
): Promise<ZeroScoutGeneralResearchArticle[]> {
  const endpoint = configuredEndpoint('/api/integrations/polydesk-general-research')
  const secret = (process.env.ZEROSCOUT_INTEGRATION_SECRET ?? '').trim()
  if (!secret) {
    const error = new Error('ZeroScout integration is not configured. Set ZEROSCOUT_INTEGRATION_SECRET on the server.') as Error & { status?: number }
    error.status = 503
    throw error
  }
  const body = JSON.stringify({
    schema: 'zeroscout.polydesk-general-research.request',
    schemaVersion: '1.0.0',
    query,
    market,
  })
  const controller = new AbortController()
  const researchTimeoutMs = Math.max(
    20_000,
    Math.min(90_000, Number(process.env.ZEROSCOUT_GENERAL_RESEARCH_TIMEOUT_MS || 55_000)),
  )
  const timeout = setTimeout(() => controller.abort(), researchTimeoutMs)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + secret,
        'x-hashpaylink-request-id': cryptoRandomId(),
        'x-hashpaylink-analysis-type': 'polydesk-general-research',
      },
      body,
      signal: controller.signal,
    })
    const text = await response.text()
    let json: Record<string, unknown>
    try {
      json = text ? JSON.parse(text) as Record<string, unknown> : {}
    } catch {
      const error = new Error('ZeroScout general research returned a non-JSON response: ' + text.slice(0, 180)) as Error & { status?: number }
      error.status = 502
      throw error
    }
    if (!response.ok) {
      const message = typeof json.error === 'string' ? json.error : 'ZeroScout general research failed with HTTP ' + response.status
      const error = new Error(message) as Error & { status?: number }
      error.status = response.status
      throw error
    }
    if (
      json.schema !== 'zeroscout.polydesk-general-research.result'
      || json.schemaVersion !== '1.0.0'
      || json.provider !== 'ZeroScout'
      || json.lane !== 'general-market'
      || !Array.isArray(json.articles)
    ) {
      const error = new Error('ZeroScout general research returned an invalid structured response.') as Error & { status?: number }
      error.status = 502
      throw error
    }
    return json.articles
      .map(value => value && typeof value === 'object' ? value as Record<string, unknown> : {})
      .map(value => ({
        title: typeof value.title === 'string' ? value.title.trim() : '',
        description: typeof value.description === 'string' ? value.description.trim() : '',
        source: typeof value.source === 'string' ? value.source.trim() : '',
        url: typeof value.url === 'string' ? value.url.trim() : '',
        publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt.trim() : '',
      }))
      .filter(article => Boolean(article.title && article.description && article.source && /^https?:\/\//i.test(article.url)))
      .slice(0, 8)
  } finally {
    clearTimeout(timeout)
  }
}

function cryptoRandomId() {
  return `hpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
