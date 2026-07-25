import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { AgentActivity, AgentActivityProof } from '../api/agent-activity.ts'
import { authorizedLpScoutReceipt } from '../api/lp-scout-access.ts'
import {
  canonicalScoutServiceUrl,
  hasIntactAttachedPaymentProof,
  isStoredPolymarketScoutActivity,
  isTrustedLegacyHashPayLinkScout,
} from '../api/zeroscout-polymarket-brief.ts'

function paymentProof(serviceUrl: string): AgentActivityProof {
  const proof = {
    kind: 'circle_gateway_x402' as const,
    provider: 'Hash PayLink · Circle Gateway x402',
    service: 'polymarket-lp-scout',
    buyerAgent: 'polydesk-agent',
    sellerAgent: 'polydesk',
    payer: '0x1111111111111111111111111111111111111111',
    amount: '0.01 USDC',
    network: 'arc',
    transaction: `0x${'2'.repeat(64)}`,
    serviceUrl,
    receiptUrl: 'https://app.hashpaylink.com/pay/a/chk_12345678?attempt=pat_1234567890abcdef12345678',
    generatedAt: new Date(0).toISOString(),
  }
  const proofHash = crypto.createHash('sha256').update(JSON.stringify({
    kind: proof.kind,
    provider: proof.provider,
    service: proof.service,
    buyerAgent: proof.buyerAgent,
    sellerAgent: proof.sellerAgent,
    payer: proof.payer,
    amount: proof.amount,
    network: proof.network,
    transaction: proof.transaction,
    serviceUrl: proof.serviceUrl,
  })).digest('hex')
  return { ...proof, proofHash }
}

function scout(serviceUrl: string, proof = paymentProof(serviceUrl)): AgentActivity {
  return {
    id: 'scout-result',
    agentSlug: 'polydesk-agent',
    type: 'scout_returned',
    title: 'PolyDesk LP Scout result returned',
    direction: 'result',
    serviceUrl,
    result: { summary: 'Saved result', receiptActivityId: 'receipt-activity-1234' },
    proof,
    createdAt: 1,
  }
}

test('paid LP Scout access requires the receipt capability linked to that report', () => {
  const savedScout = scout('/api/x402/polymarket-scout?requestId=lps_1234567890123456')
  const receipt: AgentActivity = {
    id: 'receipt-activity-1234',
    agentSlug: savedScout.agentSlug,
    type: 'x402_spent',
    title: 'PolyDesk LP Scout payment',
    createdAt: 1,
  }
  assert.equal(authorizedLpScoutReceipt(savedScout, [receipt], receipt.id)?.id, receipt.id)
  assert.equal(authorizedLpScoutReceipt(savedScout, [receipt], 'receipt-activity-wrong'), undefined)
  assert.equal(authorizedLpScoutReceipt(savedScout, [{ ...receipt, type: 'funded' }], receipt.id), undefined)
})

test('new LP Scout results remain eligible only on the PolyDesk service path', () => {
  const activity = scout('/api/x402/polymarket-scout?requestId=lps_1234567890123456')
  assert.equal(isStoredPolymarketScoutActivity(activity), true)
  assert.equal(hasIntactAttachedPaymentProof(activity), true)
  assert.equal(canonicalScoutServiceUrl(activity), activity.serviceUrl)

  assert.equal(isStoredPolymarketScoutActivity({
    ...activity,
    serviceUrl: 'https://attacker.example/api/x402/polymarket-scout',
  }), false)
})

test('the previously saved Hash PayLink handoff can be recovered without weakening origin checks', () => {
  const legacyUrl = 'https://app.hashpaylink.com/api/v2/checkouts/agent?id=chk_12345678&attempt=pat_1234567890abcdef12345678'
  const activity = scout(legacyUrl)
  assert.equal(isTrustedLegacyHashPayLinkScout(activity), true)
  assert.equal(isStoredPolymarketScoutActivity(activity), true)
  assert.equal(hasIntactAttachedPaymentProof(activity), true)
  assert.equal(canonicalScoutServiceUrl(activity), '/api/x402/polymarket-scout')

  const tampered = { ...activity, proof: { ...activity.proof!, amount: '5 USDC' } }
  assert.equal(hasIntactAttachedPaymentProof(tampered), false)

  const untrusted = scout('https://attacker.example/api/v2/checkouts/agent')
  assert.equal(isTrustedLegacyHashPayLinkScout(untrusted), false)
  assert.equal(isStoredPolymarketScoutActivity(untrusted), false)
})

test('paid fulfillment records a dedicated receipt activity before ZeroScout is queued', () => {
  const source = readFileSync(new URL('../api/x402-polymarket-scout.ts', import.meta.url), 'utf8')
  const paymentIndex = source.indexOf("type: 'x402_spent'")
  const scoutIndex = source.indexOf("type: 'scout_returned'", paymentIndex)
  const queueIndex = source.indexOf("type: 'scout_verification_queued'", scoutIndex)
  assert.ok(paymentIndex > 0)
  assert.ok(scoutIndex > paymentIndex)
  assert.ok(queueIndex > scoutIndex)
  assert.match(source, /receiptActivityId: paidActivity\?\.id/)
  assert.match(source, /report\/lp-scout\/.*receipt=/)
})

test('ZeroScout finalization is single-flight for each saved scout activity', () => {
  const source = readFileSync(new URL('../api/zeroscout-polymarket-brief.ts', import.meta.url), 'utf8')
  assert.match(source, /const pendingZeroScoutBriefs = new Map/)
  assert.match(source, /const key = `\$\{normalizeActivitySlug\(agentSlugInput\)\}:\$\{String\(activityIdInput/)
  assert.match(source, /if \(pending\) return pending/)
  assert.match(source, /pendingZeroScoutBriefs\.delete\(key\)/)
})

test('Desk Agent retries ZeroScout against the same saved activity without creating a checkout', () => {
  const source = readFileSync(new URL('../src/pages/TelegramPaymentLinks.tsx', import.meta.url), 'utf8')
  assert.match(source, /if \(!state\.zeroScout\)/)
  assert.doesNotMatch(source, /if \(!state\.zeroScout && !state\.failedVerification\)/)
  assert.match(source, /body: JSON\.stringify\(\{ agentSlug: requestedAgentSlug, activityId: lpScoutActivityId \}\)/)
  assert.match(source, /if \(state\.zeroScout \|\| verificationRetryError\) break/)
})
