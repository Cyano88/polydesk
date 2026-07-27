import assert from 'node:assert/strict'

const origin = String(process.env.POLYDESK_DEMO_ORIGIN || 'https://polydesk.trade').replace(/\/+$/, '')
const endpoint = `${origin}/api/a2mcp/okx/polymarket-lp-scout?scoutMode=best&budget=5&agent=okx-demo`

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
const lpScout = services.find(service => service?.id === 'okx-polymarket-lp-scout')
assert.ok(lpScout, 'OKX LP Scout is missing from the service catalog')
assert.equal(lpScout.endpoint, '/api/a2mcp/okx/polymarket-lp-scout')
assert.equal(lpScout.pricing?.amount, '0.3')
assert.equal(lpScout.pricing?.asset, 'USDT')
assert.equal(lpScout.pricing?.network, 'X Layer')
console.log('PASS  Catalog: LP Scout at 0.3 USDT on X Layer')

const challengeResponse = await fetch(endpoint, { headers: { accept: 'application/json' } })
assert.equal(challengeResponse.status, 402, `LP Scout returned HTTP ${challengeResponse.status}, expected 402`)
const challenge = decodePaymentRequired(challengeResponse.headers.get('payment-required'))
assert.ok(Array.isArray(challenge.accepts) && challenge.accepts.length > 0, '402 accepts[] is empty')
const exact = challenge.accepts.find(item => item?.scheme === 'exact' && item?.network === 'eip155:196')
assert.ok(exact, 'Missing exact payment option on X Layer')
assert.equal(exact.amount, '300000')
assert.equal(String(exact.asset).toLowerCase(), '0x779ded0c9e1022225f8e0630b35a9b54be713736')
assert.ok(exact.payTo, 'Missing payment recipient')
assert.notEqual(exact.extra?.assetTransferMethod, 'permit2', 'Permit2 is incompatible with the OKX buyer CLI')
console.log('PASS  x402: exact EIP-3009-compatible challenge, 300000 atomic USDT')
console.log(`PASS  Pay-to: ${exact.payTo}`)

console.log('')
console.log('READY FOR PAID REHEARSAL')
console.log('Next: obtain a fresh OKX payment quote, confirm 0.3 USDT, pay, and verify the replay report plus settlement receipt.')
