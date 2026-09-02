import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import okxA2mcpStandardServiceHandler, {
  addFundingReplaySchema,
  addGovernedTraderReplaySchema,
  addPortfolioWatchReplaySchema,
  addSmartTraderReplaySchema,
  buildStandardServiceRouteConfig,
  preflightSmartTraderBeforeSettlement,
  smartTraderRequestInput,
} from '../api/okx-a2mcp-standard-services.js'
import { polyDeskAgentServices } from '../api/a2mcp-services.js'

test('public service catalog documents optional football relevance filters', () => {
  const services = polyDeskAgentServices()
  const matchData = services.find(service => service.id === 'football-live-data')
  const news = services.find(service => service.id === 'football-news-brief')
  assert.ok(matchData?.input.includes('optional exact team name'))
  assert.ok(news?.input.includes('optional exact team name'))
  assert.ok(news?.input.includes('optional league name'))
})

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

test('Agent #5427 registered compatibility routes all advertise non-zero exact payment', () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  for (const path of [
    '/api/a2mcp/worldcup-live-scores',
    '/api/a2mcp/worldcup-market-news',
    '/api/a2mcp/polymarket-portfolio-watch',
    '/api/a2mcp/polymarket-funding-link',
  ] as const) {
    const route = buildStandardServiceRouteConfig(
      req,
      path,
      '0.1',
      '0x631c96fba389f65da7093e559e8120b587ec7df4',
    )
    const accepts = route.accepts as { price: { amount: string } }
    assert.equal(accepts.price.amount, '100000')
  }
})

test('smart-trader challenge declares its OKX AI action contract', async () => {
  const req = { headers: { host: 'polydesk.trade' }, protocol: 'https' } as Request
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/polymarket-smart-trader',
    '0.3',
    '0x631c96fba389f65da7093e559e8120b587ec7df4',
  )
  const unpaid = await route.unpaidResponseBody?.({} as never) as {
    body?: { inputSchema?: { properties?: Record<string, { enum?: string[] }>; required?: string[] } }
  }
  assert.ok(unpaid.body?.inputSchema?.properties?.action)
  assert.deepEqual(unpaid.body?.inputSchema?.properties?.action?.enum, ['ANALYZE', 'PREPARE'])
  assert.ok(unpaid.body?.inputSchema?.properties?.marketId)
  assert.ok(unpaid.body?.inputSchema?.properties?.mandate)
  assert.deepEqual(unpaid.body?.inputSchema?.required, ['action'])
  const accepts = route.accepts as { price: { amount: string } }
  assert.equal(accepts.price.amount, '300000')
})

test('smart-trader 402 header exposes its paid replay contract', () => {
  const challenge = {
    x402Version: 2,
    resource: { url: 'https://polydesk.trade/api/a2mcp/polymarket-smart-trader' },
    accepts: [{ scheme: 'exact', network: 'eip155:196', amount: '300000' }],
  }
  const response = addSmartTraderReplaySchema({
    status: 402,
    headers: { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(challenge)).toString('base64url') },
  }, '/api/a2mcp/polymarket-smart-trader')
  const decoded = JSON.parse(Buffer.from(response.headers['PAYMENT-REQUIRED'], 'base64url').toString('utf8')) as {
    outputSchema?: {
      input?: {
        type?: string
        method?: string
        bodyType?: string
        body?: {
          properties?: Record<string, unknown>
          required?: string[]
        }
      }
      output?: { description?: string }
    }
  }
  assert.equal(decoded.outputSchema?.input?.type, 'http')
  assert.equal(decoded.outputSchema?.input?.method, 'POST')
  assert.equal(decoded.outputSchema?.input?.bodyType, 'json')
  assert.ok(decoded.outputSchema?.input?.body?.properties?.action)
  assert.ok(decoded.outputSchema?.input?.body?.properties?.marketId)
  assert.ok(decoded.outputSchema?.input?.body?.properties?.outcome)
  assert.ok(decoded.outputSchema?.input?.body?.properties?.side)
  assert.ok(decoded.outputSchema?.input?.body?.properties?.mandate)
  assert.deepEqual(decoded.outputSchema?.input?.body?.required, ['action'])
  assert.match(String(decoded.outputSchema?.output?.description), /verified-shortfall funding routing/i)
  assert.match(String(decoded.outputSchema?.output?.description), /never signs or submits/i)
})

