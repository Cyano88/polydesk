import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/layouts/PolyDeskLayout.tsx', import.meta.url), 'utf8')
const appPay = readFileSync(new URL('../src/pages/AppPay.tsx', import.meta.url), 'utf8')
const tradeActivity = readFileSync(new URL('../src/pages/TradeActivity.tsx', import.meta.url), 'utf8')
const portfolioApi = readFileSync(new URL('../api/polymarket-portfolio.ts', import.meta.url), 'utf8')
const agentWorkspace = readFileSync(new URL('../src/pages/AgentWorkspace.tsx', import.meta.url), 'utf8')
const productStyles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

test('unresolved authentication renders the restoring screen before sign in', () => {
  const restoringGuard = layout.indexOf('if (!ready || (authenticated && !walletsReady))')
  const signedOutGuard = layout.indexOf('if (!authenticated)')
  assert.ok(restoringGuard >= 0)
  assert.ok(signedOutGuard > restoringGuard)
  assert.match(layout, /Restoring your desk/)
})

test('App Pay is a clear coming-soon bridge to the official OKX catalogue', () => {
  assert.match(appPay, /https:\/\/www\.okx\.ai\/agents/)
  assert.match(appPay, /Find PolyDesk on OKX/)
  assert.match(appPay, /Coming soon/)
  assert.match(appPay, /polydesk-primary-cta/)
  assert.doesNotMatch(appPay, /okx-agentic-marketplace|Search live OKX agents|Featured agents from OKX/)
})

test('workspace navigation exposes only Portfolio, Trade and experimental App Pay', () => {
  assert.match(layout, /label: 'Portfolio'/)
  assert.match(layout, /label: 'Trade'/)
  assert.match(layout, /label: 'App Pay', badge: 'Experimental'/)
  assert.match(layout, /label: 'Desk Agent'/)
  assert.match(layout, /label: 'Account'/)
  assert.match(layout, /label: 'Watch Wallet'/)
  assert.match(layout, /label: 'Tip'/)
  assert.match(layout, /label: 'Markets'/)
  assert.match(layout, /label: 'Activity'/)
})

test('Trade Activity uses the saved account feed and completed LP Scout records', () => {
  assert.match(portfolioApi, /action === 'activity'/)
  assert.match(portfolioApi, /\/activity\?user=/)
  assert.match(tradeActivity, /polymarket-portfolio\?action=activity/)
  assert.match(tradeActivity, /readSavedLpScoutActivity/)
  assert.match(tradeActivity, /lp-scout-report/)
  assert.match(agentWorkspace, /rememberLpScoutActivity/)
  assert.doesNotMatch(tradeActivity, /records<\/p>|row\.status/)
})

test('active product surfaces share the premium CTA system without the legacy server marketplace', () => {
  assert.match(productStyles, /\.polydesk-primary-cta/)
  assert.match(productStyles, /min-height: 44px/)
  assert.doesNotMatch(server, /okx-agentic-marketplace|okx-marketplace-checkout|okxAgenticWalletReady/)
  assert.doesNotMatch(packageJson, /ensure-onchainos|test:okx-marketplace|smoke:okx-public-marketplace/)
})
