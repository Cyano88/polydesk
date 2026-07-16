import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentActivityStorePath, resolveAgentWalletStorePath } from '../api/agent-store-paths.js'

test('keeps wallet sessions and activity history in separate durable files', () => {
  const env = { DATA_PATH: '/var/data' }
  assert.equal(resolveAgentWalletStorePath(env), '/var/data/agent-wallet-provisioning.json')
  assert.equal(resolveAgentActivityStorePath(env), '/var/data/agent-activity.json')
  assert.notEqual(resolveAgentWalletStorePath(env), resolveAgentActivityStorePath(env))
})

test('activity storage never inherits the wallet provisioning override', () => {
  const env = {
    DATA_PATH: '/var/data',
    AGENT_WALLET_PROVISION_STORE: '/var/data/custom-wallet-sessions.json',
  }
  assert.equal(resolveAgentWalletStorePath(env), '/var/data/custom-wallet-sessions.json')
  assert.equal(resolveAgentActivityStorePath(env), '/var/data/agent-activity.json')
})

test('allows an explicit independent activity path', () => {
  const env = {
    AGENT_WALLET_PROVISION_STORE: '/sessions/wallet.json',
    AGENT_ACTIVITY_STORE: '/activity/history.json',
  }
  assert.equal(resolveAgentWalletStorePath(env), '/sessions/wallet.json')
  assert.equal(resolveAgentActivityStorePath(env), '/activity/history.json')
})
