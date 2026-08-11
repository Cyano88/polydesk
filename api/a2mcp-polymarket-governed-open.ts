import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { verifyMessage } from 'ethers'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
  writeDurableJson,
} from './render-durable-store.js'
import { validateSignedOpenInput } from './a2mcp-polymarket-signed-open.js'
import {
  appendTradeSignalEvent,
  buildGovernedTradeSignal,
  buildVerifiedExecutionSignal,
} from './trade-signal-outbox.js'

type RecordValue = Record<string, unknown>
type Decision = 'APPROVE' | 'ESCALATE' | 'BLOCK'
type DecisionCheck = { check: string; result: 'PASS' | 'ESCALATE' | 'BLOCK'; detail: string }

const SIGNED_OPEN_KEYS = [
  'externalOrderId',
  'marketUrl',
  'marketTitle',
  'outcome',
  'tokenId',
  'signer',
  'orderType',
  'order',
  'orderPayload',
] as const

const MANDATE_KEYS = [
  'maximumAmountUsdc',
  'maximumPrice',
  'allowedTokenIds',
  'allowedMarketUrls',
  'allowedSigner',
  'authoritySigner',
  'authoritySignature',
  'validUntil',
  'approvalRequiredAboveUsdc',
] as const

type GovernedOpenRecord = {
  fingerprint: string
  externalOrderId: string
  executionId: string
  decisionHash: string
  decision: Decision
  orderHash: string
  mandateHash: string
  decidedAt: string
  payer: string
  paymentTransaction?: string
  authoritySigner: string
  market: {
    title: string
    url: string
    outcome: string
    tokenId: string
  }
  order: {
    maker: string
    signer: string
    type: 'FAK' | 'FOK'
    maximumAmountUsdc: string
    maximumPrice: string
  }
  receipt?: GovernedTradeReceipt
}

type GovernedTradeReceipt = {
  receiptVersion: 'polydesk-governed-trade-receipt-v1'
  executionId: string
  externalOrderId: string
  status: 'VERIFIED_FILLED'
  verifiedAt: string
  market: GovernedOpenRecord['market']
  execution: {
    orderId: string
    transactionHash: string
    exchange: string
    side: 'BUY'
    fillSize: number
    fillPrice: number
    fillAmountUsdc: number
  }
  policy: {
    decision: Decision
    decisionHash: string
    orderHash: string
    mandateHash: string
  }
  proofs: {
    polygonReceiptVerified: true
    allowedExchangeVerified: true
    orderIdInReceipt: true
    publicTradeMatched: true
    buyerAuthoritySignatureVerified: true
  }
}

class ExternalOrderConflict extends Error {}

const POLYGON_EXCHANGES = new Set([
  '0xe111180000d2663c0091e4f400237545b87b996b',
  '0xe2222d279d744050d28e00520010520000310f59',
])
const DATA_API_ORIGIN = 'https://data-api.polymarket.com'

function clean(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasOnlyKeys(value: RecordValue, allowed: readonly string[]) {
  const accepted = new Set(allowed)
  return Object.keys(value).every(key => accepted.has(key))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function governedMandateAuthorizationMessage(externalOrderId: string, canonicalMandate: RecordValue) {
  const mandateHash = sha256(stableJson(canonicalMandate))
  return [
    'PolyDesk Governed Market OPEN',
    'Policy: polydesk-market-mandate-v1',
    'Network: X Layer (eip155:196)',
    `External order: ${externalOrderId}`,
    `Mandate SHA-256: ${mandateHash}`,
  ].join('\n')
}

export function governedTradeCompletionMessage(
  executionId: string,
  externalOrderId: string,
  orderId: string,
  transactionHash: string,
) {
  return [
    'PolyDesk Governed Trade Completion',
    'Policy: polydesk-governed-trade-receipt-v1',
    `Execution: ${executionId}`,
    `External order: ${externalOrderId}`,
    `Polymarket order: ${orderId.toLowerCase()}`,
    `Polygon transaction: ${transactionHash.toLowerCase()}`,
  ].join('\n')
}

function decimalToAtomic(value: unknown, label: string) {
  const text = clean(value, 32)
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) {
    return { ok: false as const, error: `${label} must be a non-negative decimal with at most 6 places.` }
  }
  const [whole, fraction = ''] = text.split('.')
  return {
    ok: true as const,
    text,
    atomic: BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')),
  }
}

function atomicToDecimal(value: bigint) {
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function stringArray(value: unknown, label: string, validate: (item: string) => boolean) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    return { ok: false as const, error: `${label} must contain between 1 and 20 entries.` }
  }
  const items = value.map(item => clean(item, 320))
  if (items.some(item => !validate(item))) return { ok: false as const, error: `${label} contains an invalid entry.` }
  return { ok: true as const, items: [...new Set(items)] }
}

function exactPolymarketUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'polymarket.com'
      && (url.pathname.startsWith('/event/') || url.pathname.startsWith('/sports/'))
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

export type GovernedMandateAuthorization =
  | {
      ok: true
      canonicalMandate: RecordValue
      mandateHash: string
      authorizationMessage: string
      authoritySigner: string
      authoritySignature: string
      maximumAmount: { text: string; atomic: bigint }
      maximumPrice: { text: string; atomic: bigint }
      approvalThreshold?: { text: string; atomic: bigint }
      allowedTokens: string[]
      allowedMarkets: string[]
      allowedSigner: string
      validUntilMs: number
    }
  | { ok: false; status: number; error: string }

export function buildGovernedMandateAuthorization(
  externalOrderIdValue: unknown,
  mandateValue: unknown,
  nowMs = Date.now(),
): GovernedMandateAuthorization {
  const externalOrderId = clean(externalOrderIdValue, 80)
  if (!/^[a-zA-Z0-9:_-]{8,80}$/.test(externalOrderId)) {
    return { ok: false, status: 400, error: 'externalOrderId must be 8-80 letters, numbers, colons, underscores, or hyphens.' }
  }
  if (!isRecord(mandateValue) || !hasOnlyKeys(mandateValue, MANDATE_KEYS)) {
    return { ok: false, status: 400, error: 'A strict governed OPEN mandate is required.' }
  }
  const mandate = mandateValue
  const maximumAmount = decimalToAtomic(mandate.maximumAmountUsdc, 'mandate.maximumAmountUsdc')
  if (!maximumAmount.ok || maximumAmount.atomic <= 0n) {
    return { ok: false, status: 400, error: maximumAmount.ok ? 'mandate.maximumAmountUsdc must be greater than zero.' : maximumAmount.error }
  }
  const maximumPrice = decimalToAtomic(mandate.maximumPrice, 'mandate.maximumPrice')
  if (!maximumPrice.ok || maximumPrice.atomic <= 0n || maximumPrice.atomic >= 1_000_000n) {
    return { ok: false, status: 400, error: maximumPrice.ok ? 'mandate.maximumPrice must be greater than 0 and less than 1.' : maximumPrice.error }
  }
  const approvalThreshold = mandate.approvalRequiredAboveUsdc === undefined
    ? undefined
    : decimalToAtomic(mandate.approvalRequiredAboveUsdc, 'mandate.approvalRequiredAboveUsdc')
  if (approvalThreshold && (!approvalThreshold.ok || approvalThreshold.atomic > maximumAmount.atomic)) {
    return {
      ok: false,
      status: 400,
      error: approvalThreshold.ok
        ? 'mandate.approvalRequiredAboveUsdc cannot exceed mandate.maximumAmountUsdc.'
        : approvalThreshold.error,
    }
  }
  const allowedTokens = stringArray(mandate.allowedTokenIds, 'mandate.allowedTokenIds', item => /^\d+$/.test(item))
  if (!allowedTokens.ok) return { ok: false, status: 400, error: allowedTokens.error }
  const allowedMarkets = stringArray(mandate.allowedMarketUrls, 'mandate.allowedMarketUrls', exactPolymarketUrl)
  if (!allowedMarkets.ok) return { ok: false, status: 400, error: allowedMarkets.error }
  const allowedSigner = clean(mandate.allowedSigner, 80).toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(allowedSigner)) {
    return { ok: false, status: 400, error: 'mandate.allowedSigner must be a valid EVM address.' }
  }
  const authoritySigner = clean(mandate.authoritySigner, 80).toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(authoritySigner)) {
    return { ok: false, status: 400, error: 'mandate.authoritySigner must be a valid EVM address.' }
  }
  const authoritySignature = clean(mandate.authoritySignature, 180)
  if (authoritySignature && !/^0x[a-fA-F0-9]{130}$/.test(authoritySignature)) {
    return { ok: false, status: 400, error: 'mandate.authoritySignature must be a 65-byte personal-sign signature.' }
  }
  const validUntil = clean(mandate.validUntil, 48)
  const validUntilMs = Date.parse(validUntil)
  if (!Number.isFinite(validUntilMs) || validUntilMs <= nowMs || validUntilMs > nowMs + 7 * 24 * 60 * 60_000) {
    return { ok: false, status: 400, error: 'mandate.validUntil must be in the future and no more than 7 days away.' }
  }
  const canonicalMandate = {
    maximumAmountUsdc: maximumAmount.text,
    maximumPrice: maximumPrice.text,
    allowedTokenIds: allowedTokens.items.slice().sort(),
    allowedMarketUrls: allowedMarkets.items.slice().sort(),
    allowedSigner,
    authoritySigner,
    validUntil: new Date(validUntilMs).toISOString(),
    ...(approvalThreshold?.ok ? { approvalRequiredAboveUsdc: approvalThreshold.text } : {}),
  }
  const mandateHash = sha256(stableJson(canonicalMandate))
  return {
    ok: true,
    canonicalMandate,
    mandateHash,
    authorizationMessage: governedMandateAuthorizationMessage(externalOrderId, canonicalMandate),
    authoritySigner,
    authoritySignature,
    maximumAmount,
    maximumPrice,
    ...(approvalThreshold?.ok ? { approvalThreshold } : {}),
    allowedTokens: allowedTokens.items,
    allowedMarkets: allowedMarkets.items,
    allowedSigner,
    validUntilMs,
  }
}

