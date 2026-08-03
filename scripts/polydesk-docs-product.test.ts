import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const overviewPath = new URL('../src/pages/docs/DocsOverview.tsx', import.meta.url)
const layoutPath = new URL('../src/pages/docs/DocsLayout.tsx', import.meta.url)

test('documentation starts with the main PolyDesk product surfaces', async () => {
  const source = await readFile(overviewPath, 'utf8')
  const labels = ['Pulse', 'Overview', 'Agent', 'LP Scout', 'Watch', 'Tip', 'Activity', 'Rewards']
  const positions = labels.map(label => source.indexOf(`>${label}</Link>`))

  assert.ok(positions.every(position => position >= 0), 'every main product surface must be documented')
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'product surfaces must follow the app navigation order')
  assert.ok(source.indexOf('Start with the product') < source.indexOf('Where Hash PayLink fits'))
  assert.ok(source.indexOf('Where Hash PayLink fits') < source.indexOf('For agents and developers'))
})

test('documentation navigation prioritizes the product guide', async () => {
  const source = await readFile(layoutPath, 'utf8')

  assert.ok(source.indexOf("label: 'Product'") < source.indexOf("label: 'Agent services'"))
  assert.ok(source.includes("{ label: 'Product guide', path: '/docs', end: true }"))
})
