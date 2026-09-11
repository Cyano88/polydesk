export type BaseIndexingAcknowledgement = {
  status: 'success' | 'processing' | 'rejected' | 'unknown'
  reason: string
  resource: string
  observedAt: string
}
const resource = 'https://polydesk.trade/api/x402/base/polymarket-smart-trader'
// Store only the Bazaar status and a short machine-readable reason. Never persist
// raw facilitator headers, signed payloads, arbitrary nested data or prose that
// might echo payment credentials. Missing metadata cannot imply indexing success.
export function baseIndexingAcknowledgement(extensions: unknown, now = new Date().toISOString()): BaseIndexingAcknowledgement {
  const unknown = (reason: string): BaseIndexingAcknowledgement => ({status:'unknown',reason,resource,observedAt:now})
  if (extensions === undefined || extensions === null) return unknown('acknowledgement_absent')
  if (typeof extensions !== 'object' || Array.isArray(extensions)) return unknown('acknowledgement_malformed')
  const bazaar = (extensions as Record<string, unknown>).bazaar
  if (bazaar === undefined) return unknown('bazaar_acknowledgement_absent')
  if (!bazaar || typeof bazaar !== 'object' || Array.isArray(bazaar)) return unknown('bazaar_acknowledgement_malformed')
  const {status,rejectedReason} = bazaar as Record<string, unknown>
  if (status !== 'success' && status !== 'processing' && status !== 'rejected') return unknown('bazaar_status_unrecognized')
  const reason = status !== 'rejected' ? 'none' : typeof rejectedReason === 'string'
    && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$/.test(rejectedReason)
    && !/(?:0x[a-f0-9]{16}|bearer|secret|signature|eyJ)/i.test(rejectedReason)
    ? rejectedReason : 'rejection_reason_absent_or_withheld'
  return {status,reason,resource,observedAt:now}
}
