import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import { buildOkxLpScoutRouteConfig } from '../api/okx-a2mcp-polymarket-lp-scout.js'
import { describeScoutPayment } from '../api/x402-polymarket-scout.js'

test('OKX LP Scout advertises EIP-3009 exact without Permit2', () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  const payTo = '0x8f1b15fc1489262ce64ac8d6592bc8ebb31f07be'
  const route = buildOkxLpScoutRouteConfig(req, '0.3', payTo)
  const accepts = route.accepts as {
    scheme: string
    network: string
    payTo: string
    price: { amount: string; asset: string; extra?: Record<string, unknown> }
    extra?: Record<string, unknown>
  }

  assert.equal(accepts.scheme, 'exact')
  assert.equal(accepts.network, 'eip155:196')
  assert.equal(accepts.payTo, payTo)
  assert.equal(accepts.price.amount, '300000')
  assert.equal(accepts.price.asset, '0x779ded0c9e1022225f8e0630b35a9b54be713736')
  assert.equal(accepts.price.extra?.assetTransferMethod, undefined)
  assert.equal(accepts.extra?.assetTransferMethod, undefined)
  assert.equal(accepts.extra?.tokenSymbol, 'USDT')
  assert.equal(route.resource, 'https://polydesk.trade/api/a2mcp/okx/polymarket-lp-scout')
})

test('OKX LP Scout receipt labels match the settled USDT payment', () => {
  const payment = describeScoutPayment({
    verified: true,
    payer: '0x8b1016a561ce45b05f2be9948730fcd1a81b1b07',
    amount: '300000',
    network: 'X Layer',
    asset: 'USDT',
    provider: 'OKX Agent Payments Protocol',
    kind: 'okx_agent_payments_x402',
  })

  assert.deepEqual(payment, {
    amount: '0.3 USDT',
    asset: 'USDT',
    provider: 'OKX Agent Payments Protocol',
  })
})
