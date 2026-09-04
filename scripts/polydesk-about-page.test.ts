import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const aboutPath = new URL('../src/pages/About.tsx', import.meta.url)

test('investor landing page leads with the verified PolyDesk value proposition', async () => {
  const source = await readFile(aboutPath, 'utf8')

  assert.ok(source.includes('Research the market. Govern the action. Keep the proof.'))
  assert.ok(source.includes('PolyDesk is a Polymarket intelligence and buyer-governed execution platform.'))
  assert.ok(source.includes('Three products. One control layer.'))
  assert.ok(source.includes('polydeskMarketplaceProducts.map'))
  assert.ok(source.includes('marketplaceProductPrice(product)'))
  assert.ok(source.includes('Internal APIs support these products; they are not separate product lines.'))
  assert.ok(!source.includes('Direct APIs'))
  assert.ok(source.includes('The buyer keeps every wallet key and signature'))
})

test('investor landing page exposes inspectable evidence and current integrations', async () => {
  const source = await readFile(aboutPath, 'utf8')

  for (const value of ['Polymarket', 'Hash PayLink', 'OKX.AI', 'Sportmonks', 'ZeroScout', 'X Layer']) assert.ok(source.includes(value))
  for (const path of ['/api/a2mcp/services', '/docs', '/polydesk?service=pulse', 'https://www.okx.ai/agents/5427']) assert.ok(source.includes(path))
  for (const asset of ['/about/polydesk-okx-partnership.jpg', '/about/pulse.png', '/about/trading-membership.png', '/about/okx-marketplace.png']) assert.ok(source.includes(asset))
  assert.ok(!source.includes('future A2MCP'))
  assert.ok(!source.includes('guarantee rewards'))
  assert.ok(source.includes('Profits are not guaranteed.'))
})

test('investor landing page presents the product flow in order', async () => {
  const source = await readFile(aboutPath, 'utf8')
  const stages = ['Market intelligence', 'Buyer-controlled execution', 'Verify and distribute']
  const positions = stages.map(stage => source.indexOf(stage))

  assert.ok(positions.every(position => position >= 0))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
})
