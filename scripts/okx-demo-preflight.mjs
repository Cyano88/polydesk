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
const services = Array.isArray(catalog.services) ? catalog.services : []
const expectedServices = [
  ['polymarket-lp-scout', '/api/a2mcp/okx/polymarket-lp-scout', '0.3'],
  ['football-live-data', '/api/a2mcp/worldcup-live-scores', '0.1'],
  ['football-news-brief', '/api/a2mcp/worldcup-market-news', '0.1'],
  ['verified-polymarket-funding', '/api/a2mcp/polymarket-funding-link', '0.1'],
  ['governed-polymarket-trader', '/api/a2mcp/polymarket-portfolio-watch', '0.1'],
]
assert.equal(services.length, expectedServices.length, 'Catalog must expose exactly five focused services')
for (const [id, serviceEndpoint, amount] of expectedServices) {
  const service = services.find(item => item?.id === id)
  assert.ok(service, `${id} is missing from the service catalog`)
  assert.equal(service.endpoint, serviceEndpoint)
  assert.equal(service.price?.amount, amount)
  assert.equal(service.price?.asset, 'USDT')
  assert.equal(service.price?.network, 'X Layer')
}
console.log('PASS  Catalog: five focused services with intended prices')

async function assertChallenge(name, url, amount, init = {}) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', ...(init.headers || {}) },
    ...init,
  })
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
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
})
console.log('PASS  x402: LP Scout and both football services return exact X Layer challenges')
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
console.log('READY FOR PAID REHEARSAL')
console.log('Next: obtain a fresh OKX payment quote, confirm 0.3 USDT, pay, and verify the replay report plus settlement receipt.')
