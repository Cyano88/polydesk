export function publicDeliveryStatus(status: string, response: unknown) {
  const evidence = (response as { decision?: { evidence?: { researchStatus?: string } } } | null)?.decision?.evidence
  const degraded = status === 'completed' && evidence?.researchStatus === 'UNAVAILABLE'
  return {
    // Preserve the v1 transport lifecycle for existing polling clients.
    status,
    deliveryStatus: degraded ? 'degraded' : status,
    researchStatus: evidence?.researchStatus ?? null,
    additionalPaymentRequired: false,
  }
}

// Guidance stays outside the immutable research result and grants no authority.
export function paidDeliveryGuidance(status: string, response: unknown, now = Date.now()) {
  const result = response as { action?: string; decision?: { decision?: string; expiresAt?: string; evidence?: { researchStatus?: string } } } | null
  const hasResult = (status === 'completed' || status === 'failed') && result?.action === 'ANALYZE'
  const degraded = result?.decision?.evidence?.researchStatus === 'UNAVAILABLE'
  const canRequestPreview = status === 'completed' && hasResult && !degraded
    && result?.decision?.decision === 'APPROVE' && Date.parse(result.decision.expiresAt || '') > now
  return {
    paymentStatus: 'settled', retryPayment: false, tradeAuthorized: false,
    reviewMeaning: 'Review acknowledges research only. Payment is already settled; review does not release escrow or authorize trading.',
    resultLocation: hasResult ? 'result' : null,
    scoreMeaning: 'Risk-adjusted opportunity screening, not a win probability or profit forecast. Review evidence and unresolved gaps.',
    followUpPrompts: hasResult
      ? ['Show results', 'Show evidence', 'Show original JSON',
        ...(status === 'failed' || degraded ? ['Review delivery issue'] : ['Review this research']),
        ...(canRequestPreview ? ['Preview this trade'] : []), 'Analyze another market']
      : status === 'failed' ? ['Check delivery status', 'Review delivery issue'] : ['Check delivery status'],
    nextStep: 'Review findings before requesting a preview. Fresh account, balance, fee and price checks and separate exact buyer approval are required for execution. New research may require a separately approved fee.',
  }
}
