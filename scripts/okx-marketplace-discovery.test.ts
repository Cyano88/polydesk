import assert from 'node:assert/strict'
import test from 'node:test'
import {
  matchOkxMarketplaceService,
  okxMarketplaceServiceLinks,
  okxMarketplaceServices,
  okxMarketplaceServiceUrl,
  wantsOkxMarketplaceServices,
} from '../src/lib/okxMarketplaceServices.js'

test('publishes the five verified OKX service-card links', () => {
  assert.equal(okxMarketplaceServices.length, 5)
  assert.deepEqual(okxMarketplaceServices.map(service => service.serviceId), [33343, 33346, 33344, 33345, 33342])
  for (const service of okxMarketplaceServices) {
    assert.equal(
      okxMarketplaceServiceUrl(service),
      `https://www.okx.ai/agents/5427?source=polydesk#service-${service.serviceId}`,
    )
    assert.match(service.endpoint, /^https:\/\/polydesk-i96m\.onrender\.com\/api\/a2mcp\//)
  }
  assert.equal(okxMarketplaceServiceLinks().length, 5)
})

test('detects generic marketplace discovery phrases', () => {
  assert.equal(wantsOkxMarketplaceServices('I want to use PolyDesk agentic services'), true)
  assert.equal(wantsOkxMarketplaceServices('Show me the pay per call services on OKX'), true)
  assert.equal(wantsOkxMarketplaceServices('Open the agent marketplace services'), true)
  assert.equal(wantsOkxMarketplaceServices('What is the live score?'), false)
})

test('matches a selected marketplace service without hijacking ordinary product questions', () => {
  assert.equal(matchOkxMarketplaceService('Football Match Live Data')?.serviceId, 33343)
  assert.equal(matchOkxMarketplaceService('I need the football news brief')?.serviceId, 33346)
  assert.equal(matchOkxMarketplaceService('use verified Polymarket funding')?.serviceId, 33344)
  assert.equal(matchOkxMarketplaceService('open the governed trader')?.serviceId, 33345)
  assert.equal(matchOkxMarketplaceService('LP Scout')?.serviceId, 33342)
  assert.equal(matchOkxMarketplaceService('How is Real Madrid doing?'), null)
})
