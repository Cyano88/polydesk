import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/layouts/PolyDeskLayout.tsx', import.meta.url), 'utf8')
const marketplace = readFileSync(new URL('../src/pages/AgentMarketplace.tsx', import.meta.url), 'utf8')

test('unresolved authentication renders the restoring screen before sign in', () => {
  const restoringGuard = layout.indexOf('if (!ready || (authenticated && !walletsReady))')
  const signedOutGuard = layout.indexOf('if (!authenticated)')
  assert.ok(restoringGuard >= 0)
  assert.ok(signedOutGuard > restoringGuard)
  assert.match(layout, /Restoring your desk/)
})

test('marketplace is a clear bridge to the official OKX catalogue', () => {
  assert.match(marketplace, /https:\/\/www\.okx\.ai\/agents/)
  assert.match(marketplace, /Explore services on OKX/)
  assert.doesNotMatch(marketplace, /okx-agentic-marketplace|Search live OKX agents|Featured agents from OKX/)
})
