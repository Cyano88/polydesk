import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import { buildStandardServiceRouteConfig } from '../api/okx-a2mcp-standard-services.js'

test('standard OKX exact services advertise EIP-3009 instead of Permit2', () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  const payTo = '0x631c96fba389f65da7093e559e8120b587ec7df4'
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/worldcup-live-scores',
    '0.1',
    payTo,
  )
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
  assert.equal(accepts.price.amount, '100000')
  assert.equal(accepts.price.asset, '0x779ded0c9e1022225f8e0630b35a9b54be713736')
  assert.equal(accepts.price.extra?.assetTransferMethod, undefined)
  assert.equal(accepts.extra?.assetTransferMethod, undefined)
  assert.equal(accepts.extra?.tokenSymbol, 'USDT')
})
