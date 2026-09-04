import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogAndStatusManagedSubscriptions, exactManagedSubscriptions } from '../api/okx-managed-subscription-directory.js'
import { MANAGED_AGENT_SERVICE_ID } from '../api/polydesk-managed-agent-subscription.js'

const active = {
  ok: true,
  data: [
    { jobId: '0x' + 'a'.repeat(64), subEndTime: 1790236860, status: 1 },
    { jobId: '0x' + 'b'.repeat(64), subEndTime: 1790236860, status: 1 },
  ],
}
const singleActive = { ok: true, data: [active.data[0]] }

test('intersects both official directories and requires exact provider and immutable service id', () => {
  const provider = {
    ok: true,
    data: { list: [
      { jobId: '0x' + 'a'.repeat(64), providerAgentId: '5427', buyerAgentId: '1791', serviceId: MANAGED_AGENT_SERVICE_ID, status: 1, subStartTime: 1787558460, subEndTime: 1790236860 },
      { jobId: '0x' + 'b'.repeat(64), providerAgentId: '5427', buyerAgentId: '1792', serviceId: 'c387e35b-2a5c-44de-ac80-c1521385e93c', title: 'PolyDesk Trading Membership', status: 1, subStartTime: 1787558460, subEndTime: 1790236860 },
      { jobId: '0x' + 'c'.repeat(64), providerAgentId: '5427', buyerAgentId: '1793', serviceId: MANAGED_AGENT_SERVICE_ID, status: 1, subStartTime: 1787558460, subEndTime: 1790236860 },
    ] },
  }
  const result = exactManagedSubscriptions(active, provider)
  assert.equal(result.length, 1)
  assert.equal(result[0].buyerAgentId, '1791')
})

test('rejects partial or malformed official snapshots', () => {
  assert.throws(() => exactManagedSubscriptions({ ok: false }, { ok: true, data: { list: [] } }), /active subscription response/)
  assert.throws(() => exactManagedSubscriptions({ ok: true, data: [] }, { ok: true, data: {} }), /provider subscription response/)
})

test('does not convert a device/provider identity mismatch into an empty authoritative snapshot', () => {
  assert.throws(() => exactManagedSubscriptions(active, {
    ok: true,
    data: { list: [{
      jobId: '0x' + 'a'.repeat(64), providerAgentId: '10764', buyerAgentId: '1791',
      serviceId: MANAGED_AGENT_SERVICE_ID, status: 1, subStartTime: 1787558460, subEndTime: 1790236860,
    }] },
  }), /directories disagree/)
})

test('uses the final managed listing name for new subscriptions', () => {
  const jobId = '0x' + 'a'.repeat(64)
  const services = { ok: true, data: { list: [{
    id: 38496,
    serviceId: MANAGED_AGENT_SERVICE_ID,
    serviceName: 'Managed Polymarket Agent',
    subscription: [{ fee: '5', interval: 'month' }],
  }] } }
  const statuses = new Map([[jobId, `Task status: accepted\n  jobId:    ${jobId}\n  title:    Managed Polymarket Agent\n  budget:   0.00001 USDT\n  user:    8178\n  asp: 5427\n`]])
  const result = catalogAndStatusManagedSubscriptions(singleActive, services, statuses)
  assert.equal(result.length, 1)
  assert.equal(result[0].buyerAgentId, '8178')
  assert.equal(result[0].serviceId, MANAGED_AGENT_SERVICE_ID)
  assert.equal(catalogAndStatusManagedSubscriptions(singleActive, { ok: true, data: [services.data] }, statuses).length, 1)
})

test('keeps legacy in-flight subscription titles compatible during migration', () => {
  const jobId = '0x' + 'a'.repeat(64)
  const services = { ok: true, data: { list: [{
    id: 38496,
    serviceId: MANAGED_AGENT_SERVICE_ID,
    serviceName: 'Managed Polymarket Agent',
    subscription: [{ fee: '5', interval: 'month' }],
  }] } }
  const statuses = new Map([[jobId, `Task status: accepted\njobId: ${jobId}\ntitle: DACS subscription check - PolyDesk Trading Membership\nuser: 8178\nasp: 5427`]])
  assert.equal(catalogAndStatusManagedSubscriptions(singleActive, services, statuses).length, 1)
})

test('status fallback refuses ambiguity or a buyer job not bound to PolyDesk', () => {
  const jobId = '0x' + 'a'.repeat(64)
  const exactService = { id: 38496, serviceId: MANAGED_AGENT_SERVICE_ID, serviceName: 'Managed Polymarket Agent', subscription: [{}] }
  const goodStatus = `Task status: accepted\njobId: ${jobId}\ntitle: Managed Polymarket Agent\nuser: 8178\nasp: 5427`
  assert.throws(() => catalogAndStatusManagedSubscriptions(singleActive, { ok: true, data: { list: [exactService, { ...exactService, id: 999 }] } }, new Map([[jobId, goodStatus]])), /exactly one/)
  assert.throws(() => catalogAndStatusManagedSubscriptions(singleActive, { ok: true, data: { list: [exactService] } }, new Map([[jobId, goodStatus.replace('asp: 5427', 'asp: 10764')]])), /did not bind/)
  assert.throws(() => catalogAndStatusManagedSubscriptions(singleActive, { ok: true, data: { list: [exactService] } }, new Map([[jobId, goodStatus.replace('Managed Polymarket Agent', 'Fake Managed Polymarket Agent Offer')]])), /did not bind/)
})
