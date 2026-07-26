import assert from 'node:assert/strict'
import test from 'node:test'
import helperProfileHandler, { sanitizeMemoryForArchive, sanitizeMemoryNote } from '../api/helper-profile.ts'

test('active memory rejects secrets and personal email', () => {
  assert.equal(sanitizeMemoryNote('My email is test@example.com').rejected, true)
  assert.equal(sanitizeMemoryNote('Remember my API key sk_live_secret').rejected, true)
  assert.equal(sanitizeMemoryNote('I prefer conservative LP opportunities').value, 'I prefer conservative LP opportunities')
  assert.equal(
    sanitizeMemoryNote('I prefer conservative football markets with strong liquidity and enough time to review every suggested quote').rejected,
    false,
  )
})

test('0G checkpoint text removes sensitive identifiers', () => {
  const archived = sanitizeMemoryForArchive(
    'Email test@example.com, wallet 0x1234567890123456789012345678901234567890, password: hunter2',
  )
  assert.doesNotMatch(archived, /test@example\.com/)
  assert.doesNotMatch(archived, /0x1234567890/)
  assert.doesNotMatch(archived, /hunter2/)
  assert.match(archived, /\[email omitted\]/)
  assert.match(archived, /\[wallet omitted\]/)
})

test('profile memory cannot be probed with a submitted owner identifier', async () => {
  const previousAppId = process.env.PRIVY_APP_ID
  const previousSecret = process.env.PRIVY_APP_SECRET
  process.env.PRIVY_APP_ID = 'test-app'
  process.env.PRIVY_APP_SECRET = 'test-secret'
  let statusCode = 200
  let payload: Record<string, unknown> = {}
  const response = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(value: Record<string, unknown>) {
      payload = value
      return this
    },
  }
  try {
    await helperProfileHandler({
      method: 'GET',
      headers: {},
      query: { owner: 'identity:someone-else' },
    } as never, response as never)
  } finally {
    if (previousAppId === undefined) delete process.env.PRIVY_APP_ID
    else process.env.PRIVY_APP_ID = previousAppId
    if (previousSecret === undefined) delete process.env.PRIVY_APP_SECRET
    else process.env.PRIVY_APP_SECRET = previousSecret
  }
  assert.equal(statusCode, 401)
  assert.equal(payload.ok, false)
  assert.match(String(payload.error), /sign in/i)
})
