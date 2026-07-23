import assert from 'node:assert/strict'
import test from 'node:test'
import { agentServicePolicy, polydeskServiceOrigin } from '../api/agent-service-policy.ts'

test('uses the canonical public app origin for the internal LP Scout service', () => {
  const environment = {
    PUBLIC_APP_URL: 'https://polydesk.trade',
    RENDER_EXTERNAL_URL: 'https://polydesk-i96m.onrender.com',
  }
  assert.equal(polydeskServiceOrigin(environment), 'https://polydesk.trade')
  assert.equal(agentServicePolicy(environment).defaultScoutUrl, 'https://polydesk.trade/api/x402/polymarket-scout')
})

test('always allowlists the exact internal LP Scout endpoint', () => {
  const policy = agentServicePolicy({
    PUBLIC_APP_URL: 'https://polydesk.trade',
    AGENT_WALLET_ALLOWED_SERVICE_URLS: 'https://partner.example/x402/service',
  })
  assert.equal(policy.allowedServiceUrls.has(policy.defaultScoutUrl), true)
  assert.equal(policy.allowedServiceUrls.has('https://partner.example/x402/service'), true)
})

test('rejects unsafe configured origins and service protocols', () => {
  const policy = agentServicePolicy({
    POLYDESK_BASE_URL: 'javascript:alert(1)',
    AGENT_WALLET_ALLOWED_SERVICE_URLS: 'file:///tmp/service,https://partner.example/x402/service',
  })
  assert.equal(policy.defaultScoutUrl, 'https://polydesk.trade/api/x402/polymarket-scout')
  assert.equal(policy.allowedServiceUrls.has('file:///tmp/service'), false)
})