export type GovernedOpenEvaluation =
  | {
      ok: true
      decision: Decision
      executionId: string
      fingerprint: string
      externalOrderId: string
      orderHash: string
      mandateHash: string
      decisionHash: string
      amountUsdc: string
      effectivePrice: string
      validUntil: string
      reasons: string[]
      checks: DecisionCheck[]
      signedOpen: Extract<ReturnType<typeof validateSignedOpenInput>, { ok: true }>
      mandate: RecordValue
    }
  | { ok: false; status: number; error: string }

export function evaluateGovernedOpenInput(body: unknown, nowMs = Date.now()): GovernedOpenEvaluation {
  if (!isRecord(body)) return { ok: false, status: 400, error: 'Governed OPEN request must be a JSON object.' }
  if (!hasOnlyKeys(body, [...SIGNED_OPEN_KEYS, 'mandate'])) {
    return { ok: false, status: 400, error: 'Governed OPEN request contains unsupported fields.' }
  }
  const signedBody: RecordValue = {}
  for (const key of SIGNED_OPEN_KEYS) signedBody[key] = body[key]
  const signedOpen = validateSignedOpenInput(signedBody, nowMs)
  if (!signedOpen.ok) return signedOpen

  const authorization = buildGovernedMandateAuthorization(signedOpen.externalOrderId, body.mandate, nowMs)
  if (!authorization.ok) return authorization
  if (!authorization.authoritySignature) {
    return { ok: false, status: 400, error: 'mandate.authoritySignature is required.' }
  }
  const {
    maximumAmount,
    maximumPrice,
    approvalThreshold,
    allowedTokens,
    allowedMarkets,
    allowedSigner,
    authoritySigner,
    authoritySignature,
    validUntilMs,
    canonicalMandate,
    mandateHash,
    authorizationMessage,
  } = authorization

  const makerAmount = BigInt(clean(signedOpen.order.makerAmount, 80))
  const takerAmount = BigInt(clean(signedOpen.order.takerAmount, 80))
  const effectivePriceAtomic = (makerAmount * 1_000_000n + takerAmount - 1n) / takerAmount
  const checks: DecisionCheck[] = []
  const blockingReasons: string[] = []
  const escalationReasons: string[] = []
  const addCheck = (check: string, result: 'PASS' | 'ESCALATE' | 'BLOCK', detail: string) => {
    checks.push({ check, result, detail })
    if (result === 'BLOCK') blockingReasons.push(detail)
    if (result === 'ESCALATE') escalationReasons.push(detail)
  }

  let recoveredAuthority = ''
  try {
    recoveredAuthority = verifyMessage(authorizationMessage, authoritySignature).toLowerCase()
  } catch {
    return { ok: false, status: 400, error: 'The mandate authority signature is invalid.' }
  }
  if (recoveredAuthority !== authoritySigner) {
    return { ok: false, status: 400, error: 'The mandate authority signature does not match mandate.authoritySigner.' }
  }

  addCheck('authority', 'PASS', 'The mandate authority signature is valid and bound to this external order ID.')
  addCheck(
    'amount',
    makerAmount <= maximumAmount.atomic ? 'PASS' : 'BLOCK',
    makerAmount <= maximumAmount.atomic
      ? `${atomicToDecimal(makerAmount)} USDC is within the ${maximumAmount.text} USDC mandate.`
      : `${atomicToDecimal(makerAmount)} USDC exceeds the ${maximumAmount.text} USDC mandate.`,
  )
  addCheck(
    'price',
    makerAmount * 1_000_000n <= maximumPrice.atomic * takerAmount ? 'PASS' : 'BLOCK',
    makerAmount * 1_000_000n <= maximumPrice.atomic * takerAmount
      ? `Effective price ${atomicToDecimal(effectivePriceAtomic)} is within the ${maximumPrice.text} limit.`
      : `Effective price ${atomicToDecimal(effectivePriceAtomic)} exceeds the ${maximumPrice.text} limit.`,
  )
  addCheck(
    'token',
    allowedTokens.includes(signedOpen.tokenId) ? 'PASS' : 'BLOCK',
    allowedTokens.includes(signedOpen.tokenId)
      ? 'The signed outcome token is allowlisted.'
      : 'The signed outcome token is not allowlisted.',
  )
  addCheck(
    'market',
    allowedMarkets.includes(signedOpen.marketUrl) ? 'PASS' : 'BLOCK',
    allowedMarkets.includes(signedOpen.marketUrl)
      ? 'The declared Polymarket market URL is allowlisted.'
      : 'The declared Polymarket market URL is not allowlisted.',
  )
  addCheck(
    'signer',
    signedOpen.signer.toLowerCase() === allowedSigner ? 'PASS' : 'BLOCK',
    signedOpen.signer.toLowerCase() === allowedSigner
      ? 'The signed order uses the mandated buyer signer.'
      : 'The signed order does not use the mandated buyer signer.',
  )
  addCheck('expiry', 'PASS', `The mandate is valid until ${new Date(validUntilMs).toISOString()}.`)
  if (approvalThreshold) {
    addCheck(
      'human-approval-threshold',
      makerAmount > approvalThreshold.atomic ? 'ESCALATE' : 'PASS',
      makerAmount > approvalThreshold.atomic
        ? `${atomicToDecimal(makerAmount)} USDC requires explicit approval above ${approvalThreshold.text} USDC.`
        : `${atomicToDecimal(makerAmount)} USDC is within the no-escalation threshold.`,
    )
  }

  const decision: Decision = blockingReasons.length ? 'BLOCK' : escalationReasons.length ? 'ESCALATE' : 'APPROVE'
  const orderHash = sha256(signedOpen.orderBody)
  const fingerprint = sha256(`${signedOpen.externalOrderId}:${orderHash}:${mandateHash}`)
  const decisionHash = sha256(stableJson({
    policyVersion: 'polydesk-market-mandate-v1',
    fingerprint,
    decision,
    checks,
  }))
  const executionId = `pex_${fingerprint.slice(0, 24)}`

  return {
    ok: true,
    decision,
    executionId,
    fingerprint,
    externalOrderId: signedOpen.externalOrderId,
    orderHash,
    mandateHash,
    decisionHash,
    amountUsdc: atomicToDecimal(makerAmount),
    effectivePrice: atomicToDecimal(effectivePriceAtomic),
    validUntil: new Date(validUntilMs).toISOString(),
    reasons: decision === 'BLOCK'
      ? blockingReasons
      : decision === 'ESCALATE'
        ? escalationReasons
        : ['Every deterministic mandate check passed.'],
    checks,
    signedOpen,
    mandate: canonicalMandate,
  }
}

