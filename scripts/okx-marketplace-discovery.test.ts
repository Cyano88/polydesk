import assert from 'node:assert/strict'
import test from 'node:test'
import {
  matchOkxMarketplaceService,
  okxMarketplaceServiceLinks,
  okxMarketplaceServices,
  okxMarketplaceServiceUrl,
  okxTradingAgentService,
  okxTradingTaskService,
  wantsOkxMarketplaceServices,
} from '../src/lib/okxMarketplaceServices.js'

test('publishes the registered A2A trading services separately from direct API tools', () => {
  assert.equal(okxTradingTaskService.serviceId, 38484)
  assert.equal(okxTradingTaskService.name, 'One-Off Polymarket Trade')
  assert.equal(okxTradingTaskService.priceUsdt, 0.1)
  assert.equal(
    okxMarketplaceServiceUrl(okxTradingTaskService),
    'https://www.okx.ai/agents/5427?source=polydesk#service-38484',
  )
  assert.equal(okxTradingAgentService.serviceId, 38496)
  assert.equal(okxTradingAgentService.name, 'Managed Polymarket Agent')
  assert.equal(okxTradingAgentService.subscriptionUsdtMonthly, 5)
  assert.equal(okxTradingAgentService.freeTrialDays, 3)
  assert.equal(
    okxMarketplaceServiceUrl(okxTradingAgentService),
    'https://www.okx.ai/agents/5427?source=polydesk#service-38496',
  )
})

test('retains six verified OKX compatibility capabilities but promotes three mapped product links', () => {
  assert.equal(okxMarketplaceServices.length, 6)
  assert.deepEqual(okxMarketplaceServices.map(service => service.serviceId), [33343, 33346, 33344, 33345, 33342, 40269])
  for (const service of okxMarketplaceServices) {
    assert.equal(
      okxMarketplaceServiceUrl(service),
      `https://www.okx.ai/agents/5427?source=polydesk#service-${service.serviceId}`,
    )
    assert.match(service.endpoint, /^https:\/\/polydesk\.trade\/api\/a2mcp\//)
  }
  assert.deepEqual(okxMarketplaceServiceLinks().map(link => link.label), [
    'One-Off Polymarket Trade',
    'Managed Polymarket Agent',
    'Polymarket Integration Audit',
  ])
  assert.deepEqual(okxMarketplaceServiceLinks().map(link => link.url), [
    'https://www.okx.ai/agents/5427?source=polydesk#service-38484',
    'https://www.okx.ai/agents/5427?source=polydesk#service-38496',
    'https://www.okx.ai/agents/5427?source=polydesk#service-40363',
  ])
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
  assert.equal(matchOkxMarketplaceService('Smart Market OOS Trader')?.serviceId, 40269)
  assert.equal(matchOkxMarketplaceService('How is Real Madrid doing?'), null)
})
