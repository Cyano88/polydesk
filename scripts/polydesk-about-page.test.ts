import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const aboutPath = new URL('../src/pages/About.tsx', import.meta.url)

test('investor landing page leads with the verified PolyDesk value proposition', async () => {
  const source = await readFile(aboutPath, 'utf8')

  assert.ok(source.includes('The shortest path from a live signal to a verified action.'))
  assert.ok(source.includes('Discover, understand, act, and prove.'))
  assert.ok(source.includes('5 USDT monthly membership with a three-day trial'))
  assert.ok(source.includes("['5', 'pay-per-call agent services']"))
  assert.ok(source.includes("['1', 'A2A trading membership']"))
  assert.ok(source.includes("['0', 'private keys requested']"))
  assert.ok(source.includes("['Live', 'boot-enabled A2A worker']"))
  assert.ok(!source.includes("['24/7'"))
})

test('investor landing page exposes inspectable evidence and current integrations', async () => {
  const source = await readFile(aboutPath, 'utf8')

  for (const value of ['Polymarket', 'Hash PayLink', 'OKX.AI', 'Sportmonks']) assert.ok(source.includes(value))
  for (const path of ['/api/a2mcp/services', '/api/a2a/polydesk-trading-agent', '/docs', '/polydesk?service=pulse']) assert.ok(source.includes(path))
  assert.ok(!source.includes('future A2MCP'))
  assert.ok(!source.includes('guarantee rewards'))
  assert.ok(source.includes('not guarantees of profit'))
})

test('investor landing page presents the product flow in order', async () => {
  const source = await readFile(aboutPath, 'utf8')
  const stages = ['Discover', 'Understand', 'Act within limits', 'Keep the proof']
  const positions = stages.map(stage => source.indexOf(`'${stage}'`))

  assert.ok(positions.every(position => position >= 0))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
})
