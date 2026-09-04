import assert from 'node:assert/strict'

const origin = String(process.env.POLYDESK_DEMO_ORIGIN || 'https://polydesk.trade').replace(/\/+$/, '')
const endpoints = {
  lpScout: `${origin}/api/a2mcp/okx/polymarket-lp-scout?scoutMode=best&budget=5&agent=okx-demo`,
  footballLive: `${origin}/api/a2mcp/worldcup-live-scores`,
  footballNews: `${origin}/api/a2mcp/worldcup-market-news`,
  funding: `${origin}/api/a2mcp/polymarket-funding-link`,
  governedTrader: `${origin}/api/a2mcp/polymarket-portfolio-watch`,
}

function decodePaymentRequired(value) {
  assert.ok(value, 'Missing PAYMENT-REQUIRED header')
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
}

async function readJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  assert.equal(response.status, 200, `${url} returned HTTP ${response.status}`)
  return response.json()
}

console.log('PolyDesk OKX demo preflight')
console.log(`Origin: ${origin}`)

const health = await readJson(`${origin}/api/health`)
assert.equal(health.ok, true, 'Health response is not OK')
console.log('PASS  Production health')

const catalog = await readJson(`${origin}/api/a2mcp/services`)
assert.equal(catalog.schema, 'polydesk-integration-manifest')
assert.equal(catalog.schemaVersion, '2.0.0')
assert.equal(catalog.agentId, 5427)
const products = Array.isArray(catalog.products) ? catalog.products : []
const expectedProducts = [
  ['One-Off Polymarket Trade', 38484, 0.1],
  ['Managed Polymarket Agent', 38496, 5],
  ['Polymarket Integration Audit', 40363, 25],
]
assert.equal(products.length, expectedProducts.length, 'Catalog must expose exactly three customer products')
for (const [name, serviceId, amountUsdt] of expectedProducts) {
  const product = products.find(item => item?.marketplace?.serviceId === serviceId)
  assert.ok(product, `${name} is missing from the product catalog`)
  assert.equal(product.name, name)
  assert.equal(product.type, 'A2A')
  assert.equal(product.marketplace.migrationStatus, 'registered')
  assert.equal(product.pricing?.amountUsdt, amountUsdt)
}
console.log('PASS  Catalog: three registered A2A products with exact listing IDs and prices')

const capabilities = Array.isArray(catalog.capabilities) ? catalog.capabilities : []
const expectedCapabilities = [
  ['polymarket-lp-scout', '/api/a2mcp/okx/polymarket-lp-scout', '0.3'],
  ['football-live-data', '/api/a2mcp/worldcup-live-scores', '0.1'],
  ['football-news-brief', '/api/a2mcp/worldcup-market-news', '0.1'],
  ['verified-polymarket-funding', '/api/a2mcp/polymarket-funding-link', '0.1'],
  ['governed-polymarket-trader', '/api/a2mcp/polymarket-portfolio-watch', '0.1'],
  ['polymarket-smart-trader', '/api/a2mcp/polymarket-smart-trader', '0.3'],
]
assert.equal(capabilities.length, expectedCapabilities.length, 'Catalog must retain exactly six compatibility capabilities')
for (const [id, serviceEndpoint, amount] of expectedCapabilities) {
  const service = capabilities.find(item => item?.id === id)
  assert.ok(service, `${id} is missing from the service catalog`)
  assert.equal(service.endpoint, serviceEndpoint)
  assert.equal(service.price?.amount, amount)
  assert.equal(service.price?.asset, 'USDT')
  assert.equal(service.price?.network, 'X Layer')
}
console.log('PASS  Compatibility: six A2MCP capabilities with intended prices')

async function assertChallenge(name, url, amount, options = {}) {
  const { allowedUnavailableCode, ...init } = options
  const response = await fetch(url, {
    headers: { accept: 'application/json', ...(init.headers || {}) },
    ...init,
  })
  if (response.status === 503 && allowedUnavailableCode) {
    assert.equal(response.headers.get('payment-required'), null, `${name} must not issue a payment challenge while unavailable`)
    const body = await response.json()
    assert.equal(body.code, allowedUnavailableCode, `${name} returned an unexpected unavailable response`)
    console.log(`PASS  ${name}: provider unavailable response is explicit and non-billable`)
    return null
  }
  assert.equal(response.status, 402, `${name} returned HTTP ${response.status}, expected 402`)
  const challenge = decodePaymentRequired(response.headers.get('payment-required'))
  assert.ok(Array.isArray(challenge.accepts) && challenge.accepts.length > 0, `${name} accepts[] is empty`)
  const exact = challenge.accepts.find(item => item?.scheme === 'exact' && item?.network === 'eip155:196')
  assert.ok(exact, `${name} is missing the exact X Layer payment option`)
  assert.equal(exact.amount, amount)
  assert.equal(String(exact.asset).toLowerCase(), '0x779ded0c9e1022225f8e0630b35a9b54be713736')
  assert.ok(exact.payTo, `${name} is missing the payment recipient`)
  assert.notEqual(exact.extra?.assetTransferMethod, 'permit2', `${name} advertises unsupported Permit2 transfer`)
  return exact
}

const lpScout = await assertChallenge('LP Scout', endpoints.lpScout, '300000')
await assertChallenge('Football Match Live Data', endpoints.footballLive, '100000')
await assertChallenge('Football News Brief', endpoints.footballNews, '100000', {
  allowedUnavailableCode: 'FOOTBALL_NEWS_PROVIDER_UNAVAILABLE',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
})
console.log('PASS  x402: LP Scout and football routes challenge exactly or fail closed before billing')
console.log(`PASS  Pay-to: ${lpScout.payTo}`)

for (const [name, url] of [
  ['Verified Polymarket Funding', endpoints.funding],
  ['Governed Polymarket Trader', endpoints.governedTrader],
]) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(response.status, 402, `${name} returned HTTP ${response.status}, expected 402`)
  const challenge = decodePaymentRequired(response.headers.get('payment-required'))
  const exact = challenge.accepts?.find(item => item?.scheme === 'exact' && item?.network === 'eip155:196')
  assert.equal(exact?.amount, '100000', `${name} did not advertise the 0.1-USDT service fee`)
  assert.ok(challenge.outputSchema, `${name} is missing its paid-replay contract`)
}
console.log('PASS  Funding and governed-trader routes publish replayable 0.1-USDT challenges')

console.log('')
console.log('READY FOR BUYER ACCEPTANCE AFTER AGENT #5427 IS APPROVED AND ACTIVE')
console.log('No payment should be made while the agent is not publicly discoverable.')
