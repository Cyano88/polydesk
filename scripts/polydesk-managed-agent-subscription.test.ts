import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  MANAGED_AGENT_LISTING_ID,
  MANAGED_AGENT_SCHEMA,
  MANAGED_AGENT_SERVICE_ID,
  managedMonitoringEnabled,
  plannedManagedLifecycleEmails,
  validateManagedPreferences,
  validateManagedSubscriptionIdentity,
} from '../api/polydesk-managed-agent-subscription.js'

const subscription = {
  jobId: 'managed_job_123',
  providerAgentId: '5427',
  serviceListingId: MANAGED_AGENT_LISTING_ID,
  serviceId: MANAGED_AGENT_SERVICE_ID,
  buyerAgentId: '9001',
  status: 'active',
  periodStartAt: '2026-09-01T00:00:00.000Z',
  periodEndAt: '2026-10-01T00:00:00.000Z',
}

test('locks enrollment to the immutable PolyDesk managed service identity', () => {
  assert.equal(validateManagedSubscriptionIdentity(subscription).serviceId, MANAGED_AGENT_SERVICE_ID)
  assert.throws(() => validateManagedSubscriptionIdentity({ ...subscription, serviceId: 'c387e35b-2a5c-44de-ac80-c1521385e93c' }), /registered managed-agent service/)
  assert.throws(() => validateManagedSubscriptionIdentity({ ...subscription, serviceListingId: '38484' }), /managed-agent listing/)
})

test('normalizes safe portfolio preferences and rejects secrets', () => {
  const preferences = validateManagedPreferences({
    address: '0x72e367a0d39d52FBaC44bF1C8DFb48c7322eA30c',
    email: 'Trader@Example.com',
    integrationSource: 'okx.ai',
    lossThresholdPercent: 50,
    profitThresholdPercent: 50,
    newPositionAlertsEnabled: true,
    resolvedAlertsEnabled: true,
    claimableAlertsEnabled: true,
    digestFrequency: 'daily',
    digestTimezone: 'Africa/Lagos',
    digestHourLocal: 8,
    digestWeekday: 1,
  })
  assert.equal(preferences.email, 'trader@example.com')
  assert.equal(preferences.integrationSource, 'okx-ai')
  assert.throws(() => validateManagedPreferences({ ...preferences, privateKey: 'forbidden' }), /Unsupported preferences field/)
})

test('monitoring fails closed for unverified, paused, cancelled, and expired subscriptions', () => {
  const now = Date.parse('2026-09-04T00:00:00.000Z')
  assert.equal(managedMonitoringEnabled({ status: 'active', emailVerified: true, periodEndAt: '2026-10-01T00:00:00.000Z', now }), true)
  assert.equal(managedMonitoringEnabled({ status: 'active', emailVerified: false, periodEndAt: '2026-10-01T00:00:00.000Z', now }), false)
  assert.equal(managedMonitoringEnabled({ status: 'paused', emailVerified: true, periodEndAt: '2026-10-01T00:00:00.000Z', now }), false)
  assert.equal(managedMonitoringEnabled({ status: 'cancelled', emailVerified: true, periodEndAt: '2026-10-01T00:00:00.000Z', now }), false)
  assert.equal(managedMonitoringEnabled({ status: 'active', emailVerified: true, periodEndAt: '2026-09-03T00:00:00.000Z', now }), false)
})

test('plans trial ending, trial expiry, and renewal emails from authoritative periods', () => {
  const trial = {
    ...subscription,
    periodStartAt: '2026-09-01T00:00:00.000Z',
    periodEndAt: '2026-09-04T00:00:00.000Z',
  }
  assert.deepEqual(plannedManagedLifecycleEmails({
    previous: trial,
    current: trial,
    now: Date.parse('2026-09-03T12:00:00.000Z'),
  }), ['trial_ending'])
  assert.deepEqual(plannedManagedLifecycleEmails({
    previous: trial,
    now: Date.parse('2026-09-04T00:01:00.000Z'),
  }), ['trial_expired'])
  assert.deepEqual(plannedManagedLifecycleEmails({
    previous: trial,
    current: {
      ...trial,
      periodStartAt: '2026-09-04T00:00:00.000Z',
      periodEndAt: '2026-10-04T00:00:00.000Z',
    },
    now: Date.parse('2026-09-04T00:01:00.000Z'),
  }), ['renewal_success'])
  assert.deepEqual(plannedManagedLifecycleEmails({
    previous: subscription,
    now: Date.parse('2026-10-01T00:01:00.000Z'),
  }), [])
})

test('lifecycle emails are idempotent, retryable, verified, and origin-aware', () => {
  const source = readFileSync(new URL('../api/polydesk-managed-agent-subscription.ts', import.meta.url), 'utf8')
  const schema = readFileSync(new URL('../api/polymarket-portfolio.ts', import.meta.url), 'utf8')
  assert.match(schema, /primary key \(job_id, event_key\)/)
  assert.match(source, /on conflict \(job_id, event_key\) do nothing/)
  assert.match(source, /status in \('pending','failed','sending'\) and e\.attempts < 5/)
  assert.match(source, /next_attempt_at=now\(\) \+ interval '10 minutes'/)
  assert.match(source, /event_type='trial_ending' and period_end_at <= now\(\)/)
  assert.match(source, /s\.alert_email_verified=true/)
  assert.match(source, /polymarketPortfolioDestination/)
  assert.match(source, /action === 'payment_failed'/)
})

test('portfolio monitor gates every periodic path and rehydrates public watched addresses', () => {
  const source = readFileSync(new URL('../api/polymarket-portfolio.ts', import.meta.url), 'utf8')
  assert.match(source, /add column if not exists monitoring_enabled boolean not null default true/)
  assert.match(source, /where s\.digest_frequency in \('daily', 'weekly'\)\s+and s\.monitoring_enabled = true/)
  assert.match(source, /if \(settingsRow\.monitoring_enabled === false\) return 0/)
  assert.ok((source.match(/coalesce\(p\.watched_address, p\.deposit_wallet_address, p\.trading_address, p\.polymarket_address\)/g) ?? []).length >= 8)
  assert.match(source, /where s\.resolution_status = 'open'\s+and a\.monitoring_enabled = true/)
})

test('request schema is stable', () => {
  assert.equal(MANAGED_AGENT_SCHEMA, 'polydesk-managed-agent-subscription-v1')
})
