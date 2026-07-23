import assert from 'node:assert/strict'
import test from 'node:test'
import { protectLpScoutWithHashPayLink } from '../api/hashpaylink-agentic-checkout.ts'

const checkoutId = 'chk_polydesklpscout01'
const paymentAttemptId = 'pat_111111111111111111111111'
const payer = '0x2222222222222222222222222222222222222222'
const transaction = 'gateway-transfer-0001'
const challenge = Buffer.from(JSON.stringify({
  x402Version: 2,
  accepts: [{ network: 'eip155:5042002', amount: '10000', payTo: '0x1111111111111111111111111111111111111111' }],
})).toString('base64')

function request(headers: Record<string, string> = {}) {
  return {
    headers,
    protocol: 'https',
    query: {},
  } as any
}

function dependencies(fetcher: typeof fetch, key = 'hpl_test_private') {
  return {
    fetch: fetcher,
    apiOrigin: () => 'https://app.hashpaylink.com',
    apiKey: () => key,
    publicOrigin: () => 'https://polydesk.trade',
  }
}

test('relays the Hash PayLink payment challenge without signing', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (calls.length === 1) return new Response(JSON.stringify({
      ok: true,
      checkoutId,
      paymentAttemptId,
      network: 'arc',
      agentPaymentUrl: `/api/v2/checkouts/agent?id=${checkoutId}&attempt=${paymentAttemptId}`,
    }), { status: 201, headers: { 'content-type': 'application/json' } })
    return new Response('{}', { status: 402, headers: { 'PAYMENT-REQUIRED': challenge } })
  }
  const result = await protectLpScoutWithHashPayLink({
    req: request(),
    requestId: 'lps_1111111111111111',
    network: 'arc',
    amount: '$0.01',
  }, dependencies(fetcher as typeof fetch))
  assert.equal(result.kind, 'challenge')
  assert.equal(result.paymentRequired, challenge)
  assert.equal(calls.length, 2)
  assert.equal((calls[0].init?.headers as Record<string, string>)['X-API-Key'], 'hpl_test_private')
  assert.equal(JSON.parse(String(calls[0].init?.body)).network, 'arc')
  assert.equal((calls[1].init?.headers as Record<string, string>)['PAYMENT-SIGNATURE'], undefined)
})

test('forwards the signature and accepts only authoritative paid status', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (calls.length === 1) return new Response(JSON.stringify({
      ok: true,
      checkoutId,
      paymentAttemptId,
      network: 'base',
      agentPaymentUrl: `/api/v2/checkouts/agent?id=${checkoutId}&attempt=${paymentAttemptId}`,
    }), { status: 201, headers: { 'content-type': 'application/json' } })
    if (calls.length === 2) return new Response(JSON.stringify({ ok: true, status: 'paid' }), { status: 200 })
    return new Response(JSON.stringify({
      ok: true,
      checkoutId,
      checkoutMode: 'agentic',
      status: 'paid',
      network: 'base',
      payment: { status: 'paid', payer, amount: '0.01', network: 'base', txHash: transaction },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const result = await protectLpScoutWithHashPayLink({
    req: request({ 'payment-signature': 'signed-payment' }),
    requestId: 'lps_2222222222222222',
    network: 'base',
    amount: '0.01',
  }, dependencies(fetcher as typeof fetch, 'hpl_live_private'))
  assert.equal(result.kind, 'paid')
  assert.equal(result.payment.amount, '10000')
  assert.equal(result.payment.payer, payer)
  assert.equal((calls[1].init?.headers as Record<string, string>)['PAYMENT-SIGNATURE'], 'signed-payment')
  assert.match(calls[2].url, /purpose=status/)
})

test('fails closed for invalid correlation and missing network key', async () => {
  await assert.rejects(protectLpScoutWithHashPayLink({
    req: request(),
    requestId: 'short',
    network: 'arc',
    amount: '0.01',
  }, dependencies(fetch as typeof fetch)), /unique requestId/)

  await assert.rejects(protectLpScoutWithHashPayLink({
    req: request(),
    requestId: 'lps_3333333333333333',
    network: 'arc',
    amount: '0.01',
  }, dependencies(fetch as typeof fetch, '')), /test agentic checkout is not configured/)
})

test('rejects a payment URL outside the configured Hash PayLink origin', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    ok: true,
    checkoutId,
    paymentAttemptId,
    network: 'arc',
    agentPaymentUrl: 'https://attacker.example/api/pay',
  }), { status: 201, headers: { 'content-type': 'application/json' } })

  await assert.rejects(protectLpScoutWithHashPayLink({
    req: request(),
    requestId: 'lps_4444444444444444',
    network: 'arc',
    amount: '0.01',
  }, dependencies(fetcher as typeof fetch)), /invalid agent payment URL/)
})

test('rejects paid status whose network or amount differs from the checkout', async () => {
  let call = 0
  const fetcher = async () => {
    call += 1
    if (call === 1) return new Response(JSON.stringify({
      ok: true,
      checkoutId,
      paymentAttemptId,
      network: 'base',
      agentPaymentUrl: `/api/v2/checkouts/agent?id=${checkoutId}&attempt=${paymentAttemptId}`,
    }), { status: 201, headers: { 'content-type': 'application/json' } })
    if (call === 2) return new Response(JSON.stringify({ ok: true, status: 'paid' }), { status: 200 })
    return new Response(JSON.stringify({
      ok: true,
      checkoutId,
      checkoutMode: 'agentic',
      status: 'paid',
      network: 'arc',
      payment: { status: 'paid', payer, amount: '1.00', network: 'arc', txHash: transaction },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  await assert.rejects(protectLpScoutWithHashPayLink({
    req: request({ 'payment-signature': 'signed-payment' }),
    requestId: 'lps_5555555555555555',
    network: 'base',
    amount: '0.01',
  }, dependencies(fetcher as typeof fetch, 'hpl_live_private')), /details do not match/)
})
