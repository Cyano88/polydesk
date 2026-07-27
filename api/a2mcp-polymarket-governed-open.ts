import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { verifyMessage } from 'ethers'
import { hasRenderDurableStore, mutateDurableJson } from './render-durable-store.js'
import { validateSignedOpenInput } from './a2mcp-polymarket-signed-open.js'

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
}

class ExternalOrderConflict extends Error {}

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
  const paidReq = req as Request & { payment?: { verified?: boolean; payer?: string; transaction?: string } }
  if (paidReq.payment?.verified !== true) {
    return res.status(403).json({ ok: false, error: 'A verified OKX service payment is required.' })
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
        payer: clean(paidReq.payment?.payer, 96) || 'okx-buyer',
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
    paymentProof: {
      network: 'X Layer',
      transaction: paidReq.payment?.transaction,
    },
  })
}
