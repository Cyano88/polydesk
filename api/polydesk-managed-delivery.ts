import type { ManagedSubscriptionIdentity } from './polydesk-managed-agent-subscription.js'
export type DeliveryItem = { id: string; text: string; kind: 'setup' | 'alert'; createdAt: string }
type Row = Record<string, any>
export function managedDeliveryItems(s: ManagedSubscriptionIdentity, row: Row | undefined, alerts: Row[], now = Date.now()): DeliveryItem[] {
  if (s.status !== 'active' || Date.parse(s.periodEndAt) <= now) return []
  if (row && String(row.buyer_agent_id) !== s.buyerAgentId) throw new Error('Managed delivery buyer mismatch.')
  if (row && (row.status !== 'active' || Date.parse(row.period_end_at) <= now)) return []
  const setup = !row ? 'PREFERENCES_REQUIRED' : row.alert_email_verified !== true ? 'EMAIL_VERIFICATION_REQUIRED' : row.monitoring_enabled !== true ? 'MONITORING_PAUSED' : null
  if (setup === 'MONITORING_PAUSED') return []
  if (setup) {
    const prompts = setup === 'PREFERENCES_REQUIRED'
      ? ['Which public wallet should I monitor?', 'Which email should receive notifications?', 'Choose alert thresholds and a daily, weekly or disabled summary schedule.']
      : ['Verify your notification email, then reply Check monitoring status.']
    return [{ id: 'setup:' + setup, kind: 'setup', createdAt: s.periodStartAt, text: JSON.stringify({ schema: 'polydesk-managed-delivery-v1', kind: 'setup', state: setup, jobId: s.jobId,
      summary: 'Your subscription is active, but portfolio monitoring setup is incomplete. No portfolio analysis or trade has been performed.',
      followUpPrompts: prompts, tradeAuthorized: false, orderSubmitted: false }) }]
  }
  return alerts.filter(a => Number.isSafeInteger(Number(a.id)) && Number(a.id) > 0 && Number.isFinite(Date.parse(a.created_at))
    && Date.parse(a.created_at) >= Date.parse(s.periodStartAt) && Date.parse(a.created_at) > now - 86400000 && Date.parse(a.created_at) <= now
    && typeof a.title === 'string' && typeof a.body === 'string').map(a => {
      const text = JSON.stringify({ schema: 'polydesk-managed-delivery-v1', kind: 'monitoring-result', jobId: s.jobId,
        observedAt: new Date(a.created_at).toISOString(), alertType: a.alert_type, title: a.title, summary: a.body,
        provenance: 'Stored PolyDesk portfolio monitoring event; values are observations at the stated time, not a current executable quote.',
        tradeAuthorized: false, orderSubmitted: false, followUpPrompts: ['Show monitoring status', 'Review this finding', 'Request an exact trade preview', 'Change alerts or pause monitoring'] })
      if (text.length > 12000) throw new Error('Monitoring event exceeds the delivery limit; operator review required.')
      return { id: 'alert:' + a.id, kind: 'alert' as const, createdAt: new Date(a.created_at).toISOString(), text }
    })
}
