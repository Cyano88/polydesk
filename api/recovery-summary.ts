import type { executeSettledSmartTraderDelivery } from './polymarket-smart-trader.js'

export function recoverySummary(delivery: Awaited<ReturnType<typeof executeSettledSmartTraderDelivery>>) {
  const result = delivery.result
  const decision = result?.ok && result.data.action === 'ANALYZE' ? result.data.decision : null
  return {
    ok: Boolean(result?.ok),
    attemptCount: delivery.attemptCount,
    maximumAttempts: delivery.maximumAttempts,
    deliveryStatus: decision ? decision.evidence.researchStatus === 'UNAVAILABLE' ? 'degraded' : 'completed' : 'failed',
    decision: decision?.decision ?? null,
    decisionId: decision?.decisionId ?? null,
    researchStatus: decision?.evidence.researchStatus ?? null,
    additionalPaymentRequired: false,
    error: !result ? 'No delivery attempt was executed.' : !result.ok ? result.error : null,
  }
}
