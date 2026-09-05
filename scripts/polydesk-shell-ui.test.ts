import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildPolymarketLpRewardSnapshots, calculatePolymarketLpNetResult, polymarketConditionIdFromTokenMarket } from '../src/lib/polymarketRewards'
import { polymarketLpGammaIdentity, polymarketLpSlugFromUrl } from '../api/polymarket-lp-recovery'
import { isActivePolymarketPosition, polymarketPositionStatus } from '../src/lib/polymarketPositionStatus'
import { lpRewardTargetMetrics } from '../api/lp-reward-target'
import { assessLpProbe } from '../src/lib/lpProbeOptimization'
import { rankLpOpportunitiesByMeasurements } from '../src/lib/lpMeasuredRanking'
import { lpCapitalReadiness, lpWithdrawalReadiness, readablePolymarketCapitalError } from '../src/lib/lpCapitalReadiness'
import { mergeVerifiedRewardMarket, verifiedDailyRewardPool } from '../api/polymarket-reward-market'

const layout = readFileSync(new URL('../src/layouts/PolyDeskLayout.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const integrationsPage = readFileSync(new URL('../src/pages/Integrations.tsx', import.meta.url), 'utf8')
const aboutPage = readFileSync(new URL('../src/pages/About.tsx', import.meta.url), 'utf8')
const docsLayout = readFileSync(new URL('../src/pages/docs/DocsLayout.tsx', import.meta.url), 'utf8')
const docsOverview = readFileSync(new URL('../src/pages/docs/DocsOverview.tsx', import.meta.url), 'utf8')
const tradeActivity = readFileSync(new URL('../src/pages/TradeActivity.tsx', import.meta.url), 'utf8')
const portfolioApi = readFileSync(new URL('../api/polymarket-portfolio.ts', import.meta.url), 'utf8')
const agentWorkspace = readFileSync(new URL('../src/pages/AgentWorkspace.tsx', import.meta.url), 'utf8')
const polyDeskPage = readFileSync(new URL('../src/pages/PolyDesk.tsx', import.meta.url), 'utf8')
const polyStream = readFileSync(new URL('../api/poly-stream.ts', import.meta.url), 'utf8')
const paymentLinks = readFileSync(new URL('../src/pages/TelegramPaymentLinks.tsx', import.meta.url), 'utf8')
const lpScoutPanel = readFileSync(new URL('../src/pages/LpScoutPanel.tsx', import.meta.url), 'utf8')
const lpScoutApi = readFileSync(new URL('../api/x402-polymarket-scout.ts', import.meta.url), 'utf8')
const pulsePage = readFileSync(new URL('../src/pages/Pulse.tsx', import.meta.url), 'utf8')
const pulseApi = readFileSync(new URL('../api/pulse.ts', import.meta.url), 'utf8')
const lpContextApi = readFileSync(new URL('../api/lp-context-intelligence.ts', import.meta.url), 'utf8')
const limitOrderTicket = readFileSync(new URL('../src/components/PolymarketLimitOrderTicket.tsx', import.meta.url), 'utf8')
const builderHandoff = readFileSync(new URL('../api/polymarket-builder-handoff.ts', import.meta.url), 'utf8')
const opportunityPage = readFileSync(new URL('../src/pages/Opportunity.tsx', import.meta.url), 'utf8')
const opportunityApi = readFileSync(new URL('../api/pulse-opportunity.ts', import.meta.url), 'utf8')
const opportunityImage = readFileSync(new URL('../src/lib/lpOpportunityShareImage.ts', import.meta.url), 'utf8')
const lpScoutReport = readFileSync(new URL('../src/pages/LPScoutReport.tsx', import.meta.url), 'utf8')
const dynamicSendButton = readFileSync(new URL('../src/components/DynamicSendButton.tsx', import.meta.url), 'utf8')
const agentIcon = readFileSync(new URL('../src/components/PolyDeskAgentIcon.tsx', import.meta.url), 'utf8')
const agentAskApi = readFileSync(new URL('../api/agent-ask.ts', import.meta.url), 'utf8')
const loadState = readFileSync(new URL('../src/components/PolyDeskLoadState.tsx', import.meta.url), 'utf8')
const productStyles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const chunkRecovery = readFileSync(new URL('../src/lib/chunkRecovery.ts', import.meta.url), 'utf8')

test('SPA shell prevents stale deploy HTML and recovers one failed lazy chunk load', () => {
  assert.match(server, /Cache-Control', 'no-store, max-age=0'/)
  assert.match(server, /app\.get\('\/assets\/\*'/)
  assert.match(chunkRecovery, /Failed to fetch dynamically imported module/)
  assert.match(chunkRecovery, /window\.location\.replace/)
  assert.match(chunkRecovery, /polydesk:chunk-recovery:v1/)
  assert.match(main, /recoverFromChunkLoadFailure/)
  assert.match(paymentLinks, /PolyDesk was updated\. Reloading the latest version/)
})
const productApp = readFileSync(new URL('../src/ProductApp.tsx', import.meta.url), 'utf8')
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
const rateLimit = readFileSync(new URL('../api/rate-limit.ts', import.meta.url), 'utf8')
const lpScoutReportApi = readFileSync(new URL('../api/lp-scout-report.ts', import.meta.url), 'utf8')
const agentActivityApi = readFileSync(new URL('../api/agent-activity-read.ts', import.meta.url), 'utf8')
const alertMonitor = readFileSync(new URL('../api/polymarket-alert-monitor.ts', import.meta.url), 'utf8')
const alertRules = readFileSync(new URL('../api/polymarket-alert-rules.ts', import.meta.url), 'utf8')
const emailProvider = readFileSync(new URL('../api/email-provider.ts', import.meta.url), 'utf8')

test('unresolved authentication restores once, then keeps the product publicly browsable without a global sign-in prompt', () => {
  const restoringGuard = layout.indexOf('if (!localPreview && (!ready || (authenticated && !walletsReady)))')
  assert.ok(restoringGuard >= 0)
  assert.match(layout, /Restoring your desk/)
  assert.match(layout, /import\.meta\.env\.DEV && searchParams\.get\('preview'\) === '1'/)
  assert.doesNotMatch(layout, /portfolio: previewMode \? 'preview' : 'trading'/)
  assert.match(layout, /<Link to=\{makeTo\('portfolio', \{ portfolio: 'trading', wallet: 'positions' \}\)\} className="group flex items-center/)
  assert.doesNotMatch(layout, /debugLabel="polydesk-header-sign-in"/)
  assert.doesNotMatch(layout, />\s*Sign in\s*</)
  assert.doesNotMatch(layout, /if \(!localPreview && !authenticated\)/)
  assert.match(polyDeskPage, /activeServiceView \|\| 'portfolio'/)
})

test('refresh and route waits use one compact Polymarket sync state', () => {
  assert.match(layout, /<PolyDeskLoadingState fullScreen label="Restoring your desk" \/>/)
  assert.match(app, /<PolyDeskLoadingState fullScreen label="Opening PolyDesk" \/>/)
  assert.match(loadState, /MarketCardSkeleton/)
  assert.match(loadState, /animate-pulse/)
  assert.match(loadState, /PolymarketMark/)
  assert.doesNotMatch(loadState, />Loading|>Syncing|>Restoring|>Connecting|>Connect</)
  assert.doesNotMatch(layout, /Loading your session, wallet and workspace|PolyDeskRestoringScreen/)
  assert.doesNotMatch(paymentLinks, /Loading live board|Loading portfolio|Loading PolyDesk session/)
})

test('public Pulse defers wallet, agent and trading surfaces until they are opened', () => {
  assert.match(polyDeskPage, /lazy\(\(\) => import\('\.\/TelegramPaymentLinks'\)/)
  assert.match(polyDeskPage, /lazy\(\(\) => import\('\.\.\/components\/PolymarketLimitOrderTicket'\)/)
  assert.match(polyDeskPage, /PolyDeskLoadingState label="Opening workspace"/)
  assert.doesNotMatch(polyDeskPage, /import \{[^}]*PolyPortfolioPanel[^}]*\} from '\.\/TelegramPaymentLinks'/s)
  assert.match(pulsePage, /lazy\(\(\) => import\('\.\.\/components\/PolymarketLimitOrderTicket'\)/)
  assert.match(pulsePage, /PolyDeskLoadingState label="Opening order ticket"/)
})

test('operator console keeps four primary destinations and two control sections', () => {
  const primaryNav = layout.slice(layout.indexOf('const navItems = ['), layout.indexOf('] as const'))
  assert.match(layout, /label: 'Control'/)
  assert.match(layout, /label: 'Markets'/)
  assert.match(layout, /label: 'Agent'/)
  assert.match(layout, /label: 'Receipts'/)
  assert.doesNotMatch(primaryNav, /\{ id: 'activity', label: 'Activity'/)
  assert.match(layout, /aria-label="Control sections"/)
  assert.match(layout, /controlSection === item\.id/)
  assert.match(layout, /inline-flex h-7 items-center/)
  assert.doesNotMatch(polyDeskPage, /sticky top-\[61px\]|function OverviewTabs/)
  assert.match(layout, /aria-label="PolyDesk workspace"/)
  assert.match(layout, /aria-label="PolyDesk desktop workspace"/)
  assert.match(layout, /hidden w-full max-w-3xl grid-cols-4/)
  assert.match(layout, /LayoutDashboard/)
  assert.match(layout, /MarketsIcon/)
  assert.match(layout, /FileText/)
  assert.match(layout, /PolyDeskAgentIcon/)
  assert.match(layout, /'fixed inset-x-0 bottom-0 z-50 border-t/)
  assert.match(layout, /pb-\[var\(--polydesk-footer-height\)\]/)
  assert.match(layout, /mobileKeyboardOpen && '!pb-0'/)
  assert.doesNotMatch(layout, /<header[^>]+backdrop-blur|<footer[^>]+backdrop-blur/)
  assert.doesNotMatch(layout, /<header[^>]+bg-white\/|<footer[^>]+bg-white\//)
  assert.match(layout, /grid h-\[var\(--polydesk-footer-height\)\] w-full max-w-2xl grid-cols-4/)
  assert.match(layout, /md:hidden/)
  assert.doesNotMatch(layout, /w-\[min\(26rem,calc\(100%-2rem\)\)\]/)
  assert.ok(layout.indexOf("label: 'Control'") < layout.indexOf("label: 'Markets'"))
  assert.match(layout, /service === 'activity'/)
  assert.doesNotMatch(primaryNav, /label: 'Pulse'|label: 'Overview'|label: 'LP Scout'|label: 'Tip'|WorkspaceUtilityPill/)
  assert.match(layout, /id: 'account',/)
  assert.match(layout, /\{ id: 'monitors', label: 'Monitors'/)
  assert.doesNotMatch(layout, /\{ id: 'tip', label: 'Tip'/)
  assert.match(polyDeskPage, /initialPortfolioAction=\{portfolioAction\}/)
  assert.match(polyDeskPage, /activeServiceView \|\| 'portfolio'/)
  assert.match(polyDeskPage, /legacyService !== 'app-pay' && legacyService !== 'marketplace'/)
})

test('PolyDesk Agent uses the extracted modern composer without category selection', () => {
  assert.match(polyDeskPage, /singlePolyDeskAgent/)
  assert.match(polyDeskPage, />Agent workspace</)
  assert.match(paymentLinks, /!singlePolyDeskAgent/)
  assert.match(paymentLinks, /<DynamicSendButton/)
  assert.match(dynamicSendButton, /ArrowUp, Plus, Square/)
  assert.match(dynamicSendButton, /rounded-full/)
  assert.match(agentIcon, /polydesk-chat-icon__bubble/)
  assert.doesNotMatch(agentIcon, /__head|__eye|__antenna|__mouth/)
  assert.match(paymentLinks, /const activePolyDeskSubMode = singlePolyDeskAgent/)
  assert.match(polyDeskPage, /initialPayer=\{ownerKey\}/)
  assert.match(polyDeskPage, /identity:\$\{privyIdentity\}/)
  assert.match(polyDeskPage, /polydesk-preview-agent/)
  assert.match(agentAskApi, /polydesk-\(preview\|web\)/)
  assert.match(agentAskApi, /deepPolyDeskRequest/)
  assert.match(agentAskApi, /Deep market research is temporarily unavailable/)
  assert.match(paymentLinks, /technicalIdentity/)
  assert.match(paymentLinks, /Uses the PolyDesk operator console for markets/)
  assert.match(polyDeskPage, /Financial actions still require your approval/)
  assert.match(polyDeskPage, /hidePowerBadge/)
  assert.doesNotMatch(polyDeskPage, /live football|football news|pay-per-call services/)
  assert.match(paymentLinks, /wantsOkxMarketplaceServices/)
  assert.match(paymentLinks, /okxMarketplaceServiceLinks/)
  assert.match(paymentLinks, /okxMarketplaceServiceUrl/)
  assert.match(paymentLinks, /Which PolyDesk pay-per-call service do you want to use/)
  assert.doesNotMatch(polyDeskPage, /Prediction-market intelligence/)
  assert.match(polyDeskPage, /immersive/)
  assert.doesNotMatch(polyDeskPage, /overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card/)
  assert.match(paymentLinks, /data-polydesk-live-score-widget/)
  assert.match(paymentLinks, /latest news\|headlines\?/)
  assert.match(paymentLinks, /const wantsNews = .*latest news/)
  assert.match(paymentLinks, /const wantsFixture = !wantsNews/)
  assert.match(paymentLinks, /data\.mode !== 'live'/)
  assert.match(paymentLinks, /pulseOpportunityAnswer/)
  assert.match(paymentLinks, /wantsPublicLpShortlist/)
  assert.match(paymentLinks, /PolyDesk's strongest live LP opportunities/)
  assert.match(paymentLinks, /inferredPolyDeskSubMode: PolyDeskSubMode \| '' = polyPortfolioFundingDraft/)
  assert.match(paymentLinks, /singlePolyDeskAgent[\s\S]*inferredPolyDeskSubMode \|\| polyDeskSubMode/)
  assert.match(paymentLinks, /lp\(\?:\\s\+scout\)\?/)
  assert.match(paymentLinks, /my name\(\?:\\s\+is\|\['’\]s\)/)
  assert.match(paymentLinks, /\^\(identity\|polydesk\(\?:-web\)\?\)\$/)
  assert.match(paymentLinks, /Funding cancelled\. No checkout was created\./)
  assert.match(paymentLinks, /const portfolioAddress = profile\?\.depositWalletAddress \|\| profile\?\.polymarketAddress/)
  assert.match(paymentLinks, /polymarketWallet: fundingAddress/)
  assert.match(paymentLinks, /Activate your PolyDesk trading account before funding it\./)
  assert.match(paymentLinks, /combined PnL/)
  assert.match(paymentLinks, /Watch portfolio/)
  assert.match(paymentLinks, /portfolio=external/)
  assert.match(paymentLinks, /Nothing was submitted; try again shortly\./)
  assert.match(paymentLinks, /\^\\\/\(\?!\\\/\)/)
  assert.match(paymentLinks, /service=portfolio&portfolio=trading&wallet=positions/)
  assert.match(paymentLinks, /service=worldcup-news/)
  assert.match(paymentLinks, /service=football/)
  assert.match(paymentLinks, /\/polydesk\?service=lp-scout&/)
  assert.match(polyDeskPage, /Ask about markets or portfolio state/)
  assert.match(polyDeskPage, /normalizeTradingWalletTab/)
  assert.match(polyDeskPage, /initialTradingWalletTab=\{tradingWalletTab\}/)
  assert.match(agentAskApi, /what can you do[\s\S]*qualityMode: 'fast'/)
  assert.doesNotMatch(agentAskApi, /Ask me to create a PayLink or check payment details here/)
  assert.doesNotMatch(agentAskApi, /Open Portfolio, Football, or LP Scout/)
  assert.match(layout, /mobileKeyboardOpen/)
  assert.match(layout, /mobileKeyboardOpen && 'hidden'/)
  assert.match(layout, /data-polydesk-keyboard-open=\{mobileKeyboardOpen/)
  assert.match(layout, /\[--polydesk-footer-height:calc\(4rem\+env\(safe-area-inset-bottom\)\)\]/)
  assert.match(layout, /pb-\[var\(--polydesk-footer-height\)\]/)
  assert.match(layout, /h-\[var\(--polydesk-footer-height\)\]/)
  assert.match(layout, /min-h-\[100dvh\]/)
  assert.match(layout, /h-\[100dvh\] overflow-hidden/)
  assert.match(layout, /!max-w-2xl self-stretch/)
  assert.match(polyDeskPage, /h-full min-h-0 w-full !max-w-2xl/)
  assert.match(paymentLinks, /min-h-0 w-full max-w-none flex-1 flex-col/)
  assert.match(layout, /position: 'fixed'/)
  assert.match(layout, /top: `\$\{mobileViewportTop\}px`/)
  assert.match(layout, /height: `\$\{mobileViewportHeight\}px`/)
  assert.match(layout, /const viewportReduction = Math\.max\(0, settledViewportHeight - viewport\.height\)/)
  assert.match(layout, /const viewportBottomGap = Math\.max\(0, window\.innerHeight - viewport\.height - viewport\.offsetTop\)/)
  assert.match(layout, /keyboardWasOpen && keyboardOccupiesViewport/)
  assert.match(layout, /applyKeyboardState\(keyboardOccupiesViewport\)/)
  assert.match(layout, /settledViewportHeight = viewport\.height/)
  assert.match(layout, /normal[\s\S]*resize, zoom or split-screen change/)
  assert.match(layout, /document\.addEventListener\('focusin', updateKeyboardState\)/)
  assert.match(layout, /data-polydesk-keyboard-open=/)
  assert.doesNotMatch(layout, /window\.innerHeight - viewport\.height > 120/)
  assert.match(paymentLinks, /polydesk-agent-composer shrink-0/)
  assert.match(paymentLinks, /window\.setTimeout\(scrollToLatest, 180\)/)
})

test('Portfolio consolidates balance, owned actions and watched-market trading', () => {
  const tradingSurface = paymentLinks.slice(
    paymentLinks.indexOf('{/* Main wallet card */}'),
    paymentLinks.indexOf('{pendingSellPosition'),
  )
  assert.match(paymentLinks, /Portfolio balance/)
  assert.match(paymentLinks, /\{ label: 'Total pUSD', value: tradingPusdDisplay \}/)
  assert.match(paymentLinks, /\{ label: 'Reserved', value: reservedTradingPusdDisplay \}/)
  assert.match(paymentLinks, /\{ label: 'Available', value: availableTradingPusdDisplay \}/)
  assert.match(paymentLinks, /Reserved funds remain yours but cannot fund another quote until cancelled/)
  assert.match(paymentLinks, /\{ label: 'Positions', value: formatUsd\(activePositionValue\) \}/)
  assert.match(paymentLinks, /Claimable \{formatUsd\(claimableValue\)\}/)
  assert.match(paymentLinks, /hasConfirmedTradingCash && hasConfirmedTradingPositions/)
  assert.match(paymentLinks, /Balance temporarily unavailable\./)
  assert.match(paymentLinks, /tradingPusdFailureCount >= 2/)
  assert.doesNotMatch(paymentLinks, /\{tradingPusdError && <p className="mt-3 text-xs text-amber/)
  assert.match(paymentLinks, /\{ key: 'monitor', label: 'Alerts'/)
  assert.match(paymentLinks, /Portfolio notifications/)
  assert.match(paymentLinks, /Save notifications/)
  assert.match(portfolioApi, /action === 'set-integration-source'/)
  assert.match(portfolioApi, /polymarketIntegrationSource\(body\.integrationSource\)/)
  assert.match(paymentLinks, /\{ key: 'orders', label: 'Open LP orders'/)
  assert.match(paymentLinks, /tradingWalletTab === 'monitor'/)
  assert.doesNotMatch(polyDeskPage, /tab === 'monitor'\) openPortfolioAction\('watch'\)/)
  assert.doesNotMatch(paymentLinks, /aria-label="Refresh(?: portfolio balance| PolyDesk positions| markets)?"/)
  assert.doesNotMatch(tradeActivity, /RefreshCw|aria-label="Refresh activity"/)
  assert.doesNotMatch(limitOrderTicket, /Refresh performance|\? 'Refresh'/)
  assert.match(paymentLinks, /window\.setInterval\(\(\) => \{[\s\S]*fetchLiveData\(liveDataAddress\)/)
  assert.match(paymentLinks, /Trade this market/)
  assert.match(polyDeskPage, /orderSource="watch-position"/)
  assert.doesNotMatch(tradingSurface, /title="Sign out wallet"/)
  assert.doesNotMatch(tradingSurface, />\s*Change\s*</)
})

test('public foundation promotes agent and platform integrations without marketing a consumer app', () => {
  assert.match(app, /path="\/integrations" element=\{<Integrations \/>\}/)
  assert.doesNotMatch(layout, /to="\/integrations"/)
  assert.match(integrationsPage, /For agents/)
  assert.match(integrationsPage, /For platforms/)
  assert.doesNotMatch(integrationsPage, /For people|web application|Open PolyDesk|Ask PolyDesk|\/polydesk\?/)
  assert.doesNotMatch(aboutPage, /reference application|Open app|Open reference app|href="\/polydesk"/)
  assert.match(aboutPage, /One standard, two integration paths/)
  assert.match(docsLayout, />\s*Manifest/)
  assert.doesNotMatch(docsLayout, /Open app|href="\/polydesk"/)
  assert.match(docsOverview, /Integrate governed Polymarket services/)
  assert.doesNotMatch(docsOverview, /\/polydesk\?|Open Pulse|Open Watch|Open Tip|Ask the Agent/)
  assert.match(integrationsPage, /polydeskMarketplaceProducts/)
  assert.match(integrationsPage, /Three products\. One non-custodial control layer\./)
  assert.doesNotMatch(integrationsPage, /okxMarketplaceServices|Smart Market OOS Trader|Agent Trade Rail|Research Mission/)
  assert.match(integrationsPage, /to='\/docs\/okx-ai'/)
  assert.match(integrationsPage, /href='\/api\/a2mcp\/services'/)
  assert.match(integrationsPage, /never requests wallet secrets/)
  assert.match(integrationsPage, /Hash PayLink remains the funding checkout/)
  assert.match(integrationsPage, /Machine-readable manifest/)
  assert.match(integrationsPage, /\.well-known\/polydesk\.json/)
  assert.match(server, /app\.get\('\/.well-known\/polydesk\.json', readLimiter, a2mcpServicesHandler\)/)
})

test('Markets shows one strongest opportunity without duplicating it in the ranked list', () => {
  assert.doesNotMatch(pulsePage, /Pulse rotation|setActive/)
  assert.match(pulsePage, /PULSE_SESSION_MAX_AGE_MS = 10 \* 60_000/)
  assert.match(pulsePage, /sessionStorage\.setItem\(PULSE_SESSION_KEY/)
  assert.match(pulsePage, /requestRef\.current\?\.key === requestKey/)
  assert.match(pulsePage, /response\.json\(\)\.catch\(\(\) => null\)/)
  assert.match(pulsePage, /document\.visibilityState === 'visible'/)
  assert.doesNotMatch(pulseApi, /STALE_CACHE_MS|stale-while-revalidate/)
  assert.match(pulseApi, /Cache-Control', 'public, max-age=15'/)
  assert.match(pulseApi, /Server-Timing/)
  assert.match(pulseApi, /X-PolyDesk-Pulse-Cache/)
  assert.match(pulsePage, /PolymarketLimitOrderTicket/)
  assert.match(pulsePage, /polydesk-card group relative block h-\[280px\]/)
  assert.doesNotMatch(pulsePage, /ShieldCheck|Human quote guide/)
  assert.doesNotMatch(pulsePage, /rounded-3xl bg-gray-950/)
  assert.match(pulseApi, /\.slice\(0, 3\)/)
  assert.match(pulseApi, /budget, dailyTarget, candidateLimit: 80, opportunityLimit: 10/)
  assert.doesNotMatch(pulseApi, /filter\(fitsTargetCapital\)/)
  assert.match(pulseApi, /index === 0 \? 'Strongest opportunity'/)
  assert.match(pulsePage, /ordinal\(lead\.rank\)/)
  assert.match(pulsePage, /const otherMarkets = markets/)
  assert.match(pulsePage, /opportunityKey\(market\) !== opportunityKey\(lead\.opportunity\)/)
  assert.match(pulsePage, /rankMedal\(rank\)/)
  assert.doesNotMatch(pulsePage, /markets\.slice\(0, 5\)/)
  assert.match(pulsePage, /🥇/)
  assert.match(pulsePage, /USDC two-sided setup/)
  assert.match(pulsePage, /USDC\/day market pool/)
  assert.match(pulsePage, /Daily LP reward target in USDC/)
  assert.match(pulsePage, /Two-sided setup estimates the minimum across both suggested quotes/)
  assert.match(pulsePage, /target needs/)
  assert.match(pulseApi, /combinedScore/)
  assert.match(lpScoutApi, /targetRankScore/)
  assert.match(lpScoutApi, /iran\(\?:ian\)\?/)
  assert.doesNotMatch(pulseApi, /news:coming-soon|football:coming-soon/)
  assert.match(pulsePage, /Ranked Polymarket opportunities for the capital and daily target you set/)
  assert.match(pulsePage, /ContextLabels/)
  assert.match(lpContextApi, /articleMatchesOpportunity/)
  assert.match(lpContextApi, /footballMatchMatchesOpportunity/)
  assert.doesNotMatch(pulsePage, />Trade</)
  assert.match(pulseApi, /marketUrl\?\.startsWith\('https:\/\/polymarket\.com\/event\/'\)/)
  assert.match(server, /app\.get\('\/api\/pulse', readLimiter, pulseHandler\)/)
  assert.match(server, /req\.query\.action \?\? req\.body\?\.action/)
  assert.match(server, /warmPulse\('startup'\)/)
  assert.match(server, /warmPulse\('scheduled'\)/)
  assert.match(server, /scheduledWarm\.unref\(\)/)
  assert.match(layout, /touch-manipulation/)
  assert.match(productStyles, /\[data-polydesk-product-ui\] :is\(button, a\)/)
})

test('market reward ticket separates instant buying, two-sided quotes, scoring, and projected risk', () => {
  assert.match(limitOrderTicket, /Buy now/)
  assert.match(limitOrderTicket, /Earn market rewards/)
  assert.match(limitOrderTicket, /Add \{complementaryOutcome\} reward quote/)
  assert.match(limitOrderTicket, /Both sides submitted/)
  assert.match(limitOrderTicket, /\/order-scoring\?order_id=/)
  assert.match(limitOrderTicket, /Reward eligible/)
  assert.match(limitOrderTicket, /Not scoring yet/)
  assert.match(limitOrderTicket, /Max payout/)
  assert.match(limitOrderTicket, /Profit if \$\{outcome\} wins/)
  assert.match(limitOrderTicket, /Amount at risk/)
  assert.match(limitOrderTicket, /Reserved \{capitalReadiness\.reservedUsdc/)
  assert.match(limitOrderTicket, /Fund shortfall/)
  assert.match(limitOrderTicket, /Manage open orders/)
  assert.match(limitOrderTicket, /insufficientAvailableCapital/)
  assert.match(limitOrderTicket, /readablePolymarketCapitalError/)
  assert.match(limitOrderTicket, /wallet=fund&amount=/)
  assert.match(paymentLinks, /portfolioSearchParams\.get\('amount'\)/)
  assert.match(limitOrderTicket, /belowRewardMinimum/)
  assert.match(limitOrderTicket, /meet the displayed reward minimum/)
  assert.match(limitOrderTicket, /Estimated two-sided setup/)
  assert.match(limitOrderTicket, /action=positions/)
  assert.match(limitOrderTicket, /Live P&L appears after another trader matches your quote/)
  assert.match(limitOrderTicket, /Market rewards settle separately/)
  assert.match(limitOrderTicket, /border-blue-600 bg-blue-600/)
  assert.match(limitOrderTicket, /border-red-600 bg-red-600/)
  assert.doesNotMatch(limitOrderTicket, /bg-gradient-to-br|shadow-\[0_8px_20px/)
  assert.match(limitOrderTicket, /action: 'register-lp-order'/)
  assert.match(limitOrderTicket, /marketId: plan\.market\.conditionId/)
  assert.match(limitOrderTicket, /action: 'mark-lp-order-cancelled'/)
  assert.match(limitOrderTicket, /sdkOrderType,\s*journey === 'earn-rewards',\s*false,/)
  assert.doesNotMatch(limitOrderTicket, /sdkOrderType, false, journey === 'earn-rewards'/)
  assert.match(builderHandoff, /value\.postOnly !== postOnly/)
  assert.match(builderHandoff, /source === 'lp-scout-limit' \|\| source === 'lp-scout-buy'/)
  assert.match(builderHandoff, /source === 'watch-position-limit' \|\| source === 'watch-position-buy'/)
  assert.doesNotMatch(limitOrderTicket, /Starting LP order monitoring|Set up portfolio monitoring from Overview/)
})

test('portfolio LP rewards use official share and daily pool data', () => {
  const feasibleTarget = lpRewardTargetMetrics({ dailyPoolUsdc: 300, minimumSetupUsdc: 19, capitalUsdc: 45, dailyTargetUsdc: 1 })
  assert.equal(Number(feasibleTarget.requiredRewardSharePercentage?.toFixed(3)), 0.333)
  assert.equal(feasibleTarget.minimumSetupCovered, true)
  const underfundedTarget = lpRewardTargetMetrics({ dailyPoolUsdc: 129, minimumSetupUsdc: 48.4, capitalUsdc: 45, dailyTargetUsdc: 1 })
  assert.equal(underfundedTarget.minimumSetupCovered, false)
  const fundedTarget = lpRewardTargetMetrics({ dailyPoolUsdc: 129, minimumSetupUsdc: 48.4, capitalUsdc: 500, dailyTargetUsdc: 1 })
  assert.equal(underfundedTarget.targetScore, fundedTarget.targetScore)
  const snapshots = buildPolymarketLpRewardSnapshots({
    orders: [{ orderId: 'order-1', assetId: '123' }],
    userMarkets: [{
      condition_id: '0xmarket',
      tokens: [{ token_id: '123' }],
      earning_percentage: 2,
      rewards_config: [{ rate_per_day: 130, asset_address: 'usdc' }],
      earnings: [{ earnings: 0.25, asset_address: 'usdc', asset_rate: 1 }],
    }],
    currentMarkets: [],
    percentages: {},
    scoring: { 'order-1': true },
  })
  assert.equal(snapshots['order-1'].earnedTodayUsdc, 0.25)
  assert.equal(snapshots['order-1'].estimatedDailyUsdc, 2.6)
  assert.equal(snapshots['order-1'].scoring, true)
  const partial = buildPolymarketLpRewardSnapshots({
    orders: [{ orderId: 'order-1', assetId: '123' }],
    userMarkets: [],
    currentMarkets: [{ condition_id: '0xmarket', tokens: [{ token_id: '123' }], rewards_config: [{ rate_per_day: 130 }] }],
    percentages: { '0xmarket': 2 },
    scoring: {},
  })
  assert.equal(partial['order-1'].earnedTodayUsdc, null)
  assert.equal(partial['order-1'].estimatedDailyUsdc, 2.6)
  const confirmedEmpty = buildPolymarketLpRewardSnapshots({
    orders: [{ orderId: 'order-1', marketId: '0xmarket', assetId: '123' }],
    userMarkets: [],
    currentMarkets: [{ condition_id: '0xmarket', rewards_config: [{ rate_per_day: 130 }] }],
    percentages: { '0xmarket': 2 },
    scoring: { 'order-1': true },
    earningsAvailable: true,
  })
  assert.equal(confirmedEmpty['order-1'].earnedTodayUsdc, 0)
  const scoringOnlyCondition = '0x2222222222222222222222222222222222222222222222222222222222222222'
  const scoringOnly = buildPolymarketLpRewardSnapshots({
    orders: [{ orderId: 'order-2', marketId: scoringOnlyCondition, assetId: '456' }],
    userMarkets: [],
    currentMarkets: [],
    percentages: {},
    scoring: { 'order-2': true },
    earningsAvailable: true,
  })
  assert.equal(scoringOnly['order-2'].conditionId, scoringOnlyCondition)
  assert.equal(scoringOnly['order-2'].scoring, true)
  assert.equal(scoringOnly['order-2'].earnedTodayUsdc, 0)
  assert.equal(scoringOnly['order-2'].estimatedDailyUsdc, null)
  assert.equal(polymarketConditionIdFromTokenMarket({ condition_id: '0xMARKET' }), '0xmarket')
  assert.equal(polymarketConditionIdFromTokenMarket({}), null)
  const gammaConditionId = '0x1111111111111111111111111111111111111111111111111111111111111111'
  const gammaTitle = `Will Harry Kane win the 2026 Ballon d'Or?`
  assert.deepEqual(polymarketLpGammaIdentity([{ markets: [{
    question: gammaTitle,
    conditionId: gammaConditionId,
    outcomes: ['Yes', 'No'],
    clobTokenIds: ['123', '456'],
  }] }], gammaTitle, 'YES'), { marketId: gammaConditionId, assetId: '123' })
  assert.equal(polymarketLpSlugFromUrl('https://polymarket.com/event/ballon-dor-winner-2026'), 'ballon-dor-winner-2026')
  assert.equal(polymarketLpSlugFromUrl('https://example.com/event/not-polymarket'), null)
  assert.equal(calculatePolymarketLpNetResult({ rewardsToday: 0.25, makerRebatesToday: 0.1, positionPnl: 2.4 }), 2.75)
  assert.equal(calculatePolymarketLpNetResult({ rewardsToday: 0.25, makerRebatesToday: 0.1, positionPnl: -1 }), -0.65)
  assert.equal(calculatePolymarketLpNetResult({ rewardsToday: null, makerRebatesToday: 0.1, positionPnl: 0 }), null)
  assert.match(paymentLinks, /timeoutMs = 12000/)
  assert.match(paymentLinks, /Promise\.allSettled/)
  assert.match(paymentLinks, /client\.getOrder\(order\.orderId\)/)
  assert.match(paymentLinks, /client\.getRawRewardsForMarket\(conditionId\)/)
  assert.doesNotMatch(paymentLinks, /client\.getCurrentRewards\(\)/)
  assert.match(paymentLinks, /Earned today \{snapshot\.earnedTodayUsdc === null/)
  assert.match(paymentLinks, /\? 'Pending' : formatSignedUsd\(lpRewardsEarnedToday\)/)
  assert.match(paymentLinks, /markets-by-token/)
  assert.match(paymentLinks, /action: 'resolve-lp-order-market'/)
  assert.match(portfolioApi, /action === 'resolve-lp-order-market'/)
  assert.match(portfolioApi, /GAMMA_API_ORIGIN/)
  assert.match(paymentLinks, /could not match this quote to its Polymarket reward market/)
  assert.match(paymentLinks, /resolvedTrackedLpOrders/)
  assert.match(paymentLinks, /\{activeOpenPositions\.length\}<\/p>/)
  assert.match(paymentLinks, /Polymarket reward data did not respond\. Please retry\./)
  assert.match(paymentLinks, /value === null \|\| value === undefined \|\| value === ''/)
  assert.match(paymentLinks, /`Cancel \$\{order\.outcome \|\| 'quote'\}`/)
  assert.match(paymentLinks, /Close position/)
  assert.doesNotMatch(paymentLinks, /Remove the unmatched quote\?|Keep quote|pendingLpOrderCancel/)
  assert.match(paymentLinks, /onClick=\{\(\) => void cancelPortfolioLpOrder\(order\)\}/)
  assert.match(paymentLinks, /Scoring now/)
  assert.match(paymentLinks, /reward share/)
  assert.match(paymentLinks, /Measure the quote/)
  assert.match(paymentLinks, /Hold this quote/)
  assert.match(paymentLinks, /Target not met/)
  assert.match(paymentLinks, /Review the filled side/)
  assert.match(paymentLinks, /Approx\. capital for \$1\/day/)
  assert.match(paymentLinks, /Shortfall/)
  assert.match(paymentLinks, /Available after replacing/)
  assert.match(paymentLinks, /One-sided quote: reduced reward scoring may apply/)
  assert.match(paymentLinks, /Replace quote/)
  assert.match(paymentLinks, /<Link\s+to=\{replacementUrl\}/)
  assert.match(paymentLinks, /Open market/)
  assert.doesNotMatch(paymentLinks, /navigate\(\`\/polydesk\?\$\{query\.toString\(\)\}\`\)/)
  assert.match(paymentLinks, /authRequest\('GET', '\/auth\/derive-api-key', true\)/)
  assert.match(paymentLinks, /Polymarket authorization did not respond/)
  assert.doesNotMatch(paymentLinks, /throw new Error\(`\$\{message\}\$\{suffix\}`\)/)
  assert.match(paymentLinks, /Net LP result/)
  assert.match(paymentLinks, /Today plus current LP positions/)
  assert.match(paymentLinks, /Rewards today/)
  assert.match(paymentLinks, /Maker rebates/)
  assert.match(paymentLinks, /Position P&amp;L/)
  assert.match(portfolioApi, /action === 'rebates'/)
  assert.match(portfolioApi, /\/rebates\/current\?date=/)
  assert.doesNotMatch(limitOrderTicket, /submittedMarketId/)
  assert.doesNotMatch(paymentLinks, /window\.confirm/)
})

test('Pulse demotes fresh stable measurements that cannot approach the daily target', () => {
  const now = Date.now()
  const markets = [
    { conditionId: 'weak', title: 'Measured weak market' },
    { conditionId: 'unknown', title: 'Unmeasured market' },
    { conditionId: 'strong', title: 'Measured strong market' },
  ]
  const summaries = [
    {
      marketId: 'weak',
      samples: [
        { estimatedDailyUsdc: 0.03, earningPercentage: 0.02, restingCapitalUsdc: 72.6, observedAt: now - 120_000 },
        { estimatedDailyUsdc: 0.03, earningPercentage: 0.02, restingCapitalUsdc: 72.6, observedAt: now - 60_000 },
      ],
    },
    {
      marketId: 'strong',
      samples: [
        { estimatedDailyUsdc: 1.05, earningPercentage: 0.5, restingCapitalUsdc: 75, observedAt: now - 120_000 },
        { estimatedDailyUsdc: 1.1, earningPercentage: 0.52, restingCapitalUsdc: 75, observedAt: now - 60_000 },
      ],
    },
  ]
  const ranked = rankLpOpportunitiesByMeasurements(markets, summaries, 80, 1, now)
  assert.deepEqual(ranked.map(market => market.conditionId), ['strong', 'unknown', 'weak'])
  assert.ok(Number(ranked[0].measuredDailyAtCapitalUsdc) > 1)
  assert.ok(Number(ranked[2].measuredDailyAtCapitalUsdc) < 0.1)
})

test('Pulse replaces stale bulk reward pools with the exact market configuration', () => {
  const stale = {
    condition_id: '0xmarket',
    total_daily_rate: 286,
    rewards_config: [{ rate_per_day: 286 }],
  }
  const exact = {
    condition_id: '0xmarket',
    rewards_min_size: 50,
    rewards_config: [{ rate_per_day: 57 }],
  }
  const merged = mergeVerifiedRewardMarket(stale, exact)
  assert.equal(verifiedDailyRewardPool(merged), 57)
  assert.equal(merged.rewards_min_size, 50)
  assert.equal('total_daily_rate' in merged, false)
  assert.equal(verifiedDailyRewardPool({ total_daily_rate: 1.99972, rewards_config: [{ rate_per_day: 0.001 }] }), 1.99972)
  assert.match(lpScoutApi, /rewards\/markets\/\$\{encodeURIComponent\(conditionId\)\}/)
  assert.match(lpScoutApi, /rewardPoolVerified/)
})

test('LP probe recommendations require stable samples and expose fill risk', () => {
  const orders = [
    { outcome: 'YES', price: 0.4, originalSize: 50, matchedSize: 0, status: 'live' },
    { outcome: 'NO', price: 0.5, originalSize: 50, matchedSize: 0, status: 'live' },
  ]
  const sample = (estimatedDailyUsdc: number, observedAt: number) => ({ estimatedDailyUsdc, earningPercentage: 0.4, observedAt })
  assert.equal(assessLpProbe({ orders, samples: [sample(1.1, 0)], scoring: true }).recommendation, 'measure')
  const holding = assessLpProbe({ orders, samples: [sample(1.05, 0), sample(1.1, 60_000)], scoring: true })
  assert.equal(holding.recommendation, 'hold')
  assert.equal(holding.stable, true)
  assert.equal(holding.restingCapitalUsdc, 45)
  assert.equal(Number(holding.efficiencyPer100Usdc?.toFixed(2)), 2.44)
  const increase = assessLpProbe({ orders, samples: [sample(0.7, 0), sample(0.72, 60_000)], scoring: true, availableCapitalUsdc: 70 })
  assert.equal(increase.recommendation, 'increase')
  assert.equal(Number(increase.roughCapitalForTargetUsdc?.toFixed(2)), 62.5)
  assert.equal(increase.targetMet, false)
  assert.equal(increase.capitalSufficientForTarget, true)
  const insufficient = assessLpProbe({ orders, samples: [sample(0.7, 0), sample(0.72, 60_000)], scoring: true, availableCapitalUsdc: 45.97 })
  assert.equal(insufficient.recommendation, 'exit')
  assert.equal(insufficient.capitalSufficientForTarget, false)
  assert.equal(Number(insufficient.capitalShortfallUsdc?.toFixed(2)), 16.53)
  const liveProbe = assessLpProbe({
    orders: [
      { outcome: 'YES', price: 0.77, originalSize: 20, matchedSize: 0, status: 'live' },
      { outcome: 'NO', price: 0.18, originalSize: 20, matchedSize: 0, status: 'live' },
    ],
    samples: [sample(0.29, 0), sample(0.28, 60_000)],
    scoring: true,
    availableCapitalUsdc: 45.97,
  })
  assert.equal(liveProbe.recommendation, 'exit')
  assert.equal(liveProbe.restingCapitalUsdc, 19)
  assert.equal(Number(liveProbe.roughCapitalForTargetUsdc?.toFixed(2)), 67.86)
  assert.equal(Number(liveProbe.capitalShortfallUsdc?.toFixed(2)), 21.89)
  assert.equal(assessLpProbe({ orders, samples: [sample(0.2, 0), sample(0.21, 60_000)], scoring: true }).recommendation, 'exit')
  assert.equal(assessLpProbe({ orders, samples: [], scoring: false }).recommendation, 'exit')
  const missingPrice = assessLpProbe({ orders: [{ ...orders[0], price: null }], samples: [sample(0.7, 0), sample(0.72, 60_000)], scoring: true })
  assert.equal(missingPrice.recommendation, 'measure')
  assert.equal(missingPrice.restingCapitalUsdc, null)
  const asymmetric = assessLpProbe({ orders: [{ ...orders[0], matchedSize: 5 }, orders[1]], samples: [], scoring: true })
  assert.equal(asymmetric.recommendation, 'rebalance')
  assert.equal(asymmetric.asymmetricFill, true)
})

test('capital readiness keeps markets visible and blocks only an underfunded order', () => {
  const readiness = lpCapitalReadiness({
    balanceUsdc: 45.967864,
    orders: [{ status: 'live', side: 'BUY', price: 0.536, originalSize: 50, matchedSize: 0 }],
    requestedUsdc: 21.55,
    twoSidedSetupUsdc: 48.35,
  })
  assert.equal(Number(readiness.reservedUsdc.toFixed(2)), 26.8)
  assert.equal(Number(readiness.availableUsdc?.toFixed(6)), 19.167864)
  assert.equal(Number(readiness.orderShortfallUsdc?.toFixed(6)), 2.382136)
  assert.equal(readiness.canSubmitOrder, false)
  assert.equal(
    readablePolymarketCapitalError('not enough balance / allowance: the balance is not enough -> balance: 45967864, sum of active orders: 26800000, sum of matched orders: 0, order amount (inc. fees): 21550000'),
    '19.17 USDC is available after open orders. This quote needs 21.55 USDC. Fund 2.39 USDC more or cancel an existing quote.',
  )
  assert.match(portfolioApi, /action === 'record-lp-probes'/)
  assert.match(portfolioApi, /action === 'lp-probe-summary'/)
  assert.match(portfolioApi, /probe_samples jsonb/)
  assert.match(paymentLinks, /Replace quote/)
  assert.doesNotMatch(pulsePage, /measuredLpMarketDecision|after six hours/)
  assert.match(lpScoutApi, /conditionId: opportunity\.conditionId/)
})

test('withdrawals preserve capital reserved by live buy orders', () => {
  const orders = [
    { status: 'live', side: 'BUY', price: 0.5, originalSize: 60, matchedSize: 0 },
    { status: 'live', side: 'SELL', price: 0.7, originalSize: 20, matchedSize: 0 },
  ]
  const allowed = lpWithdrawalReadiness({ balanceUsdc: 63.97, orders, requestedUsdc: 33.97 })
  assert.equal(allowed.reservedUsdc, 30)
  assert.equal(allowed.availableUsdc, 33.97)
  assert.equal(allowed.canWithdraw, true)
  const blocked = lpWithdrawalReadiness({ balanceUsdc: 63.97, orders, requestedUsdc: 34 })
  assert.equal(Number(blocked.withdrawalShortfallUsdc?.toFixed(2)), 0.03)
  assert.equal(blocked.canWithdraw, false)
  assert.match(paymentLinks, /requestPath: '\/data\/orders'/)
  assert.match(paymentLinks, /Could not verify your live Polymarket orders\. No withdrawal was submitted\./)
})

test('resolved losing positions are ended and excluded from the open count', () => {
  const now = Date.parse('2026-08-06T12:00:00Z')
  const resolvedLoss = {
    size: 50,
    currentValue: 0,
    curPrice: 0,
    redeemable: false,
    endDate: '2026-08-05T12:00:00Z',
  }
  assert.equal(isActivePolymarketPosition(resolvedLoss, now), false)
  assert.equal(polymarketPositionStatus(resolvedLoss, now), 'ended')
  const livePosition = {
    size: 50,
    currentValue: 24,
    curPrice: 0.48,
    redeemable: false,
    endDate: '2026-10-31T00:00:00Z',
  }
  assert.equal(isActivePolymarketPosition(livePosition, now), true)
  assert.equal(polymarketPositionStatus(livePosition, now), 'live')
  assert.equal(isActivePolymarketPosition({ size: 0, currentValue: 0 }, now), false)
  assert.equal(polymarketPositionStatus({ size: 0, currentValue: 0 }, now), 'ended')
})

test('public LP opportunities use a stable share route and truthful Polymarket-style ticket', () => {
  assert.match(app, /path="\/opportunity\/:slug"/)
  assert.match(server, /app\.get\('\/api\/pulse\/opportunity\/:slug'/)
  assert.match(server, /app\.get\('\/opportunity\/:slug'/)
  assert.match(opportunityApi, /mode: 'market'/)
  assert.match(opportunityPage, /bg-\[#2f5bff\]/)
  assert.match(opportunityPage, /Daily market reward pool/)
  assert.match(opportunityPage, /Suggested prices/)
  assert.match(opportunityPage, /Use through an integration/)
  assert.doesNotMatch(lpScoutReport, /PolymarketLimitOrderTicket|Place limit order/)
  assert.match(pulsePage, /\/opportunity\/\$\{encodeURIComponent\(marketSlug\(selected\)\)\}/)
  assert.match(opportunityPage, /renderLpOpportunityPng/)
  assert.doesNotMatch(opportunityPage, /Download image|Share link/)
  assert.match(opportunityImage, /const WIDTH = 1080/)
  assert.match(opportunityImage, /const HEIGHT = 1350/)
  assert.match(opportunityImage, /image\/png/)
  assert.match(opportunityImage, /Daily market pool/)
  assert.match(opportunityImage, /Min setup/)
  assert.match(opportunityImage, /Choose a side, enter an amount, and wait for a match/)
  assert.match(opportunityImage, /View opportunity on PolyDesk/)
  assert.match(opportunityImage, /Rewards are shared across eligible liquidity providers/)
  assert.doesNotMatch(opportunityImage, /PRICE GAP|SHARES NEAR PRICE|SMALLEST ORDER|What to do|STEADY SETUP|WATCH PRICE|RISKY SETUP/)
  assert.doesNotMatch(opportunityPage, /inside the current|post-only/)
  assert.match(opportunityPage, /Authorize execution through the originating platform/)
  assert.match(limitOrderTicket, /Leave your price available for other traders/)
  assert.doesNotMatch(limitOrderTicket, /MAX_ORDER_USDC|safety-limited release/)
  assert.doesNotMatch(limitOrderTicket, /Live GTC|Confirm the GTC|rejected the GTC/)
  assert.match(limitOrderTicket, /step=\{tickSize\}/)
  assert.match(pulsePage, /tickSize=\{selected\.tickSize\}/)
})

test('paid LP Scout reports share a safe social image without payment or proof data', () => {
  assert.match(lpScoutReport, /renderLpOpportunityPng/)
  assert.match(lpScoutReport, /variant: 'report'/)
  assert.match(lpScoutReport, /Share insight/)
  assert.match(lpScoutReport, /navigator\.share/)
  assert.match(lpScoutReport, /service=lp-scout/)
  assert.match(opportunityImage, /Scout takeaway/)
  assert.match(opportunityImage, /Explore LP Scout on PolyDesk/)
  const sharePayload = lpScoutReport.slice(
    lpScoutReport.indexOf('async function shareInsight'),
    lpScoutReport.indexOf('return ('),
  )
  assert.doesNotMatch(sharePayload, /receiptUrl|proofHash|wallet|x402/)
  assert.doesNotMatch(sharePayload, /window\.location\.href/)
})

test('paid report APIs require the linked receipt capability and avoid private caching', () => {
  assert.match(lpScoutReportApi, /authorizedLpScoutReceipt/)
  assert.match(agentActivityApi, /authorizedLpScoutReceipt/)
  assert.match(lpScoutReportApi, /Cache-Control', 'no-store/)
  assert.match(agentActivityApi, /Cache-Control', 'no-store/)
  assert.doesNotMatch(lpScoutReportApi, /scout: scoutResult|zeroscout: zeroScout/)
  assert.match(agentWorkspace, /next\.set\('lpScoutReceipt'/)
  assert.match(paymentLinks, /receiptQuery/)
})

test('Trade Activity uses the saved account feed and completed LP Scout records', () => {
  assert.match(portfolioApi, /action === 'activity'/)
  assert.match(portfolioApi, /\/activity\?user=/)
  assert.match(tradeActivity, /polymarket-portfolio\?action=activity/)
  assert.match(tradeActivity, /readSavedLpScoutActivity/)
  assert.match(tradeActivity, /lp-scout-report/)
  assert.match(tradeActivity, /expandedActivityId/)
  assert.match(tradeActivity, /aria-expanded=\{expanded\}/)
  assert.match(tradeActivity, /Open on Polymarket/)
  assert.match(tradeActivity, /View report/)
  assert.match(tradeActivity, /searchParams\.get\('preview'\) === '1'/)
  assert.match(tradeActivity, /const \[loading, setLoading\] = useState\(false\)/)
  assert.match(tradeActivity, /if \(!authenticated\) \{[\s\S]*setLoading\(false\)/)
  assert.match(agentWorkspace, /rememberLpScoutActivity/)
  assert.doesNotMatch(tradeActivity, /row\.status|polydesk-card mt-6 overflow-hidden/)
})

test('public portfolio watches verify email ownership and use authoritative market transitions', () => {
  assert.match(portfolioApi, /alert_email_verified/)
  assert.match(portfolioApi, /create-public-watch/)
  assert.match(portfolioApi, /verify-public-watch/)
  assert.match(portfolioApi, /polymarket_public_watch_tokens/)
  assert.match(portfolioApi, /position\.percentPnl/)
  assert.match(alertRules, /belowThreshold && !input\.wasBelowThreshold/)
  assert.match(alertRules, /winningAssetId/)
  assert.match(alertMonitor, /event_type === 'market_resolved'/)
  assert.match(alertMonitor, /custom_feature_enabled: true/)
  assert.match(portfolioApi, /reconcilePolymarketResolutionAlerts/)
  assert.match(paymentLinks, /label="Market results"/)
  assert.match(paymentLinks, /label="Alert email"/)
  assert.match(paymentLinks, /label="New positions"/)
  assert.match(alertMonitor, /reconcilePolymarketWatchedPortfolios/)
  assert.match(alertMonitor, /reconcilePolymarketLpOrders/)
  assert.match(portfolioApi, /polymarket_lp_order_watch/)
  assert.match(portfolioApi, /missingChecks = Number\(row\.missing_checks/)
  assert.match(portfolioApi, /action === 'mark-lp-order-closed'/)
  assert.match(paymentLinks, /Reserved capital was released/)
  assert.match(portfolioApi, /lp-order-\$\{input\.lifecycle\}/)
  assert.match(paymentLinks, /label: 'Monitor'/)
  assert.match(portfolioApi, /coalesce\(p\.deposit_wallet_address, p\.trading_address\)/)
  assert.match(paymentLinks, /Claim to pUSD/)
  assert.match(paymentLinks, /void claimPositionToPusd\(position\)/)
  assert.doesNotMatch(paymentLinks, /pendingClaimPosition/)
  assert.match(paymentLinks, /executeDepositWalletBatch\(calls, polymarketDepositWallet, deadline\)/)
  assert.match(portfolioApi, /trackedLpAssets\.has\(assetId\)/)
  assert.doesNotMatch(paymentLinks, /Build env needed/)
  assert.match(paymentLinks, /usingStandaloneWatch/)
  assert.match(portfolioApi, /alert_email_verified = false/)
  assert.doesNotMatch(paymentLinks, /label="Live market movement"/)
  assert.doesNotMatch(portfolioApi, /ended < Date\.now\(\)/)
  assert.match(emailProvider, /EMAIL_TIMEOUT_MS/)
  assert.match(emailProvider, /TRANSIENT_STATUS/)
})

test('LP Scout checkout returns through the paid-result continuation on Arc Testnet', () => {
  assert.match(polyDeskPage, /lazy\(\(\) => import\('\.\/AgentWorkspace'\)\)/)
  assert.match(polyDeskPage, /serviceView === 'lp-scout' && searchParams\.get\('run'\) === 'polymarket-scout'/)
  assert.match(polyDeskPage, /<AgentWorkspace \/>/)
  assert.match(agentWorkspace, /const network = 'arc'/)
  assert.doesNotMatch(agentWorkspace, /network === 'base'/)
})

test('LP Scout keeps one focused best-market scan and one exact-market inspection path', () => {
  assert.doesNotMatch(layout, /label: 'LP Scout'/)
  assert.match(lpScoutPanel, /Best opportunities/)
  assert.match(lpScoutPanel, /Inspect market/)
  assert.match(lpScoutPanel, /up to 10 ranked liquidity opportunities/)
  assert.doesNotMatch(lpScoutPanel, /Football markets|News markets|Coming soon/)
  assert.doesNotMatch(lpScoutPanel, /Choose a scout, set a max spend|Continue to LP Scout checkout|Scout a theme/)
  assert.match(polyStream, /POLY_STREAM_LEAGUE_IDS/)
  assert.match(polyStream, /Verified football board/)
  assert.match(lpScoutApi, /getPolyStreamFeed/)
  assert.match(lpScoutApi, /match\.polymarketUrl\.startsWith\('https:\/\/polymarket\.com\/event\/'\)/)
  assert.match(lpScoutApi, /Verified football provider plus Polymarket Gamma and CLOB public APIs/)
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
  assert.match(productStyles, /\.polydesk-primary-cta--compact/)
  assert.match(productStyles, /\.polydesk-primary-cta:focus-visible/)
  assert.doesNotMatch(layout, /polydesk-header-sign-in/)
  assert.match(agentWorkspace, /polydesk-primary-cta mt-4 w-full/)
  assert.match(paymentLinks, /polydesk-primary-cta polydesk-primary-cta--compact shrink-0/)
  assert.match(paymentLinks, /polydesk-primary-cta w-full/)
  assert.doesNotMatch(server, /okx-agentic-marketplace|okx-marketplace-checkout|okxAgenticWalletReady/)
  assert.doesNotMatch(packageJson, /ensure-onchainos|test:okx-marketplace|smoke:okx-public-marketplace/)
})

test('the public shell avoids unused global providers and eval-capable browser polyfills', () => {
  assert.doesNotMatch(main, /QueryClientProvider|WagmiProvider|PrivyWagmiProvider/)
  assert.match(main, /lazy\(\(\) => import\('\.\/ProductApp'\)\)/)
  assert.doesNotMatch(productApp, /PrivyProvider/)
  assert.match(productApp, /<BrowserRouter>/)
  assert.doesNotMatch(productApp, /QueryClientProvider|WagmiProvider|PrivyWagmiProvider/)
  assert.match(viteConfig, /exclude: \['vm'\]/)
  assert.doesNotMatch(server, /unsafe-eval/)
  assert.doesNotMatch(server, /script-src[^"]*unsafe-inline/)
  assert.match(server, /runtime-config\.js/)
  assert.match(server, /app\.set\('trust proxy', 1\)/)
  assert.doesNotMatch(rateLimit, /x-forwarded-for/)
})
