import crypto from 'node:crypto'
import { callZeroScoutIntelligence, type ZeroScoutIntelligenceResult } from './zeroscout-intelligence.js'

type ZeroScoutSponsoredActionInput = {
  service: string
  action: string
  user?: {
    payer?: string
    email?: string
    wallet?: string
  }
  request: Record<string, unknown>
  sourceProof?: Record<string, unknown>
  result?: Record<string, unknown>
}

type ZeroScoutHelperGuidanceInput = {
  service: string
  action: string
  user?: ZeroScoutSponsoredActionInput['user']
  request: {
    eventId: string
    question: string
    accessMode?: string
    helperMode?: string
    helperIntent?: string
    qualityMode?: 'fast' | 'standard' | 'deep'
    hashpayStreamVideoInspectionRequested?: boolean
    memorySummary?: string
    memorySummaryHash?: string
    hashpayStreamContext?: unknown
  }
  sourceProof?: Record<string, unknown>
  strictGuidance?: boolean
}

export type ZeroScoutSponsoredAction = {
  proofClass: 'zeroscout_sponsored_action'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  sponsoredAt: string
  sourceProofClass?: 'helper_access_receipt' | 'helper_free_access' | 'helper_memory_proof' | 'service_receipt'
  zeroscout: ZeroScoutIntelligenceResult
}

export type ZeroScoutHelperGuidance = {
  proofClass: 'zeroscout_helper_context_guidance'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  guidanceHash: string
  guidedAt: string
  guidance: string
  zeroscout: ZeroScoutIntelligenceResult
}

const SPONSOR_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_SPONSOR_TIMEOUT_MS ?? 30_000))
const FAST_SPONSOR_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_FAST_SPONSOR_TIMEOUT_MS ?? 1_500))
const HELPER_GUIDANCE_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_HELPER_GUIDANCE_TIMEOUT_MS ?? 10_000))
const HASHWATCH_MEDIA_GUIDANCE_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_HASHWATCH_MEDIA_GUIDANCE_TIMEOUT_MS ?? 60_000))
const HASHWATCH_MAX_LIVE_MEDIA_SECONDS = Math.max(30, Number(process.env.ZEROSCOUT_HASHWATCH_MAX_LIVE_MEDIA_SECONDS ?? 300))
const HASHWATCH_MEDIA_MODEL_HINT = String(process.env.ZEROSCOUT_HASHWATCH_MEDIA_MODEL ?? 'qwen3.7-plus').trim()
const HASHWATCH_MEDIA_MODEL_CANDIDATES = String(
  process.env.ZEROSCOUT_HASHWATCH_MEDIA_MODEL_CANDIDATES
    ?? 'qwen3.7-plus,Qwen/Qwen2.5-VL-72B-Instruct,qwen2.5-vl-72b-instruct,qwen-vl-max-latest,Qwen/Qwen2.5-Omni-7B',
)
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)
const HASHWATCH_MEDIA_PROVIDER_HINT = String(process.env.ZEROSCOUT_HASHWATCH_MEDIA_PROVIDER ?? 'qwen-vl').trim()
const MAX_GUIDANCE_CONTEXT_LENGTH = 900

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function requestHash(value: unknown) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function cleanUser(input: ZeroScoutSponsoredActionInput['user']) {
  const payer = String(input?.payer ?? '').trim().slice(0, 160)
  const email = String(input?.email ?? '').trim().toLowerCase().slice(0, 160)
  const wallet = String(input?.wallet ?? '').trim().slice(0, 96)
  return {
    ...(payer ? { payer } : {}),
    ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
    ...(wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet) ? { wallet } : {}),
  }
}

function sourceProofClass(proof: Record<string, unknown> | undefined): ZeroScoutSponsoredAction['sourceProofClass'] | undefined {
  const source = String(proof?.source ?? proof?.type ?? '').toLowerCase()
  if (source.includes('helper-free')) return 'helper_free_access'
  if (source.includes('helper-memory')) return 'helper_memory_proof'
  if (source.includes('helper') || proof?.ogTxHash || proof?.rootHash) return 'helper_access_receipt'
  if (proof) return 'service_receipt'
  return undefined
}

