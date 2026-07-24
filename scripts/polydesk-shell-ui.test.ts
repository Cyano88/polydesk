import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/layouts/PolyDeskLayout.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const tradeActivity = readFileSync(new URL('../src/pages/TradeActivity.tsx', import.meta.url), 'utf8')
const portfolioApi = readFileSync(new URL('../api/polymarket-portfolio.ts', import.meta.url), 'utf8')
const agentWorkspace = readFileSync(new URL('../src/pages/AgentWorkspace.tsx', import.meta.url), 'utf8')
const polyDeskPage = readFileSync(new URL('../src/pages/PolyDesk.tsx', import.meta.url), 'utf8')
const polyStream = readFileSync(new URL('../api/poly-stream.ts', import.meta.url), 'utf8')
const paymentLinks = readFileSync(new URL('../src/pages/TelegramPaymentLinks.tsx', import.meta.url), 'utf8')
const lpScoutPanel = readFileSync(new URL('../src/pages/LpScoutPanel.tsx', import.meta.url), 'utf8')
const loadState = readFileSync(new URL('../src/components/PolyDeskLoadState.tsx', import.meta.url), 'utf8')
const productStyles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

test('unresolved authentication renders the compact restoring state before sign in', () => {
  const restoringGuard = layout.indexOf('if (!ready || (authenticated && !walletsReady))')
  const signedOutGuard = layout.indexOf('if (!authenticated)')
  assert.ok(restoringGuard >= 0)
  assert.ok(signedOutGuard > restoringGuard)
  assert.match(layout, /Restoring your desk/)
})

test('refresh and route waits use one compact Polymarket sync state', () => {
  assert.match(layout, /<PolyDeskLoadingState fullScreen label="Restoring your desk" \/>/)
  assert.match(app, /<PolyDeskLoadingState fullScreen label="Opening PolyDesk" \/>/)
  assert.match(loadState, /strokeDashoffset/)
  assert.match(loadState, /animate-ping/)
  assert.match(loadState, /PolymarketMark/)
  assert.doesNotMatch(layout, /Loading your session, wallet and workspace|PolyDeskRestoringScreen/)
  assert.doesNotMatch(paymentLinks, /Loading live board|Loading portfolio|Loading PolyDesk session/)
})

test('workspace navigation exposes one focused Overview, LP Scout and Activity shell', () => {
  assert.match(layout, /label: 'Overview'/)
  assert.match(layout, /label: 'LP Scout'/)
  assert.match(layout, /label: 'Activity'/)
  assert.doesNotMatch(layout, /label: 'App Pay'|label: 'Trade'|label: 'Tip'|WorkspaceUtilityPill/)
  assert.match(polyDeskPage, /initialPortfolioAction="trading"/)
  assert.match(polyDeskPage, /legacyService !== 'app-pay' && legacyService !== 'marketplace'/)
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

test('LP Scout checkout returns through the paid-result continuation on Arc Testnet', () => {
  assert.match(polyDeskPage, /import AgentWorkspace from '\.\/AgentWorkspace'/)
  assert.match(polyDeskPage, /serviceView === 'lp-scout' && searchParams\.get\('run'\) === 'polymarket-scout'/)
  assert.match(polyDeskPage, /<AgentWorkspace \/>/)
  assert.match(agentWorkspace, /const network = 'arc'/)
  assert.doesNotMatch(agentWorkspace, /network === 'base'/)
})

test('football replaces expired World Cup positioning without stale provider defaults', () => {
  assert.match(layout, /LP Scout/)
  assert.match(lpScoutPanel, /Football markets/)
  assert.match(polyStream, /POLY_STREAM_LEAGUE_IDS/)
  assert.match(polyStream, /Verified football board/)
  assert.doesNotMatch(polyStream, /DEFAULT_WORLD_CUP_START_DATE|DEFAULT_FANVIBE_WORLD_CUP_FEED_URL|series_slug: 'soccer-fifwc'/)
})

test('the active LP Scout checkout is isolated from the legacy Telegram surface', () => {
  assert.match(polyDeskPage, /from '\.\/LpScoutPanel'/)
  assert.match(lpScoutPanel, /serviceUrl: '\/api\/x402\/polymarket-scout'/)
  assert.match(lpScoutPanel, /n: 'arc'/)
  assert.doesNotMatch(paymentLinks, /export function LpScoutPanel/)
})

test('active product surfaces share the premium CTA system without the legacy server marketplace', () => {
  assert.match(productStyles, /\.polydesk-primary-cta/)
  assert.match(productStyles, /min-height: 44px/)
  assert.doesNotMatch(server, /okx-agentic-marketplace|okx-marketplace-checkout|okxAgenticWalletReady/)
  assert.doesNotMatch(packageJson, /ensure-onchainos|test:okx-marketplace|smoke:okx-public-marketplace/)
})
