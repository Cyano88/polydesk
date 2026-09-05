import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const aboutPath = new URL('../src/pages/About.tsx', import.meta.url)
const appPath = new URL('../src/App.tsx', import.meta.url)
const productAppPath = new URL('../src/ProductApp.tsx', import.meta.url)
const docsLayoutPath = new URL('../src/pages/docs/DocsLayout.tsx', import.meta.url)

test('public root is a foundation site rather than the product application', async () => {
  const [source, app] = await Promise.all([readFile(aboutPath, 'utf8'), readFile(appPath, 'utf8')])

  assert.ok(source.includes('The open control layer for Polymarket agents.'))
  assert.ok(source.includes('Governed prediction-market infrastructure'))
  assert.ok(source.includes('Foundation principle'))
  assert.match(app, /<Route path="\/" element=\{<About \/>\}/)
  assert.match(app, /<Route path="\/polydesk" element=\{<PolyDesk \/>\}/)
  assert.match(app, /<Route path="\/about" element=\{<Navigate to="\/" replace \/>\}/)
})

test('foundation page presents product boundaries without app or marketplace clutter', async () => {
  const source = await readFile(aboutPath, 'utf8')

  assert.ok(source.includes('polydeskMarketplaceProducts.map'))
  assert.ok(source.includes('Three clear ways to use the network.'))
  assert.ok(source.includes('One standard, three entry points'))
  assert.ok(source.includes('Non-custodial by design'))
  assert.ok(source.includes('Versioned machine contracts'))
  for (const removed of ['Direct APIs', 'Agent #5427', 'Sportmonks', 'ZeroScout', 'X Layer', '/about/pulse.png', '/about/okx-marketplace.png']) {
    assert.ok(!source.includes(removed), `public root should not include ${removed}`)
  }
})

test('public navigation separates foundation, integrations, docs, and reference app', async () => {
  const [source, docsLayout, productApp] = await Promise.all([
    readFile(aboutPath, 'utf8'),
    readFile(docsLayoutPath, 'utf8'),
    readFile(productAppPath, 'utf8'),
  ])

  for (const path of ['to="/integrations"', 'to="/docs"', 'href="/polydesk"', 'href="/.well-known/polydesk.json"']) {
    assert.ok(source.includes(path))
  }
  assert.ok(docsLayout.includes('<a href="/polydesk"'))
  assert.ok(productApp.includes('const requiresPrivy ='))
  assert.ok(productApp.includes('!PRIVY_AUTH_ENABLED || !requiresPrivy'))
})
