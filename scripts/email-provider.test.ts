import assert from 'node:assert/strict'
import test from 'node:test'

import { sendTransactionalEmail } from '../api/email-provider.js'

const email = {
  to: 'user@example.com',
  fromEmail: 'alerts@example.com',
  fromName: 'PolyDesk',
  subject: 'Position alert',
  text: 'Review position',
  html: '<p>Review position</p>',
  context: 'Polymarket alert',
}

test('email provider fails closed when its server credential is missing', async () => {
  const previous = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  await assert.rejects(() => sendTransactionalEmail(email), /email is not configured/)
  if (previous === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = previous
})

test('email provider retries one transient response and then succeeds', async () => {
  const previousKey = process.env.RESEND_API_KEY
  const previousFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 'test-key'
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response('', { status: calls === 1 ? 503 : 200 })
  }
  try {
    await sendTransactionalEmail(email)
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previousKey
  }
})

test('email provider preserves a valid idempotency key across retries', async () => {
  const previousKey = process.env.RESEND_API_KEY
  const previousFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 'test-key'
  const keys: string[] = []
  globalThis.fetch = async (_input, init) => {
    keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '')
    return new Response('', { status: keys.length === 1 ? 503 : 200 })
  }
  try {
    await sendTransactionalEmail({ ...email, idempotencyKey: 'managed-lifecycle/event-123' })
    assert.deepEqual(keys, ['managed-lifecycle/event-123', 'managed-lifecycle/event-123'])
    await assert.rejects(
      () => sendTransactionalEmail({ ...email, idempotencyKey: 'bad\nkey' }),
      /idempotency key is invalid/,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previousKey
  }
})

test('email provider does not retry or expose a permanent provider response body', async () => {
  const previousKey = process.env.RESEND_API_KEY
  const previousFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 'test-key'
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response('recipient and provider internals', { status: 400 })
  }
  try {
    await assert.rejects(
      () => sendTransactionalEmail(email),
      error => error instanceof Error
        && /HTTP 400/.test(error.message)
        && !/recipient and provider internals/.test(error.message),
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previousKey
  }
})
