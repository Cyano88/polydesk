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