function sanitizeHelperContext(input: string | undefined) {
  const value = String(input ?? '')
    .replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[redacted-api-key]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]{16,}/gi, 'Bearer [redacted-token]')
    .replace(/0x[a-fA-F0-9]{64}/g, '[redacted-private-token]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/\s+/g, ' ')
    .trim()
  return value.slice(0, MAX_GUIDANCE_CONTEXT_LENGTH)
}

function buildGuidanceText(result: ZeroScoutIntelligenceResult) {
  const extra = result as ZeroScoutIntelligenceResult & {
    guidance?: string
    answer?: string
    message?: string
    response?: string
    result?: {
      suggestedAnswer?: string
      guidance?: string
      answer?: string
      message?: string
      summary?: string
    }
  }
  const lines = [
    result.suggestedAnswer,
    extra.guidance,
    extra.answer,
    extra.message,
    extra.response,
    extra.result?.suggestedAnswer,
    extra.result?.guidance,
    extra.result?.answer,
    extra.result?.message,
    result.summary,
    extra.result?.summary,
  ]
  return Array.from(new Set(lines.map(item => String(item ?? '').trim()).filter(Boolean)))
    .join('\n')
    .slice(0, 1_000)
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedMediaUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(youtu\.be|youtube\.com|www\.youtube\.com|m\.youtube\.com)\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

function numberValue(value: unknown) {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(num) && num > 0 ? num : 0
}

function inferredDurationSeconds(...values: unknown[]) {
  for (const value of values) {
    const direct = numberValue(value)
    if (direct) return direct
  }
  const text = values.map(value => String(value ?? '')).join(' ')
  const hourMatch = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/i.exec(text)
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 3600)
  const minuteMatch = /\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/i.exec(text)
  if (minuteMatch) return Math.round(Number(minuteMatch[1]) * 60)
  const secondMatch = /\b(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|sec|s)\b/i.exec(text)
  if (secondMatch) return Math.round(Number(secondMatch[1]))
  return 0
}

function hashpayStreamMediaInspectionRequest(input: ZeroScoutHelperGuidanceInput) {
  if (!input.request.hashpayStreamVideoInspectionRequested) return undefined
  const context = recordValue(input.request.hashpayStreamContext)
  const activeContent = recordValue(context.activeContent)
  const unlockedContent = recordValue(activeContent.unlockedContent)
  const metadata = recordValue(activeContent.metadata)
  const status = stringValue(activeContent.status)
  const mediaUrl = normalizedMediaUrl(stringValue(unlockedContent.videoUrl))
  const durationSeconds = inferredDurationSeconds(
    unlockedContent.durationSeconds,
    metadata.durationSeconds,
    metadata.duration,
    activeContent.durationSeconds,
    unlockedContent.summary,
    metadata.description,
    metadata.title,
  )
  if (status !== 'unlocked' || !mediaUrl) {
    return {
      requested: true,
      allowed: false,
      reason: status === 'unlocked'
        ? 'activeContent is unlocked but no videoUrl was supplied'
        : 'activeContent is not verified unlocked',
      contentId: stringValue(activeContent.contentId),
      title: stringValue(metadata.title),
    }
  }
  if (durationSeconds > HASHWATCH_MAX_LIVE_MEDIA_SECONDS) {
    return {
      requested: true,
      allowed: false,
      blocked: true,
      reason: `HashWatch live media inspection is capped at ${Math.round(HASHWATCH_MAX_LIVE_MEDIA_SECONDS / 60)} minutes; this video is about ${Math.round(durationSeconds / 60)} minutes. Use background analysis or a shorter demo clip.`,
      contentId: stringValue(activeContent.contentId),
      title: stringValue(metadata.title),
      description: stringValue(metadata.description),
      durationSeconds,
      maxLiveDurationSeconds: HASHWATCH_MAX_LIVE_MEDIA_SECONDS,
    }
  }
  return {
    requested: true,
    allowed: true,
    mediaType: 'hashwatch-video',
    mediaTask: 'video-url-analysis',
    routingRequired: true,
    requiredProvider: HASHWATCH_MEDIA_PROVIDER_HINT || undefined,
    requiredModelFamily: 'qwen-vl',
    mediaUrl,
    preferredModel: HASHWATCH_MEDIA_MODEL_HINT || undefined,
    modelPreference: HASHWATCH_MEDIA_MODEL_HINT || undefined,
    modelCandidates: HASHWATCH_MEDIA_MODEL_CANDIDATES.length ? HASHWATCH_MEDIA_MODEL_CANDIDATES : undefined,
    contentId: stringValue(activeContent.contentId),
    title: stringValue(metadata.title),
    description: stringValue(metadata.description),
    durationSeconds,
    maxLiveDurationSeconds: HASHWATCH_MAX_LIVE_MEDIA_SECONDS,
    creator: stringValue(metadata.creator),
    policy: [
      'This mediaUrl is private HashpayStream content and is supplied only because activeContent.status is unlocked.',
      'Inspect or fetch the media URL only for this user request.',
      'If the media URL cannot be fetched, return a clear limitation and summarize verified metadata instead.',
    ],
  }
}