test('a signed empty smart-trader replay is rejected before settlement setup', async () => {
  let statusCode = 0
  let responseBody: Record<string, unknown> = {}
  const req = {
    method: 'POST',
    protocol: 'https',
    headers: { host: 'polydesk.trade', 'payment-signature': 'signed-test-payload' },
    originalUrl: '/api/a2mcp/polymarket-smart-trader',
    url: '/api/a2mcp/polymarket-smart-trader',
    body: {},
    query: {},
  } as unknown as Request
  const res = {
    status(code: number) { statusCode = code; return this },
    json(body: Record<string, unknown>) { responseBody = body; return this },
    setHeader() { return this },
  } as unknown as Response
  await okxA2mcpStandardServiceHandler(req, res)
  assert.equal(statusCode, 400)
  assert.match(String(responseBody.error), /No payment challenge was issued/i)
})

test('public DISCOVER is rejected before any smart-trader payment challenge', async () => {
  let dependencyCalls = 0
  const result = await preflightSmartTraderBeforeSettlement({ action: 'DISCOVER', query: 'election' }, {
    validate: async () => { dependencyCalls += 1; return { ok: true as const } },
    operational: async () => { dependencyCalls += 1; return true },
    providers: async () => { dependencyCalls += 1; return { ok: true as const } },
    prepare: async () => { dependencyCalls += 1; throw new Error('must not run') },
  })
  assert.equal(dependencyCalls, 0)
  assert.equal(result.ok, false)
  if (result.ok) assert.fail('expected DISCOVER to remain inside ANALYZE')
  assert.equal(result.status, 400)
  assert.match(String(result.body.error), /included inside the paid ANALYZE workflow/i)
  assert.match(String(result.body.error), /No payment challenge was issued/i)
})

test('smart-trader replay accepts OKX buyer parameters from query while JSON body wins', () => {
  const queryReplay = smartTraderRequestInput({
    query: { action: 'ANALYZE', marketId: 'query-market', outcome: 'Yes', side: 'BUY' },
    body: {},
  })
  assert.equal(queryReplay.action, 'ANALYZE')
  assert.equal(queryReplay.marketId, 'query-market')

  const bodyReplay = smartTraderRequestInput({
    query: { action: 'DISCOVER', marketId: 'query-market' },
    body: { action: 'ANALYZE', marketId: 'body-market' },
  })
  assert.equal(bodyReplay.action, 'ANALYZE')
  assert.equal(bodyReplay.marketId, 'body-market')
})

test('PREPARE provider failures remain non-billable before settlement', async () => {
  let prepareCalls = 0
  const result = await preflightSmartTraderBeforeSettlement({ action: 'PREPARE' }, {
    validate: async () => ({ ok: true as const }),
    operational: async () => true,
    providers: async () => ({ ok: true as const }),
    prepare: async () => {
      prepareCalls += 1
      return { ok: false as const, status: 502, error: 'Polymarket lookup failed: provider unavailable' }
    },
  })
  assert.equal(prepareCalls, 1)
  assert.equal(result.ok, false)
  if (result.ok) assert.fail('expected the provider failure to stop payment processing')
  assert.equal(result.status, 502)
  assert.match(String(result.body.error), /No payment was settled/i)
})

test('successful PREPARE preflight returns the included preview before settlement', async () => {
  const prepared = { ok: true as const, status: 200, data: { ok: true, action: 'PREPARE' } }
  const result = await preflightSmartTraderBeforeSettlement({ action: 'PREPARE' }, {
    validate: async () => ({ ok: true as const }),
    operational: async () => true,
    providers: async () => ({ ok: true as const }),
    prepare: async () => prepared as never,
  })
  assert.equal(result.ok, true)
  if (!result.ok) assert.fail('expected included PREPARE result')
  assert.equal(result.prepared, prepared)
})

