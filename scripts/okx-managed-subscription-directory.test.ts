import assert from 'node:assert/strict'
import test from 'node:test'
import { exactManagedSubscriptions } from '../api/okx-managed-subscription-directory.js'
import { MANAGED_AGENT_SERVICE_ID } from '../api/polydesk-managed-agent-subscription.js'

const active = {
  ok: true,
  data: [
    { jobId: '0x' + 'a'.repeat(64), subEndTime: 1790236860, status: 1 },
    { jobId: '0x' + 'b'.repeat(64), subEndTime: 1790236860, status: 1 },
  ],
}

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
