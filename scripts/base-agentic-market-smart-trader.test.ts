import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  BASE_MAINNET_CAIP2,
  BASE_SMART_TRADER_PRICE_USDC,
  baseSmartTraderDiscoveryExtension,
  buildBaseSmartTraderRouteConfig,
} from '../api/base-agentic-market-smart-trader.js'
import { smartTraderServicePaymentFromContext } from '../api/polymarket-smart-trader.js'

const payTo = '0x1111111111111111111111111111111111111111'
const transaction = `0x${'a'.repeat(64)}`
const payer = '0x2222222222222222222222222222222222222222'

test('Base route advertises exact payment without changing the OKX lane', () => {
  const config = buildBaseSmartTraderRouteConfig('https://polydesk.trade', payTo)
  const accepts = config.accepts as Record<string, unknown>
  assert.equal(accepts.scheme, 'exact')
  assert.equal(accepts.network, BASE_MAINNET_CAIP2)
  assert.equal(accepts.price, BASE_SMART_TRADER_PRICE_USDC)
  assert.equal(accepts.payTo, payTo)
  assert.equal(config.resource, `https://polydesk.trade${BASE_AGENTIC_MARKET_SMART_TRADER_PATH}`)

  const okxSource = readFileSync(new URL('../api/okx-a2mcp-standard-services.ts', import.meta.url), 'utf8')
  assert.match(okxSource, /const OKX_XLAYER_NETWORK = 'eip155:196'/)
  assert.match(okxSource, /const OKX_XLAYER_USDT = '0x779ded0c9e1022225f8e0630b35a9b54be713736'/)
})

test('Base route publishes valid Bazaar POST discovery metadata', () => {
  const extension = baseSmartTraderDiscoveryExtension() as { bazaar?: unknown }
  assert.ok(extension.bazaar)

  const config = buildBaseSmartTraderRouteConfig('https://polydesk.trade/', payTo)
  const bazaar = (config.extensions as { bazaar?: { info?: { input?: Record<string, unknown> } } }).bazaar
  assert.equal(bazaar?.info?.input?.type, 'http')
  assert.equal(bazaar?.info?.input?.bodyType, 'json')
  assert.deepEqual(bazaar?.info?.input?.body, {
    action: 'ANALYZE',
    query: 'Find active liquid Polymarket markets about football',
    side: 'BUY',
  })
})

test('Smart Trader accepts valid Base metadata but rejects crossed lanes', () => {
  assert.deepEqual(smartTraderServicePaymentFromContext({
    provider: 'CDP x402', transaction, payer, amount: '300000', network: 'Base',
    serviceUrl: BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  }), {
    provider: 'CDP x402', transaction, payer, amountAtomic: '300000', network: 'Base',
    serviceUrl: BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  })
  assert.equal(smartTraderServicePaymentFromContext({
    provider: 'CDP x402', transaction, payer, amount: '300000', network: 'X Layer',
    serviceUrl: BASE_AGENTIC_MARKET_SMART_TRADER_PATH,
  }), null)
})

test('Base seller route contains no trade signer or broadcaster', () => {
  const source = readFileSync(new URL('../api/base-agentic-market-smart-trader.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /PRIVATE_KEY|seed phrase|signTypedData|sendTransaction|submitOrder|broadcast/i)
  assert.match(source, /separately approve any resulting Polymarket trade/i)
})