export function governedOpenReady() {
  return hasRenderDurableStore()
}

export function polymarketGovernedOpenAuthorizationHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const body = isRecord(req.body) ? req.body : {}
  const authorization = buildGovernedMandateAuthorization(body.externalOrderId, body.mandate)
  if (!authorization.ok) return res.status(authorization.status).json({ ok: false, error: authorization.error })
  return res.status(200).json({
    ok: true,
    policyVersion: 'polydesk-market-mandate-v1',
    externalOrderId: clean(body.externalOrderId, 80),
    authoritySigner: authorization.authoritySigner,
    canonicalMandate: authorization.canonicalMandate,
    mandateHash: authorization.mandateHash,
    authorizationMessage: authorization.authorizationMessage,
    signingMethod: 'personal_sign',
    next: 'Sign authorizationMessage with authoritySigner, set mandate.authoritySignature, then run the free governed OPEN preflight.',
  })
}

export function polymarketGovernedOpenValidationHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const evaluation = evaluateGovernedOpenInput(req.body)
  if (!evaluation.ok) return res.status(evaluation.status).json({ ok: false, error: evaluation.error })
  return res.status(200).json({
    ok: true,
    valid: true,
    policyVersion: 'polydesk-market-mandate-v1',
    decision: evaluation.decision,
    executionId: evaluation.executionId,
    externalOrderId: evaluation.externalOrderId,
    amountUsdc: evaluation.amountUsdc,
    effectivePrice: evaluation.effectivePrice,
    reasons: evaluation.reasons,
    checks: evaluation.checks,
    hashes: {
      order: evaluation.orderHash,
      mandate: evaluation.mandateHash,
      decision: evaluation.decisionHash,
    },
    next: evaluation.decision === 'APPROVE'
      ? 'Pay the OKX x402 challenge, then replay this exact body without modification.'
      : 'Revise the order or obtain a new mandate before paying for the governed handoff.',
  })
}

