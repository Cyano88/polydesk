import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createHashPayLinkWebhookHandler } from '../api/hashpaylink-webhook.js'

const secret = 'whsec_test_secret_that_is_more_than_32_characters'
const now = new Date('2026-07-22T15:00:00.000Z')
const timestamp = Math.floor(now.getTime() / 1000).toString()
const event = {
  id: 'evt_testpayment000001',
  event: 'payment.confirmed',
  createdAt: now.toISOString(),
  data: {
    checkoutId: 'chk_testcheckout1234',
    status: 'paid',
    network: 'base',
    amount: '3.2',
    transactionHash: `0x${'a'.repeat(64)}`,
  },
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; return this },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

function request(rawBody: string, input: { signature?: string; eventId?: string; body?: unknown } = {}) {
  const signature = input.signature ?? createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  return {
    body: input.body ?? Buffer.from(rawBody),
    headers: {
      'x-hashpaylink-event': input.eventId ?? event.id,
      'x-hashpaylink-signature': `t=${timestamp},v1=${signature}`,
    },
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    secret: () => secret,
    now: () => now,
    claim: async () => ({ alreadyProcessed: false }),
    complete: async () => undefined,
    applyFundingEvent: async () => 1,
    ...overrides,
  }
}

async function call(handler: ReturnType<typeof createHashPayLinkWebhookHandler>, req: ReturnType<typeof request>) {
  const response = responseRecorder()
  await handler(req as never, response as never)
  return response
}

test('rejects missing configuration, parsed bodies, stale timestamps, and invalid signatures', async () => {
  const raw = JSON.stringify(event)
  const unavailable = await call(createHashPayLinkWebhookHandler(dependencies({ secret: () => '' }) as never), request(raw))
  assert.equal(unavailable.statusCode, 503)

  const parsed = await call(createHashPayLinkWebhookHandler(dependencies() as never), request(raw, { body: event }))
  assert.equal(parsed.statusCode, 400)

  const staleTimestamp = (Number(timestamp) - 301).toString()
  const staleSignature = createHmac('sha256', secret).update(`${staleTimestamp}.${raw}`).digest('hex')
  const stale = await call(createHashPayLinkWebhookHandler(dependencies() as never), {
    body: Buffer.from(raw), headers: { 'x-hashpaylink-event': event.id, 'x-hashpaylink-signature': `t=${staleTimestamp},v1=${staleSignature}` },
  })
  assert.equal(stale.statusCode, 401)

  const invalid = await call(createHashPayLinkWebhookHandler(dependencies() as never), request(raw, { signature: '0'.repeat(64) }))
  assert.equal(invalid.statusCode, 401)
})

test('accepts a signed event, applies it once, and acknowledges processed duplicates', async () => {
  const calls: string[] = []
  const handler = createHashPayLinkWebhookHandler(dependencies({
    claim: async () => { calls.push('claim'); return { alreadyProcessed: false } },
    applyFundingEvent: async () => { calls.push('apply'); return 1 },
    complete: async (_id: string, input: { error?: string }) => { calls.push(input.error ? 'failed' : 'complete') },
  }) as never)
  const accepted = await call(handler, request(JSON.stringify(event)))
  assert.equal(accepted.statusCode, 200)
  assert.deepEqual(accepted.body, { ok: true, received: true, matchedFundingAttempts: 1 })
  assert.deepEqual(calls, ['claim', 'apply', 'complete'])

  const duplicate = await call(createHashPayLinkWebhookHandler(dependencies({
    claim: async () => ({ alreadyProcessed: true }),
    applyFundingEvent: async () => { throw new Error('must not apply') },
  }) as never), request(JSON.stringify(event)))
  assert.equal(duplicate.statusCode, 200)
  assert.deepEqual(duplicate.body, { ok: true, duplicate: true })
})

test('returns retryable failure when durable processing fails', async () => {
  let failureRecorded = false
  const handler = createHashPayLinkWebhookHandler(dependencies({
    applyFundingEvent: async () => { throw new Error('database unavailable') },
    complete: async (_id: string, input: { error?: string }) => { failureRecorded = input.error === 'database unavailable' },
  }) as never)
  const response = await call(handler, request(JSON.stringify(event)))
  assert.equal(response.statusCode, 503)
  assert.equal(failureRecorded, true)
})

test('mounts raw webhook parsing before global JSON parsing', async () => {
  const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
  const webhookRoute = source.indexOf("app.post('/api/webhooks/hashpaylink'")
  const jsonParser = source.indexOf("app.use(express.json")
  assert.ok(webhookRoute > 0)
  assert.ok(jsonParser > webhookRoute)
  assert.match(source.slice(webhookRoute, jsonParser), /express\.raw\(\{ type: 'application\/json', limit: '128kb' \}\)/)
})
