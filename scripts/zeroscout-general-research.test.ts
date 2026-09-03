import assert from 'node:assert/strict'
import test from 'node:test'
import { getZeroScoutGeneralResearch } from '../api/zeroscout-intelligence.js'

const researchMarket = {
  conditionId: '0x' + 'ab'.repeat(32),
  question: 'Will the proposal pass?',
  description: 'The proposal must receive the required vote.',
  resolutionRules: 'Resolves Yes only if the official vote passes before expiry.',
  resolutionSource: 'https://official.example/votes',
}

test('general research sends full market rules to the structured ZeroScout endpoint', async () => {
  const previous = {
    url: process.env.ZEROSCOUT_API_URL,
    secret: process.env.ZEROSCOUT_INTEGRATION_SECRET,
  }
  const originalFetch = globalThis.fetch
  process.env.ZEROSCOUT_API_URL = 'https://zeroscout.example'
  process.env.ZEROSCOUT_INTEGRATION_SECRET = 'test-secret'
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://zeroscout.example/api/integrations/polydesk-general-research')
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer test-secret')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(body.schema, 'zeroscout.polydesk-general-research.request')
    assert.deepEqual(body.market, researchMarket)
    return new Response(JSON.stringify({
      schema: 'zeroscout.polydesk-general-research.result',
      schemaVersion: '1.0.0',
      provider: 'ZeroScout',
      lane: 'general-market',
      articles: [{
        title: 'Proposal vote scheduled',
        description: 'The official vote is scheduled for Friday.',
        source: 'Example Publisher',
        url: 'https://publisher.example/proposal',
        publishedAt: '2026-09-02T12:00:00.000Z',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const articles = await getZeroScoutGeneralResearch('proposal vote', researchMarket)
    assert.equal(articles.length, 1)
    assert.equal(articles[0].source, 'Example Publisher')
  } finally {
    globalThis.fetch = originalFetch
    if (previous.url === undefined) delete process.env.ZEROSCOUT_API_URL
    else process.env.ZEROSCOUT_API_URL = previous.url
    if (previous.secret === undefined) delete process.env.ZEROSCOUT_INTEGRATION_SECRET
    else process.env.ZEROSCOUT_INTEGRATION_SECRET = previous.secret
  }
})

test('general research rejects an unstructured ZeroScout response', async () => {
  const previous = {
    url: process.env.ZEROSCOUT_API_URL,
    secret: process.env.ZEROSCOUT_INTEGRATION_SECRET,
  }
  const originalFetch = globalThis.fetch
  process.env.ZEROSCOUT_API_URL = 'https://zeroscout.example'
  process.env.ZEROSCOUT_INTEGRATION_SECRET = 'test-secret'
  globalThis.fetch = async () => new Response('{"articles":[]}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  try {
    await assert.rejects(
      () => getZeroScoutGeneralResearch('proposal vote', researchMarket),
      /invalid structured response/i,
    )
  } finally {
    globalThis.fetch = originalFetch
    if (previous.url === undefined) delete process.env.ZEROSCOUT_API_URL
    else process.env.ZEROSCOUT_API_URL = previous.url
    if (previous.secret === undefined) delete process.env.ZEROSCOUT_INTEGRATION_SECRET
    else process.env.ZEROSCOUT_INTEGRATION_SECRET = previous.secret
  }
})