export default async function a2mcpPolymarketGovernedOpenHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const paidReq = req as Request & {
    access?: { granted?: boolean; model?: string; provider?: string }
    payment?: { verified?: boolean; payer?: string; transaction?: string }
  }
  const paidAccess = paidReq.payment?.verified === true
  const freeAccess = paidReq.access?.granted === true && paidReq.access.model === 'free'
  if (!paidAccess && !freeAccess) {
    return res.status(403).json({ ok: false, error: 'Paid or marketplace-free service access is required.' })
  }
  if (!governedOpenReady()) {
    return res.status(503).json({ ok: false, error: 'PolyDesk governed OPEN durable storage is not configured.' })
  }

  const evaluation = evaluateGovernedOpenInput(req.body)
  if (!evaluation.ok) return res.status(evaluation.status).json({ ok: false, error: evaluation.error })

  const storeKey = `polymarket-governed-open:${sha256(evaluation.externalOrderId).slice(0, 32)}`
  let duplicate = false
  let record: GovernedOpenRecord
  try {
    record = await mutateDurableJson<GovernedOpenRecord>(storeKey, current => {
      if (current && current.fingerprint !== evaluation.fingerprint) {
        throw new ExternalOrderConflict('externalOrderId is already bound to a different order or mandate.')
      }
      if (current) {
        duplicate = true
        return current
      }
      return {
        fingerprint: evaluation.fingerprint,
        externalOrderId: evaluation.externalOrderId,
        executionId: evaluation.executionId,
        decisionHash: evaluation.decisionHash,
        decision: evaluation.decision,
        orderHash: evaluation.orderHash,
        mandateHash: evaluation.mandateHash,
        decidedAt: new Date().toISOString(),
        payer: clean(paidReq.payment?.payer, 96) || evaluation.signedOpen.signer.toLowerCase(),
        authoritySigner: clean(evaluation.mandate.authoritySigner, 80).toLowerCase(),
        market: {
          title: evaluation.signedOpen.marketTitle,
          url: evaluation.signedOpen.marketUrl,
          outcome: evaluation.signedOpen.outcome,
          tokenId: evaluation.signedOpen.tokenId,
        },
        order: {
          maker: clean(evaluation.signedOpen.order.maker, 80).toLowerCase(),
          signer: evaluation.signedOpen.signer.toLowerCase(),
          type: evaluation.signedOpen.orderType,
          maximumAmountUsdc: evaluation.amountUsdc,
          maximumPrice: evaluation.effectivePrice,
        },
        ...(paidReq.payment?.transaction ? { paymentTransaction: clean(paidReq.payment.transaction, 160) } : {}),
      }
    })
  } catch (error) {
    if (error instanceof ExternalOrderConflict) {
      return res.status(409).json({
        ok: false,
        decision: 'BLOCK',
        error: error.message,
        externalOrderId: evaluation.externalOrderId,
      })
    }
    throw error
  }
  await writeDurableJson(`polymarket-governed-execution:${record.executionId}`, record)
  if (evaluation.decision === 'APPROVE') {
    await appendTradeSignalEvent(buildGovernedTradeSignal({
      executionId: record.executionId,
      externalOrderId: record.externalOrderId,
      occurredAt: record.decidedAt,
      market: {
        venue: 'Polymarket',
        assetClass: 'prediction-market',
        marketTitle: record.market.title,
        marketUrl: record.market.url,
        outcome: record.market.outcome,
        tokenId: record.market.tokenId,
      },
      action: {
        side: 'BUY',
        orderType: record.order.type,
        maximumAmountUsdc: record.order.maximumAmountUsdc,
        maximumPrice: record.order.maximumPrice,
      },
      policy: {
        decisionHash: record.decisionHash,
        orderHash: record.orderHash,
        mandateHash: record.mandateHash,
        reasons: evaluation.reasons,
      },
    }))
  }

  return res.status(200).json({
    ok: true,
    service: 'PolyDesk Governed Market OPEN',
    policyVersion: 'polydesk-market-mandate-v1',
    mode: 'buyer-signed-direct-submit',
    decision: evaluation.decision,
    executionId: record.executionId,
    externalOrderId: record.externalOrderId,
    duplicate,
    decidedAt: record.decidedAt,
    amountUsdc: evaluation.amountUsdc,
    effectivePrice: evaluation.effectivePrice,
    reasons: evaluation.reasons,
    checks: evaluation.checks,
    mandate: evaluation.mandate,
    hashes: {
      order: record.orderHash,
      mandate: record.mandateHash,
      decision: record.decisionHash,
    },
    nextAction: evaluation.decision === 'APPROVE'
      ? {
          type: 'SUBMIT_EXACT_ORDER_LOCALLY',
          host: 'https://clob.polymarket.com',
          path: '/order',
          method: 'POST',
          orderPayload: evaluation.signedOpen.orderPayload,
          instruction: 'Generate the five buyer CLOB headers locally and submit this exact payload directly to Polymarket.',
          afterSubmission: {
            endpoint: '/api/polymarket-agent-flow/complete',
            required: ['executionId', 'orderId', 'transactionHash'],
            instruction: 'Request the completion message, sign it with the mandate authority, then replay it to receive the public verified receipt.',
          },
        }
      : null,
    safety: {
      deterministicPolicy: true,
      exactSignedOrderBound: true,
      externalOrderIdLocked: true,
      immediateOrderOnly: true,
      privateKeyReceived: false,
      clobSecretReceived: false,
      clobPassphraseReceived: false,
      submittedByPolyDesk: false,
      finalSignatureAuthority: 'Polymarket CLOB',
    },
    serviceAccess: paidReq.payment?.transaction
      ? {
          model: 'paid',
          network: 'X Layer',
          transaction: paidReq.payment.transaction,
        }
      : {
          model: 'free',
          provider: paidReq.access?.provider || 'OKX Marketplace',
        },
    ...(paidReq.payment?.transaction ? {
      paymentProof: {
        network: 'X Layer',
        transaction: paidReq.payment.transaction,
      },
    } : {}),
  })
}

