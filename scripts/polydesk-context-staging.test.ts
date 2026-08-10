import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import {
  createPolydeskContextStagingApp,
  POLYDESK_CONTEXT_STAGING_HOST,
  POLYDESK_CONTEXT_STAGING_PATH,
  polydeskContextStagingPort,
  requirePolydeskContextStaging,
} from '../api/polydesk-context-staging.js'

test('requires an explicit staging-only gate and validates the loopback port', () => {
  assert.throws(() => requirePolydeskContextStaging({}), /staging is disabled/)
  assert.doesNotThrow(() => requirePolydeskContextStaging({
    POLYDESK_MARKET_CONTEXT_STAGING_ENABLED: 'true',
  }))
  assert.equal(polydeskContextStagingPort({}), 4317)
  assert.throws(() => polydeskContextStagingPort({
    POLYDESK_MARKET_CONTEXT_STAGING_PORT: '80',
  }), /port is invalid/)
})

test('serves only health and the injected context handler on loopback', async t => {
  const app = createPolydeskContextStagingApp((_request, response) => {
    response.status(200).json({ ok: true, data: { fixture: true } })
  })
  const server = app.listen(0, POLYDESK_CONTEXT_STAGING_HOST)
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const port = (server.address() as AddressInfo).port
  const origin = 'http://' + POLYDESK_CONTEXT_STAGING_HOST + ':' + port

  const health = await fetch(origin + '/health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), {
    ok: true,
    service: 'polydesk-context-staging',
    readOnly: true,
    production: false,
  })
  const context = await fetch(origin + POLYDESK_CONTEXT_STAGING_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(context.status, 200)
  assert.deepEqual(await context.json(), { ok: true, data: { fixture: true } })
  assert.equal((await fetch(origin + '/api/health')).status, 404)
})
