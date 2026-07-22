import assert from 'node:assert/strict'
import test from 'node:test'
import { createHashPayLinkPolymarketFundingHandler, fetchHashPayLinkPolymarketFundingStatus } from '../api/hashpaylink-polymarket-funding.js'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined as any, headers: {} as Record<string, unknown>,
    setHeader(name: string, value: unknown) { this.headers[name.toLowerCase()] = value; return this },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

test('creates a Polymarket funding checkout using the ordinary developer API key', async () => {
  let upstreamUrl = ''
  let upstreamInit: RequestInit | undefined
  const handler = createHashPayLinkPolymarketFundingHandler({
    fetch: async (url, init) => {
      upstreamUrl = String(url); upstreamInit = init
      return new Response(JSON.stringify({
        ok: true, fundingRequestId: 'pmf_11111111111111111111', checkoutId: 'chk_test12345678',
        checkoutUrl: '/pay/c/chk_test12345678?attempt=pat_111111111111111111111111',
        funding: { provider: 'polymarket', availableNetworks: ['base', 'arbitrum'] },
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    },
    apiOrigin: () => 'https://app.hashpaylink.com',
    apiKey: () => 'hpl_live_portal-issued-key',
    publicOrigin: () => 'https://polydesk.trade',
  })
  const res = responseRecorder()
  await handler({
    method: 'POST', headers: {}, body: {
      polymarketWallet: '0x2222222222222222222222222222222222222222', amount: '10',
      networks: ['base', 'arbitrum'], requestId: 'request_1234567890', flow: 'external',
    },
  } as any, res as any)
  assert.equal(res.statusCode, 201)
  assert.equal(res.body.checkoutUrl, 'https://app.hashpaylink.com/pay/c/chk_test12345678?attempt=pat_111111111111111111111111')
  assert.equal(upstreamUrl, 'https://app.hashpaylink.com/api/v2/funding/polymarket/checkouts')
  assert.equal((upstreamInit?.headers as Record<string, string>)['X-API-Key'], 'hpl_live_portal-issued-key')
  assert.equal((upstreamInit?.headers as Record<string, string>)['Idempotency-Key'], 'polydesk:funding:request_1234567890')
  const body = JSON.parse(String(upstreamInit?.body))
  assert.equal(body.returnUrl, 'https://polydesk.trade/polydesk?service=portfolio&notice=polymarket-funding-complete&portfolio=external')
  assert.equal(JSON.stringify(body).includes('depositAddress'), false)
})

test('reads authoritative funding status and normalizes the receipt to Hash PayLink', async () => {
  const result = await fetchHashPayLinkPolymarketFundingStatus('pmf_11111111111111111111', {
    fetch: async () => new Response(JSON.stringify({
      ok: true, fundingRequestId: 'pmf_11111111111111111111', status: 'funded', receiptUrl: '/receipt/verified',
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    apiOrigin: () => 'https://app.hashpaylink.com',
    apiKey: () => 'hpl_live_portal-issued-key',
  })
  assert.equal(result.statusCode, 200)
  assert.equal(result.data.status, 'funded')
  assert.equal(result.data.receiptUrl, 'https://app.hashpaylink.com/receipt/verified')
})

test('fails closed when the developer portal key is unavailable', async () => {
  const handler = createHashPayLinkPolymarketFundingHandler({
    fetch: async () => { throw new Error('must not call upstream') }, apiOrigin: () => 'https://app.hashpaylink.com',
    apiKey: () => '', publicOrigin: () => 'https://polydesk.trade',
  })
  const res = responseRecorder()
  await handler({ method: 'POST', headers: {}, body: {} } as any, res as any)
  assert.equal(res.statusCode, 503)
})