function shouldUseDeepHelperReview(input: ZeroScoutHelperGuidanceInput) {
  return input.request.qualityMode === 'deep'
}

function helperGuidanceTimeoutMs(input: ZeroScoutHelperGuidanceInput, mediaInspection: ReturnType<typeof hashpayStreamMediaInspectionRequest>) {
  if (mediaInspection?.requested) return HASHWATCH_MEDIA_GUIDANCE_TIMEOUT_MS
  if (input.strictGuidance || input.request.qualityMode === 'deep') return Math.max(HELPER_GUIDANCE_TIMEOUT_MS, 20_000)
  if (input.request.qualityMode === 'fast') return Math.min(HELPER_GUIDANCE_TIMEOUT_MS, 4_000)
  return HELPER_GUIDANCE_TIMEOUT_MS
}

type HelperRefinementLane = 'og-compute' | 'openai' | 'anthropic' | 'multi-stack'

function forcedSimpleHelperLane(): HelperRefinementLane | undefined {
  const lane = String(process.env.ZEROSCOUT_HELPER_REFINEMENT_LANE ?? '').trim().toLowerCase()
  if (lane === 'og-compute' || lane === 'openai' || lane === 'anthropic') return lane
  return undefined
}

function helperRefinementLane(input: ZeroScoutHelperGuidanceInput): HelperRefinementLane {
  if (shouldUseDeepHelperReview(input)) return 'multi-stack'
  if (input.request.qualityMode === 'fast') return 'og-compute'
  const helperMode = String(input.request.helperMode ?? '').trim().toLowerCase()
  if (helperMode === 'payments' || helperMode === 'daily' || helperMode === 'services' || helperMode === 'support') return 'og-compute'
  if (helperMode === 'polydesk') return 'multi-stack'
  const forcedLane = forcedSimpleHelperLane()
  if (forcedLane) return forcedLane
  const seed = requestHash({
    eventId: input.request.eventId,
    question: input.request.question,
    helperIntent: input.request.helperIntent,
    memorySummaryHash: input.request.memorySummaryHash,
  })
  const bucket = parseInt(seed.slice(0, 2), 16) % 3
  if (bucket === 1) return 'openai'
  if (bucket === 2) return 'anthropic'
  return 'og-compute'
}

function helperFallbackOrder(lane: HelperRefinementLane) {
  if (lane === 'multi-stack') return ['0g-compute', 'openai', 'anthropic', 'local']
  if (lane === 'openai') return ['openai', '0g-compute', 'anthropic', 'local']
  if (lane === 'anthropic') return ['anthropic', '0g-compute', 'openai', 'local']
  return ['0g-compute', 'openai', 'anthropic', 'local']
}

function helperReviewFlags(lane: HelperRefinementLane) {
  return {
    includeClaudeReview: lane === 'multi-stack' || lane === 'anthropic',
    includeOpenAiReview: lane === 'multi-stack' || lane === 'openai',
  }
}