test('ANALYZE exact-market lookup failures remain non-billable before settlement', async () => {
  let prepareCalls = 0
  const result = await preflightSmartTraderBeforeSettlement({
    action: 'ANALYZE',
    marketId: 'missing-market',
  }, {
    validate: async () => ({ ok: true as const }),
    operational: async () => true,
    providers: async () => ({ ok: false as const, status: 502, error: 'Polymarket lookup failed: upstream 404' }),
    prepare: async () => { prepareCalls += 1; throw new Error('must not run') },
  })
  assert.equal(prepareCalls, 0)
  assert.equal(result.ok, false)
  if (result.ok) assert.fail('expected exact-market lookup failure')
  assert.equal(result.status, 502)
  assert.match(String(result.body.error), /No payment challenge was issued/i)
})

test('ANALYZE ambiguous discovery outcomes remain non-billable before settlement', async () => {
  let prepareCalls = 0
  const result = await preflightSmartTraderBeforeSettlement({
    action: 'ANALYZE',
    category: 'sports',
    outcome: 'Yes',
    side: 'BUY',
  }, {
    validate: async () => ({ ok: true as const }),
    operational: async () => true,
    providers: async () => ({
      ok: false as const,
      status: 409,
      error: 'The requested outcome maps to 6 active markets. Supply one exact marketId before payment.',
    }),
    prepare: async () => { prepareCalls += 1; throw new Error('must not run') },
  })
  assert.equal(prepareCalls, 0)
  assert.equal(result.ok, false)
  if (result.ok) assert.fail('expected ambiguous discovery to stop payment')
  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /exact marketId before payment/i)
  assert.match(String(result.body.error), /No payment challenge was issued/i)
})

test('football live challenge documents team and date without requiring either filter', async () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/worldcup-live-scores',
    '0.1',
    '0x631c96fba389f65da7093e559e8120b587ec7df4',
  )
  const unpaid = await route.unpaidResponseBody?.({} as never) as {
    body?: { inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }
  }
  assert.ok(unpaid.body?.inputSchema?.properties?.team)
  assert.ok(unpaid.body?.inputSchema?.properties?.date)
  assert.equal(unpaid.body?.inputSchema?.required, undefined)
})

test('football news challenge documents relevance filters', async () => {
  const req = {
    headers: { host: 'polydesk.trade' },
    protocol: 'https',
  } as Request
  const route = buildStandardServiceRouteConfig(
    req,
    '/api/a2mcp/worldcup-market-news',
    '0.1',
    '0x631c96fba389f65da7093e559e8120b587ec7df4',
  )
  const unpaid = await route.unpaidResponseBody?.({} as never) as {
    body?: { inputSchema?: { properties?: Record<string, unknown> } }
  }
  assert.ok(unpaid.body?.inputSchema?.properties?.team)
  assert.ok(unpaid.body?.inputSchema?.properties?.league)
  assert.ok(unpaid.body?.inputSchema?.properties?.type)
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

test('registered portfolio-watch challenge supports a replayable empty flow descriptor', () => {
  const challenge = {
    x402Version: 2,
    resource: { url: 'https://polydesk.trade/api/a2mcp/polymarket-portfolio-watch' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:196',
      amount: '100000',
      asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
      payTo: '0x631c96fba389f65da7093e559e8120b587ec7df4',
      maxTimeoutSeconds: 600,
    }],
  }
  const response = addPortfolioWatchReplaySchema({
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(challenge)).toString('base64url'),
    },
  }, '/api/a2mcp/polymarket-portfolio-watch')
  const decoded = JSON.parse(Buffer.from(response.headers['PAYMENT-REQUIRED'], 'base64url').toString('utf8')) as {
    outputSchema?: {
      input?: {
        action?: { required?: boolean }
        wallet?: { required?: boolean }
      }
      output?: { description?: string }
    }
  }

  assert.equal(decoded.outputSchema?.input?.action?.required, false)
  assert.equal(decoded.outputSchema?.input?.wallet?.required, false)
  assert.match(String(decoded.outputSchema?.output?.description), /empty replay returns the complete flow descriptor/i)
})