type CompletionDependencies = {
  fetchReceipt: (transactionHash: string) => Promise<RecordValue | null>
  fetchTrades: (maker: string) => Promise<RecordValue[]>
  now: () => number
}

function env(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name], 400)
    if (value) return value
  }
  return ''
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return body
  } finally {
    clearTimeout(timer)
  }
}

const completionDependencies: CompletionDependencies = {
  fetchReceipt: async transactionHash => {
    const rpcUrl = env('POLYMARKET_RPC_URL', 'POLYGON_RPC_URL')
    if (!rpcUrl) throw new Error('POLYMARKET_RPC_URL or POLYGON_RPC_URL is required for completion proof.')
    const body = await fetchJson(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [transactionHash],
      }),
    })
    return isRecord(body) && isRecord(body.result) ? body.result : null
  },
  fetchTrades: async maker => {
    const body = await fetchJson(`${DATA_API_ORIGIN}/trades?user=${encodeURIComponent(maker)}&limit=100`)
    return Array.isArray(body) ? body.filter(isRecord) : []
  },
  now: () => Date.now(),
}

function exactHash(value: unknown) {
  const normalized = clean(value, 80).toLowerCase()
  return /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : ''
}

export async function verifyGovernedTradeCompletion(
  record: GovernedOpenRecord,
  input: RecordValue,
  dependencies: CompletionDependencies = completionDependencies,
) {
  if (record.receipt) return { ok: true as const, duplicate: true, receipt: record.receipt }
  if (record.decision !== 'APPROVE') {
    return { ok: false as const, status: 409, error: `Only an APPROVE execution can be completed; this execution is ${record.decision}.` }
  }
  const orderId = exactHash(input.orderId)
  const transactionHash = exactHash(input.transactionHash)
  const completionSignature = clean(input.completionSignature, 180)
  if (!orderId || !transactionHash) {
    return { ok: false as const, status: 400, error: 'orderId and transactionHash must be 32-byte hex values.' }
  }
  const completionMessage = governedTradeCompletionMessage(
    record.executionId,
    record.externalOrderId,
    orderId,
    transactionHash,
  )
  if (!completionSignature) {
    return {
      ok: false as const,
      status: 428,
      signatureRequired: true,
      authoritySigner: record.authoritySigner,
      completionMessage,
      signingMethod: 'personal_sign',
      next: 'Sign completionMessage with authoritySigner and replay with completionSignature.',
    }
  }
  let recovered = ''
  try {
    recovered = verifyMessage(completionMessage, completionSignature).toLowerCase()
  } catch {
    return { ok: false as const, status: 400, error: 'completionSignature is invalid.' }
  }
  if (recovered !== record.authoritySigner) {
    return { ok: false as const, status: 403, error: 'completionSignature does not match the mandate authority.' }
  }

  const chainReceipt = await dependencies.fetchReceipt(transactionHash)
  if (!chainReceipt || clean(chainReceipt.status, 16).toLowerCase() !== '0x1') {
    return { ok: false as const, status: 409, error: 'Polygon transaction is missing or did not succeed.' }
  }
  const exchange = clean(chainReceipt.to, 80).toLowerCase()
  if (!POLYGON_EXCHANGES.has(exchange)) {
    return { ok: false as const, status: 409, error: 'Polygon transaction did not execute through an allowlisted Polymarket CTF Exchange V2 contract.' }
  }
  if (!JSON.stringify(chainReceipt).toLowerCase().includes(orderId.slice(2))) {
    return { ok: false as const, status: 409, error: 'The supplied Polymarket order ID was not found in the Polygon receipt.' }
  }
  let matchedTrades: RecordValue[] = []
  for (let attempt = 0; attempt < 4 && !matchedTrades.length; attempt += 1) {
    const trades = await dependencies.fetchTrades(record.order.maker)
    matchedTrades = trades.filter(item => (
      exactHash(item.transactionHash) === transactionHash
      && clean(item.asset, 120) === record.market.tokenId
      && clean(item.side, 12).toUpperCase() === 'BUY'
    ))
    if (!matchedTrades.length && attempt < 3) await new Promise(resolve => setTimeout(resolve, 750))
  }
  if (!matchedTrades.length) {
    return { ok: false as const, status: 409, error: 'No exact public Polymarket BUY trade matched this transaction, wallet, and outcome token.' }
  }
  const fills = matchedTrades.map(trade => ({
    size: Number(trade.size),
    price: Number(trade.price),
  }))
  const fillSize = fills.reduce((total, fill) => total + fill.size, 0)
  const fillAmountUsdc = Number(fills.reduce((total, fill) => total + fill.size * fill.price, 0).toFixed(6))
  const fillPrice = Number((fillAmountUsdc / fillSize).toFixed(6))
  if (
    !Number.isFinite(fillSize) || fillSize <= 0
    || !Number.isFinite(fillPrice) || fillPrice <= 0 || fillPrice >= 1
    || fills.some(fill => !Number.isFinite(fill.size) || fill.size <= 0 || !Number.isFinite(fill.price) || fill.price <= 0 || fill.price >= 1)
    || fills.some(fill => fill.price > Number(record.order.maximumPrice) + 1e-9)
    || fillAmountUsdc > Number(record.order.maximumAmountUsdc) + 0.000001
  ) {
    return { ok: false as const, status: 409, error: 'The public fill does not satisfy the stored price and spend bounds.' }
  }

  const receipt: GovernedTradeReceipt = {
    receiptVersion: 'polydesk-governed-trade-receipt-v1',
    executionId: record.executionId,
    externalOrderId: record.externalOrderId,
    status: 'VERIFIED_FILLED',
    verifiedAt: new Date(dependencies.now()).toISOString(),
    market: record.market,
    execution: {
      orderId,
      transactionHash,
      exchange,
      side: 'BUY',
      fillSize,
      fillPrice,
      fillAmountUsdc,
    },
    policy: {
      decision: record.decision,
      decisionHash: record.decisionHash,
      orderHash: record.orderHash,
      mandateHash: record.mandateHash,
    },
    proofs: {
      polygonReceiptVerified: true,
      allowedExchangeVerified: true,
      orderIdInReceipt: true,
      publicTradeMatched: true,
      buyerAuthoritySignatureVerified: true,
    },
  }
  return { ok: true as const, duplicate: false, receipt }
}

export async function polymarketGovernedTradeCompleteHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  if (!governedOpenReady()) return res.status(503).json({ ok: false, error: 'Durable execution storage is not configured.' })
  const body = isRecord(req.body) ? req.body : {}
  const executionId = clean(body.executionId, 80)
  if (!/^pex_[a-f0-9]{24}$/.test(executionId)) {
    return res.status(400).json({ ok: false, error: 'A valid executionId is required.' })
  }
  const key = `polymarket-governed-execution:${executionId}`
  const record = await readDurableJson<GovernedOpenRecord>(key)
  if (!record) return res.status(404).json({ ok: false, error: 'Governed execution was not found.' })
  const result = await verifyGovernedTradeCompletion(record, body)
  if (!result.ok) {
    const { status, ...responseBody } = result
    return res.status(status).json(responseBody)
  }
  if (!result.duplicate) {
    record.receipt = result.receipt
    await writeDurableJson(key, record)
    await writeDurableJson(`polymarket-governed-receipt:${executionId}`, result.receipt)
  }
  await appendTradeSignalEvent(buildVerifiedExecutionSignal({
    executionId: record.executionId,
    externalOrderId: record.externalOrderId,
    occurredAt: result.receipt.verifiedAt,
    market: {
      venue: 'Polymarket',
      assetClass: 'prediction-market',
      marketTitle: record.market.title,
      marketUrl: record.market.url,
      outcome: record.market.outcome,
      tokenId: record.market.tokenId,
    },
    action: {
      side: 'BUY',
      orderType: record.order.type,
      maximumAmountUsdc: record.order.maximumAmountUsdc,
      maximumPrice: record.order.maximumPrice,
    },
    policy: {
      decisionHash: record.decisionHash,
      orderHash: record.orderHash,
      mandateHash: record.mandateHash,
      reasons: [],
    },
    execution: {
      status: result.receipt.status,
      orderId: result.receipt.execution.orderId,
      transactionHash: result.receipt.execution.transactionHash,
      fillSize: result.receipt.execution.fillSize,
      fillPrice: result.receipt.execution.fillPrice,
      fillAmountUsdc: result.receipt.execution.fillAmountUsdc,
    },
  }))
  return res.status(200).json({ ok: true, duplicate: result.duplicate, receipt: result.receipt })
}

export async function polymarketGovernedTradeReceiptHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  if (!governedOpenReady()) return res.status(503).json({ ok: false, error: 'Durable execution storage is not configured.' })
  const executionId = clean(req.params.executionId, 80)
  const receipt = await readDurableJson<GovernedTradeReceipt>(`polymarket-governed-receipt:${executionId}`)
  if (!receipt) return res.status(404).json({ ok: false, error: 'Verified trade receipt was not found.' })
  res.setHeader('Cache-Control', 'public, max-age=60')
  return res.status(200).json({ ok: true, receipt })
}