function helperModeInstructions(input: ZeroScoutHelperGuidanceInput) {
  const mode = String(input.request.helperMode ?? '').trim().toLowerCase()
  if (mode === 'daily') {
    return [
      'Daily mode is an everyday companion mode for normal conversation, emotions, planning, ideas, and personal support.',
      'Do not mention payments, wallets, PolyDesk, LP Scout, or x402 services unless the user asks about them.',
      'For greetings, reply warmly in one short sentence and ask a simple open question.',
      'For mood or personal support, respond empathetically and naturally without turning it into a product menu.',
    ]
  }
  if (mode === 'payments') {
    return [
      'Payments mode should focus on payment request creation, payment clarification, receipts, network, amount, purpose, and receive wallet.',
      'Keep wording short because deterministic PayLink creation is handled by Hash PayLink locally.',
    ]
  }
  if (mode === 'services') {
    return [
      'Services mode should explain PolyDesk services only when the user asks about product capabilities or setup.',
    ]
  }
  if (mode === 'polydesk') {
    return [
      'PolyDesk mode is only for Polymarket users: portfolio tracking, World Cup market context, funding, and LP Scout access.',
      'Do not answer unrelated daily-life or generic product strategy questions in PolyDesk mode.',
      'For portfolio value, positions, scores, news, market data, LP Scout access, x402, or paid proof claims, rely only on verified app state and supplied backend context.',
      'Keep LP Scout x402 proof separate from normal USDC access payments.',
    ]
  }
  if (mode === 'support') {
    return [
      'Support mode should troubleshoot app usage clearly with one next step at a time.',
    ]
  }
  return []
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ZeroScout sponsorship timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function getZeroScoutHelperGuidance(input: ZeroScoutHelperGuidanceInput): Promise<ZeroScoutHelperGuidance | undefined> {
  const sanitizedMemorySummary = sanitizeHelperContext(input.request.memorySummary)
  const refinementLane = helperRefinementLane(input)
  const reviewFlags = helperReviewFlags(refinementLane)
  const mediaInspection = hashpayStreamMediaInspectionRequest(input)
  const mediaInspectionForZeroScout = mediaInspection && mediaInspection.allowed === false
    ? { ...mediaInspection, requested: false }
    : mediaInspection
  const request = {
    eventId: input.request.eventId,
    question: sanitizeHelperContext(input.request.question),
    accessMode: input.request.accessMode,
    helperMode: input.request.helperMode,
    helperIntent: input.request.helperIntent,
    qualityMode: input.request.qualityMode,
    hashpayStreamVideoInspectionRequested: input.request.hashpayStreamVideoInspectionRequested,
    memorySummary: sanitizedMemorySummary || undefined,
    memorySummaryHash: input.request.memorySummaryHash,
    hashpayStreamContext: input.request.hashpayStreamContext,
    mediaInspection: mediaInspectionForZeroScout,
  }
  const hash = requestHash({
    service: input.service,
    action: input.action,
    user: cleanUser(input.user),
    request,
  })

  try {
    const zeroscout = await callZeroScoutIntelligence({
      partner: 'Hash PayLink',
      productType: 'agentic-service',
      analysisType: 'zeroscout-helper-context-guidance',
      objective: 'Return a concise, consumer-friendly Agent Hash chat answer. Be direct, human, and useful. Follow helperModeInstructions strictly. Answer ordinary everyday questions cleanly. For live schedules, prices, current events, restaurants, or other freshness-sensitive requests, answer only if verified data is available in the request or ZeroScout can verify it; otherwise say plainly that live verification is not available from this chat. Personal identity questions should be answered only from supplied memory/profile context; if unknown, say that naturally. Payment-link requests should be practical and minimal only when the user is in Payments mode or explicitly asks for payment help. Respect payment, wallet, LP Scout, and x402 proof boundaries.',
      outputStyle: 'consumer-helper-answer-guidance',
      data: {
        proofClass: 'zeroscout_helper_context_guidance',
        service: input.service,
        action: input.action,
        user: cleanUser(input.user),
        requestHash: hash,
        request,
        mediaInspection: mediaInspectionForZeroScout,
        mediaUrl: mediaInspection?.allowed ? mediaInspection.mediaUrl : undefined,
        videoUrl: mediaInspection?.allowed ? mediaInspection.mediaUrl : undefined,
        url: mediaInspection?.allowed ? mediaInspection.mediaUrl : undefined,
        mediaTask: mediaInspection?.allowed ? 'video-url-analysis' : undefined,
        mediaType: mediaInspection?.allowed ? mediaInspection.mediaType : undefined,
        forceMediaInspection: mediaInspection?.allowed ? true : undefined,
        requiredProvider: mediaInspection?.allowed ? HASHWATCH_MEDIA_PROVIDER_HINT || undefined : undefined,
        requiredModelFamily: mediaInspection?.allowed ? 'qwen-vl' : undefined,
        requiredModel: mediaInspection?.allowed ? HASHWATCH_MEDIA_MODEL_HINT || undefined : undefined,
        preferredModel: mediaInspection?.allowed ? HASHWATCH_MEDIA_MODEL_HINT || undefined : undefined,
        allowedModels: mediaInspection?.allowed ? HASHWATCH_MEDIA_MODEL_CANDIDATES : undefined,
        mediaModelPreference: mediaInspection?.allowed ? HASHWATCH_MEDIA_MODEL_HINT || undefined : undefined,
        mediaRouting: mediaInspection?.allowed
          ? {
              task: 'video-url-analysis',
              forceMediaInspection: true,
              requiredProvider: HASHWATCH_MEDIA_PROVIDER_HINT || undefined,
              requiredModelFamily: 'qwen-vl',
              requiredModel: HASHWATCH_MEDIA_MODEL_HINT || undefined,
              allowedModels: HASHWATCH_MEDIA_MODEL_CANDIDATES,
              rejectMetadataOnlyAnswer: true,
              rejectTextOnlyModel: true,
              mediaUrlField: 'data.mediaUrl',
            }
          : undefined,
        sourceProof: input.sourceProof,
        helperIntent: input.request.helperIntent,
        helperMode: input.request.helperMode,
        qualityMode: input.request.qualityMode ?? 'standard',
        refinementPolicy: refinementLane === 'multi-stack'
          ? 'deep-multi-stack-0g-anthropic-openai'
          : 'single-lane-short-refinement',
        requestedRefinementLane: refinementLane,
        fallbackOrder: helperFallbackOrder(refinementLane),
        modelHints: mediaInspection?.allowed && HASHWATCH_MEDIA_MODEL_HINT
          ? {
              preferredModel: HASHWATCH_MEDIA_MODEL_HINT,
              preferredProvider: HASHWATCH_MEDIA_MODEL_HINT,
              providerHint: HASHWATCH_MEDIA_PROVIDER_HINT,
              candidateModels: HASHWATCH_MEDIA_MODEL_CANDIDATES,
              requiredCapabilities: ['video-understanding', 'temporal-grounding', 'media-url-inspection', 'youtube-url-ingestion'],
              blockedProviders: ['zai-org/GLM-5-FP8', 'text-only-router'],
              reason: 'HashWatch video/media breakdown requests must route to a video-capable Qwen VL model, not a text-only metadata model.',
            }
          : undefined,
        latencyTargetMs: mediaInspection?.requested ? HASHWATCH_MEDIA_GUIDANCE_TIMEOUT_MS : input.request.qualityMode === 'deep' ? 20_000 : input.request.qualityMode === 'fast' ? 4_000 : 8_000,
        maxAnswerChars: mediaInspection?.requested ? 1_600 : input.request.qualityMode === 'deep' ? 1_200 : 420,
        helperModeInstructions: helperModeInstructions(input),
        separationRules: [
          'This is helper context guidance only, not LP Scout paid proof.',
          'For general-helper or greeting intent, answer the user directly instead of returning a product capability menu.',
          'In Daily mode, never include a payment/product capability menu unless the user asks for payment or product help.',
          'Do not mention ZeroScout sponsorship requirements in user-facing answer text.',
          'Do not return generic product strategy when the user asks a simple personal, payment, or setup question.',
          'Do not claim Circle wallet balance, x402 service balance, x402 activation, paid-service access, receipt status, or LP Scout proof unless supplied by verified app state.',
          'Keep Circle wallet balance, x402 service balance, Activate x402, paid services, and LP Scout proof/payment requirements distinct.',
          'Do not infer live schedules, prices, wallet balances, secrets, payment proofs, or user identity beyond supplied fields.',
        ],
      },
      includeClaudeReview: reviewFlags.includeClaudeReview,
      includeOpenAiReview: reviewFlags.includeOpenAiReview,
    }, {
      timeoutMs: helperGuidanceTimeoutMs(input, mediaInspection),
    })

    const guidance = buildGuidanceText(zeroscout)
    if (input.strictGuidance && !guidance) {
      const error = new Error('ZeroScout helper guidance response did not include suggestedAnswer, guidance, answer, message, response, or summary.') as Error & { status?: number }
      error.status = 502
      throw error
    }
    const guidanceHash = requestHash({
      requestHash: hash,
      summary: zeroscout.summary,
      signals: zeroscout.signals,
      riskFlags: zeroscout.riskFlags,
      recommendedActions: zeroscout.recommendedActions,
      dataGaps: zeroscout.dataGaps,
    })

    return {
      proofClass: 'zeroscout_helper_context_guidance',
      sponsor: 'ZeroScout',
      service: input.service,
      action: input.action,
      requestHash: hash,
      guidanceHash,
      guidedAt: new Date().toISOString(),
      guidance,
      zeroscout,
    }
  } catch (err) {
    console.warn('[zeroscout-helper-guidance] skipped:', err instanceof Error ? err.message : String(err))
    if (input.strictGuidance) throw err
    return undefined
  }
}

export async function sponsorZeroScoutAction(input: ZeroScoutSponsoredActionInput): Promise<ZeroScoutSponsoredAction | undefined> {
  const hash = requestHash({
    service: input.service,
    action: input.action,
    user: cleanUser(input.user),
    request: input.request,
  })

  try {
    const qualityMode = String(input.request?.qualityMode ?? '')
    const timeoutMs = qualityMode === 'deep' ? SPONSOR_TIMEOUT_MS : FAST_SPONSOR_TIMEOUT_MS
    const zeroscout = await withTimeout(callZeroScoutIntelligence({
      partner: 'Hash PayLink',
      productType: 'agentic-service',
      analysisType: 'zeroscout-sponsored-action',
      objective: 'Create a concise sponsorship annotation for a Hash PayLink helper, chat, or service action without treating it as LP Scout paid proof.',
      outputStyle: 'sponsorship-receipt',
      data: {
        proofClass: 'zeroscout_sponsored_action',
        service: input.service,
        action: input.action,
        user: cleanUser(input.user),
        requestHash: hash,
        request: input.request,
        sourceProof: input.sourceProof,
        result: input.result,
        refinementPolicy: 'proof-only-no-review',
        separationRules: [
          'This is ZeroScout-sponsored helper or service context, not LP Scout paid proof.',
          'LP Scout operator signals still require a saved Polymarket LP Scout result and matching x402 payment proof.',
          'Do not infer live prices, wallet balances, or market data that were not supplied.',
        ],
      },
      includeClaudeReview: false,
      includeOpenAiReview: false,
    }, { requireProof: true, endpointPath: '/api/integrations/sponsorship-proof' }), timeoutMs)

    return {
      proofClass: 'zeroscout_sponsored_action',
      sponsor: 'ZeroScout',
      service: input.service,
      action: input.action,
      requestHash: hash,
      sponsoredAt: new Date().toISOString(),
      sourceProofClass: sourceProofClass(input.sourceProof),
      zeroscout,
    }
  } catch (err) {
    console.warn('[zeroscout-sponsored-action] skipped:', err instanceof Error ? err.message : String(err))
    return undefined
  }
}
