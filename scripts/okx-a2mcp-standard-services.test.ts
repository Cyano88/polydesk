import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import {
  addFundingReplaySchema,
  addGovernedTraderReplaySchema,
  buildStandardServiceRouteConfig,
  isFreeMarketplacePath,
} from '../api/okx-a2mcp-standard-services.js'

test('standard OKX exact services advertise EIP-3009 instead of Permit2', () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  const payTo = '0x631c96fba389f65da7093e559e8120b587ec7df4'
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/football-live-data',
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

test('Agent #5427 locked zero-fee compatibility routes bypass x402', () => {
  for (const path of [
    '/api/a2mcp/worldcup-live-scores',
    '/api/a2mcp/worldcup-market-news',
    '/api/a2mcp/polymarket-portfolio-watch',
    '/api/a2mcp/polymarket-funding-link',
  ] as const) {
    assert.equal(isFreeMarketplacePath(path), true)
  }
  for (const path of [
    '/api/a2mcp/okx/polymarket-lp-scout',
    '/api/a2mcp/football-live-data',
    '/api/a2mcp/football-news-brief',
    '/api/a2mcp/polymarket-agent-flow',
  ]) {
    assert.equal(isFreeMarketplacePath(path), false)
  }
})

test('funding-link challenge declares replayable POST parameters', async () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/polymarket-funding-link',
    '0.1',
    '0x631c96fba389f65da7093e559e8120b587ec7df4',
  )
  const extensions = route.extensions as {
    bazaar?: {
      info?: { input?: { type?: string; method?: string; bodyType?: string; body?: Record<string, unknown> } }
      schema?: { properties?: { input?: { properties?: { body?: { required?: string[] } } } } }
    }
  }
  const unpaid = await route.unpaidResponseBody?.({} as never) as {
    body?: { inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }
  }

  assert.equal(extensions.bazaar?.info?.input?.type, 'http')
  assert.equal(extensions.bazaar?.info?.input?.method, 'POST')
  assert.equal(extensions.bazaar?.info?.input?.bodyType, 'json')
  assert.equal(extensions.bazaar?.info?.input?.body?.requiredBalanceUsdc, '5')
  assert.deepEqual(
    extensions.bazaar?.schema?.properties?.input?.properties?.body?.required,
    ['ownerAddress', 'requiredBalanceUsdc'],
  )
  assert.ok(unpaid.body?.inputSchema?.properties?.ownerAddress)
  assert.ok(unpaid.body?.inputSchema?.properties?.requiredBalanceUsdc)
  assert.deepEqual(unpaid.body?.inputSchema?.required, ['ownerAddress', 'requiredBalanceUsdc'])
})

test('funding-link 402 header exposes the legacy replay contract used by OKX buyer tooling', () => {
  const challenge = {
    x402Version: 2,
    resource: { url: 'https://polydesk.trade/api/a2mcp/polymarket-funding-link' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:196',
      amount: '100000',
      asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
      payTo: '0x631c96fba389f65da7093e559e8120b587ec7df4',
      maxTimeoutSeconds: 600,
    }],
  }
  const response = addFundingReplaySchema({
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(challenge)).toString('base64url'),
    },
  }, '/api/a2mcp/polymarket-funding-link')
  const decoded = JSON.parse(Buffer.from(response.headers['PAYMENT-REQUIRED'], 'base64url').toString('utf8')) as {
    accepts?: Array<{ outputSchema?: unknown }>
    outputSchema?: {
      input?: {
        ownerAddress?: { required?: boolean }
        requiredBalanceUsdc?: { required?: boolean }
        network?: Record<string, unknown>
        agent?: Record<string, unknown>
      }
    }
  }

  assert.equal(decoded.outputSchema?.input?.ownerAddress?.required, true)
  assert.equal(decoded.outputSchema?.input?.requiredBalanceUsdc?.required, true)
  assert.ok(decoded.outputSchema?.input?.network)
  assert.ok(decoded.outputSchema?.input?.agent)
  assert.equal(decoded.accepts?.[0]?.outputSchema, undefined)
})

test('governed-trader challenge declares every paid-replay input', async () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/polymarket-agent-flow',
    '0.1',
    '0x631c96fba389f65da7093e559e8120b587ec7df4',
  )
  const extensions = route.extensions as {
    bazaar?: {
      info?: { input?: { method?: string; bodyType?: string } }
      schema?: { properties?: { input?: { properties?: { body?: { required?: string[] } } } } }
    }
  }
  const unpaid = await route.unpaidResponseBody?.({} as never) as {
    body?: { inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }
  }

  assert.equal(extensions.bazaar?.info?.input?.method, 'POST')
  assert.equal(extensions.bazaar?.info?.input?.bodyType, 'json')
  assert.deepEqual(
    extensions.bazaar?.schema?.properties?.input?.properties?.body?.required,
    [
      'externalOrderId',
      'marketUrl',
      'marketTitle',
      'outcome',
      'tokenId',
      'signer',
      'orderType',
      'order',
      'orderPayload',
      'mandate',
    ],
  )
  assert.ok(unpaid.body?.inputSchema?.properties?.externalOrderId)
  assert.ok(unpaid.body?.inputSchema?.properties?.mandate)
})

test('governed-trader 402 header exposes the replay contract at challenge level', () => {
  const challenge = {
    x402Version: 2,
    resource: { url: 'https://polydesk.trade/api/a2mcp/polymarket-agent-flow' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:196',
      amount: '100000',
      asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
      payTo: '0x631c96fba389f65da7093e559e8120b587ec7df4',
      maxTimeoutSeconds: 600,
    }],
  }
  const response = addGovernedTraderReplaySchema({
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(challenge)).toString('base64url'),
    },
  }, '/api/a2mcp/polymarket-agent-flow')
  const decoded = JSON.parse(Buffer.from(response.headers['PAYMENT-REQUIRED'], 'base64url').toString('utf8')) as {
    outputSchema?: {
      input?: {
        externalOrderId?: { required?: boolean }
        orderPayload?: { required?: boolean }
        mandate?: { required?: boolean }
      }
    }
  }

  assert.equal(decoded.outputSchema?.input?.externalOrderId?.required, true)
  assert.equal(decoded.outputSchema?.input?.orderPayload?.required, true)
  assert.equal(decoded.outputSchema?.input?.mandate?.required, true)
})
