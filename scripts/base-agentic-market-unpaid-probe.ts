import assert from 'node:assert/strict'
import { x402HTTPResourceServer, x402ResourceServer } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { bazaarResourceServerExtension } from '@x402/extensions/bazaar'
import {
  BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  buildBaseSmartTraderRouteConfig,
} from '../api/base-agentic-market-smart-trader.js'

const facilitator = {
  verify: async () => { throw new Error('Unexpected verification in unpaid probe') },
  settle: async () => { throw new Error('Unexpected settlement in unpaid probe') },
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }],
    extensions: ['bazaar'],
    signers: {},
  }),
}

const resourceServer = new x402ResourceServer(facilitator)
  .register('eip155:8453', new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension)

const server = new x402HTTPResourceServer(resourceServer, {
  [`POST ${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}`]: buildBaseSmartTraderRouteConfig(
    'https://polydesk.trade',
    '0x1111111111111111111111111111111111111111',
  ),
})

await server.initialize()

const adapter = {
  getHeader: () => undefined,
  getMethod: () => 'POST',
  getPath: () => BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  getUrl: () => `https://polydesk.trade${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}`,
  getAcceptHeader: () => 'application/json',
  getUserAgent: () => 'local-unpaid-probe',
  getQueryParams: () => ({}),
  getQueryParam: () => undefined,
  getBody: () => ({ action: 'ANALYZE' }),
}

const result = await server.processHTTPRequest({
  adapter,
  path: BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  method: 'POST',
})

assert.equal(result.type, 'payment-error')
if (result.type !== 'payment-error') throw new Error('Expected an unpaid payment challenge')
assert.equal(result.response.status, 402)
const encoded = result.response.headers['PAYMENT-REQUIRED'] || result.response.headers['payment-required']
assert.ok(encoded)
const challenge = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
const requirement = challenge.accepts[0]
assert.equal(requirement.network, 'eip155:8453')
assert.equal(requirement.asset.toLowerCase(), '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
assert.equal(requirement.amount, '300000')
assert.ok(challenge.extensions?.bazaar)
assert.equal(challenge.extensions.bazaar.info.input.method, 'POST')

console.log('Base Agentic Market unpaid 402 challenge ok')
