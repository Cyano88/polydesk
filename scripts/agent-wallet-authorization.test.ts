import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import { authorizeLpScoutPayer, stableWalletSlugFromEmail } from '../api/agent-wallet-authorization.ts'

function request() {
  return { headers: {} } as Request
}

test('uses the same stable wallet namespace as the PolyDesk client', () => {
  assert.equal(stableWalletSlugFromEmail(' Ada@Example.com '), 'wallet-1ommv6s')
})

test('authorizes only the paying wallet derived from the verified Privy email', async () => {
  const verify = async () => ({
    claims: { userId: 'did:privy:test' },
    user: {} as never,
    email: 'ada@example.com',
  })
  const result = await authorizeLpScoutPayer(request(), 'wallet-1ommv6s', verify as never)
  assert.equal(result.agentSlug, 'wallet-1ommv6s')

  await assert.rejects(
    authorizeLpScoutPayer(request(), 'polydesk-agent', verify as never),
    /does not control this paying agent wallet/,
  )
})

test('fails closed when Privy has no verified email', async () => {
  const verify = async () => ({
    claims: { userId: 'did:privy:test' },
    user: {} as never,
    email: undefined,
  })
  await assert.rejects(
    authorizeLpScoutPayer(request(), 'wallet-1ommv6s', verify as never),
    /verified Privy email is required/,
  )
})
