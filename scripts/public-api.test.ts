import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { createPublicApiRouter, openapi } from '../api/public-api.js'
import { discoverPolymarket } from '../api/polymarket-discover.js'

async function fixture(run: (url: string, calls: () => number) => Promise<void>, fail = false) {
  let calls = 0
  const app = express()
  app.use('/api/v1', createPublicApiRouter(async input => {
    calls++
    if (fail) throw new Error('private upstream detail')
    return discoverPolymarket(input, async () => ({ events: [], pagination: { hasMore: false } }))
  }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as { port: number }
  try { await run(`http://127.0.0.1:${address.port}/api/v1`, () => calls) }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}

test('catalog and OpenAPI publish only mounted read operations and no paid/operator controls', async () => fixture(async url => {
  const response = await fetch(url + '/capabilities')
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-request-id'), body.requestId)
  assert.equal(body.compatibility.mcp, 'not-implemented')
  const spec = openapi()
  for (const item of body.capabilities) {
    assert.equal(item.paymentRequired, false)
    assert.equal(item.signingAuthorized, false)
    assert.ok(spec.paths[item.endpoint.replace('/api/v1', '')])
    assert.equal(item.method, 'GET')
  }
  assert.equal((await fetch(url + '/jobs', { method: 'POST' })).status, 503)
  const wrongMethod = await fetch(url + '/markets', { method: 'POST' })
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.get('allow'), 'GET, HEAD')
}))

test('unknown and repeated parameters never reach search; missing input fails before upstream', async () => fixture(async (url, calls) => {
  for (const query of ['?q=test&owner=someone', '?q=a&q=b', '?q[x]=a']) {
    assert.equal((await fetch(url + '/markets' + query)).status, 400)
  }
  assert.equal(calls(), 0)
  assert.equal((await fetch(url + '/markets')).status, 400)
}))

test('empty result remains empty and next-fixture requests preserve schedule requirement', async () => fixture(async url => {
  const response = await fetch(url + '/markets?q=United&intent=next%20EPL%20match')
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.result.candidates, [])
  assert.equal(body.result.selectedMarket, null)
  assert.equal(body.result.scheduleVerification, 'required')
  assert.ok(body.nextActions.some((a: { action: string }) => a.action === 'VERIFY_SCHEDULE'))
  assert.ok(body.nextActions.every((a: { authorizationRequired: boolean }) => !a.authorizationRequired))
}))

test('upstream failure is recoverable free discovery and never leaks private errors', async () => fixture(async url => {
  const response = await fetch(url + '/markets?q=test')
  const body = await response.json()
  assert.equal(response.status, 502)
  assert.equal(body.error.code, 'UPSTREAM_UNAVAILABLE')
  assert.equal(body.error.retryable, true)
  assert.doesNotMatch(JSON.stringify(body), /private upstream detail/)
  assert.equal(body.nextActions[0].action, 'RETRY_DISCOVERY')
}, true))
