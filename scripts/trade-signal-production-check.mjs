import assert from 'node:assert/strict'

const origin = String(process.env.POLYDESK_SIGNAL_ORIGIN || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/+$/, '')

async function readJson(path) {
  const response = await fetch(`${origin}${path}`, { headers: { accept: 'application/json' } })
  const body = await response.json().catch(() => null)
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`)
  assert.ok(body && typeof body === 'object', `${path} did not return JSON`)
  return body
}

const health = await readJson('/api/health')
assert.equal(health.ok, true, 'PolyDesk health is not OK')

const feed = await readJson('/api/trade-signals?limit=5')
assert.equal(feed.ok, true, 'Trade signal feed is not OK')
assert.equal(feed.schema, 'polydesk-trade-signal-outbox-v1')
assert.ok(Array.isArray(feed.events), 'Trade signal feed events must be an array')
assert.equal(feed.integration?.okxLiveSignals, 'pending-schema')

for (const event of feed.events) {
  assert.equal(event.schema, 'polydesk-trade-signal-v1')
  assert.match(event.eventId, /^pds_[a-f0-9]{24}$/)
  assert.match(event.signalId, /^polydesk:pex_[a-f0-9]{24}$/)
  assert.ok(['signal.created', 'execution.verified'].includes(event.eventType))
  assert.equal(event.producer?.agent, 'PolyDesk')
  assert.equal(event.instrument?.venue, 'Polymarket')
  assert.equal(event.instrument?.assetClass, 'prediction-market')
  assert.equal(event.action?.side, 'BUY')
  assert.equal(event.policy?.decision, 'APPROVE')
  assert.equal(event.delivery?.okxLiveSignals, 'pending-schema')
  assert.equal('privateKey' in event, false)
  assert.equal('clobSecret' in event, false)
  assert.equal('clobPassphrase' in event, false)
}

console.log(`PASS PolyDesk signal feed readiness at ${origin} (${feed.events.length} event${feed.events.length === 1 ? '' : 's'})`)
