import express from 'express'
import type { Response } from 'express'
import { config as loadEnv } from 'dotenv'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import agentAskHandler from './api/agent-ask.js'
import agentProfileHandler from './api/agent-profile.js'
import agentVerifyHandler from './api/agent-verify.js'
import agentActivityReadHandler from './api/agent-activity-read.js'
import a2mcpServicesHandler from './api/a2mcp-services.js'
import evmBalanceHandler from './api/evm-balance.js'
import helperProfileHandler from './api/helper-profile.js'
import lpScoutReportHandler from './api/lp-scout-report.js'
import okxA2mcpPolymarketLpScoutHandler from './api/okx-a2mcp-polymarket-lp-scout.js'
import okxA2mcpStandardServiceHandler from './api/okx-a2mcp-standard-services.js'
import okxRewardsHandler from './api/okx-rewards.js'
import {
  polymarketGovernedOpenAuthorizationHandler,
  polymarketGovernedTradeCompleteHandler,
  polymarketGovernedTradeReceiptHandler,
  polymarketGovernedOpenValidationHandler,
} from './api/a2mcp-polymarket-governed-open.js'
import { polymarketSignedOpenValidationHandler } from './api/a2mcp-polymarket-signed-open.js'
import { tradeSignalOutboxHandler } from './api/trade-signal-outbox.js'
import polymarketBridgeHandler from './api/polymarket-bridge.js'
import polymarketBuilderHandoffHandler from './api/polymarket-builder-handoff.js'
import polymarketBuilderSignerHandler from './api/polymarket-builder-signer.js'
import polymarketOrderHandler from './api/polymarket-order.js'
import polymarketOpenPrepareHandler from './api/polymarket-open-prepare.js'
import { polymarketSmartTraderDecisionHandler, polymarketSmartTraderPaymentStatusHandler, startSmartTraderDeliveryWorker } from './api/polymarket-smart-trader.js'
import polymarketCopyPrepareHandler from './api/polymarket-copy-prepare.js'
import polymarketAgentFlowHandler from './api/polymarket-agent-flow.js'
import polymarketAccountReadinessHandler from './api/polymarket-account-readiness.js'
import polymarketPortfolioHandler from './api/polymarket-portfolio.js'
import { startPolymarketAlertMonitor } from './api/polymarket-alert-monitor.js'
import polymarketRelayerBuilderSignerHandler from './api/polymarket-relayer-builder-signer.js'
import polymarketSubmitOrderHandler from './api/polymarket-submit-order.js'
import polydeskA2aTradingAgentHandler, { polydeskA2aTradingReceiptHandler } from './api/polydesk-a2a-trading-agent.js'
import polydeskManagedAgentSubscriptionHandler from './api/polydesk-managed-agent-subscription.js'
import polydeskMarketContextHandler, {
  createPolydeskMarketContextHealthHandler,
} from './api/polydesk-market-context.js'
import paylinkBankSendHandler from './api/paylink-bank-send.js'
import hashPayLinkPolymarketFundingHandler from './api/hashpaylink-polymarket-funding.js'
import hashPayLinkWebhookHandler from './api/hashpaylink-webhook.js'
import polyStreamHandler from './api/poly-stream.js'
import polyWorldcupNewsHandler from './api/poly-worldcup-news.js'
import pulseHandler, { getPulseCacheStatus, getPulseFeed } from './api/pulse.js'
import pulseOpportunityHandler, { getPulseOpportunity } from './api/pulse-opportunity.js'
import { rateLimit } from './api/rate-limit.js'
import solanaBalanceHandler from './api/solana-balance.js'
import telegramRequestHandler from './api/telegram-request.js'
import x402PolymarketScoutHandler from './api/x402-polymarket-scout.js'
import zeroScoutPolymarketBriefHandler from './api/zeroscout-polymarket-brief.js'

loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')

function publicEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

function escapeMeta(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sendSpaIndex(res: Response, meta?: { title?: string; description?: string; image?: string; url?: string }) {
  const indexPath = join(__dirname, 'dist', 'index.html')
  const html = readFileSync(indexPath, 'utf8')
  const tags = meta
    ? [
        `<meta name="description" content="${escapeMeta(meta.description || 'Live Polymarket liquidity intelligence from PolyDesk.')}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:title" content="${escapeMeta(meta.title || 'PolyDesk LP opportunity')}">`,
        `<meta property="og:description" content="${escapeMeta(meta.description || 'Live Polymarket liquidity intelligence from PolyDesk.')}">`,
        meta.url ? `<meta property="og:url" content="${escapeMeta(meta.url)}">` : '',
        meta.image ? `<meta property="og:image" content="${escapeMeta(meta.image)}">` : '',
        `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`,
      ].filter(Boolean).join('')
    : ''
  const titledHtml = meta?.title
    ? html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeMeta(meta.title)}</title>`)
    : html
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.type('html').send(titledHtml.replace('</head>', `${tags}</head>`))
}

app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://privy.io https://*.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
      "child-src 'self' https://privy.io https://*.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  next()
})

const hashPayLinkWebhookLimiter = rateLimit({ name: 'hashpaylink-webhook', windowMs: 60_000, max: 120 })
app.post('/api/webhooks/hashpaylink', hashPayLinkWebhookLimiter, express.raw({ type: 'application/json', limit: '128kb' }), hashPayLinkWebhookHandler)

app.use(express.json({ limit: '256kb' }))

const strictLimiter = rateLimit({ name: 'strict', windowMs: 60_000, max: 20 })
const readLimiter = rateLimit({ name: 'read', windowMs: 60_000, max: 120 })
const zeroScoutLimiter = rateLimit({ name: 'zeroscout', windowMs: 60_000, max: 45 })
const fundingCheckoutLimiter = rateLimit({ name: 'funding-checkout', windowMs: 60_000, max: 6 })
const publicWatchCreateLimiter = rateLimit({ name: 'public-watch-create', windowMs: 60 * 60_000, max: 5 })

app.all('/api/polymarket-bridge', strictLimiter, polymarketBridgeHandler)
app.post('/api/polymarket-builder-handoff', strictLimiter, polymarketBuilderHandoffHandler)
app.post('/api/polymarket-builder-signer', strictLimiter, polymarketBuilderSignerHandler)
app.post('/api/polymarket-order', strictLimiter, polymarketOrderHandler)
app.post('/api/polymarket-open/prepare', strictLimiter, polymarketOpenPrepareHandler)
app.post('/api/polymarket-copy/prepare', strictLimiter, polymarketCopyPrepareHandler)
app.all('/api/polymarket-agent-flow', strictLimiter, polymarketAgentFlowHandler)
app.post('/api/polymarket-account/readiness', strictLimiter, polymarketAccountReadinessHandler)
app.post('/api/polymarket-portfolio', (req, res, next) => {
  const action = String(req.query.action ?? req.body?.action ?? '').trim().toLowerCase()
  if (action === 'create-public-watch') return publicWatchCreateLimiter(req, res, next)
  return next()
})
app.all('/api/polymarket-portfolio', readLimiter, polymarketPortfolioHandler)
app.post('/api/polymarket-relayer-builder-signer', strictLimiter, polymarketRelayerBuilderSignerHandler)
app.post('/api/polymarket-submit-order', strictLimiter, polymarketSubmitOrderHandler)
app.all('/api/a2a/polydesk-trading-agent', strictLimiter, polydeskA2aTradingAgentHandler)
app.get('/api/a2a/polydesk-trading-agent/receipt/:missionId', readLimiter, polydeskA2aTradingReceiptHandler)
app.post('/api/a2a/polydesk-managed-agent', strictLimiter, polydeskManagedAgentSubscriptionHandler)
if (process.env.POLYDESK_MARKET_CONTEXT_ENABLED === 'true') {
  app.get(
    '/api/agent/polymarket-context/health',
    strictLimiter,
    createPolydeskMarketContextHealthHandler(),
  )
  app.post('/api/agent/polymarket-context', strictLimiter, polydeskMarketContextHandler)
}
app.post('/api/paylink-bank-send', strictLimiter, paylinkBankSendHandler)
app.post('/api/hashpaylink/polymarket-funding', fundingCheckoutLimiter, hashPayLinkPolymarketFundingHandler)
app.get('/api/hashpaylink/polymarket-funding', readLimiter, hashPayLinkPolymarketFundingHandler)
app.get('/api/a2mcp/services', readLimiter, a2mcpServicesHandler)
app.get('/.well-known/polydesk.json', readLimiter, a2mcpServicesHandler)
app.all('/api/okx-rewards', strictLimiter, okxRewardsHandler)
app.all('/api/a2mcp/polymarket-funding-link', strictLimiter, okxA2mcpStandardServiceHandler)
app.all('/api/a2mcp/polymarket-portfolio-watch', strictLimiter, okxA2mcpStandardServiceHandler)
app.post('/api/a2mcp/polymarket-smart-trader', strictLimiter, okxA2mcpStandardServiceHandler)
app.get('/api/a2mcp/polymarket-smart-trader/decision/:decisionId', readLimiter, polymarketSmartTraderDecisionHandler)
app.get('/api/a2mcp/polymarket-smart-trader/payment/:transaction', readLimiter, polymarketSmartTraderPaymentStatusHandler)
app.post('/api/polymarket-signed-open/validate', strictLimiter, polymarketSignedOpenValidationHandler)
app.post('/api/a2mcp/polymarket-agent-flow', strictLimiter, okxA2mcpStandardServiceHandler)
app.post('/api/polymarket-governed-open/authorize', strictLimiter, polymarketGovernedOpenAuthorizationHandler)
app.post('/api/polymarket-governed-open/validate', strictLimiter, polymarketGovernedOpenValidationHandler)
app.post('/api/polymarket-agent-flow/complete', strictLimiter, polymarketGovernedTradeCompleteHandler)
app.get('/api/polymarket-agent-flow/receipt/:executionId', readLimiter, polymarketGovernedTradeReceiptHandler)
app.get('/api/trade-signals', readLimiter, tradeSignalOutboxHandler)
app.get('/api/poly-worldcup-news', readLimiter, polyWorldcupNewsHandler)
app.get('/api/poly-stream', readLimiter, polyStreamHandler)
app.get('/api/pulse', readLimiter, pulseHandler)
app.get('/api/pulse/opportunity/:slug', readLimiter, pulseOpportunityHandler)
app.all('/api/agent-verify', strictLimiter, agentVerifyHandler)
app.post('/api/agent-ask', strictLimiter, agentAskHandler)
app.get('/api/agent-activity', readLimiter, agentActivityReadHandler)
app.all('/api/agent-profile', strictLimiter, agentProfileHandler)
app.all('/api/helper-profile', readLimiter, helperProfileHandler)
app.post('/api/evm-balance', readLimiter, evmBalanceHandler)
app.post('/api/solana-balance', readLimiter, solanaBalanceHandler)
app.all('/api/telegram-request', strictLimiter, telegramRequestHandler)
app.get('/api/a2mcp/polymarket-lp-scout', strictLimiter, x402PolymarketScoutHandler)
app.all('/api/a2mcp/okx/polymarket-lp-scout', strictLimiter, okxA2mcpPolymarketLpScoutHandler)
app.all('/api/a2mcp/worldcup-live-scores', strictLimiter, okxA2mcpStandardServiceHandler)
app.all('/api/a2mcp/worldcup-market-news', strictLimiter, okxA2mcpStandardServiceHandler)
app.all('/api/a2mcp/football-live-data', strictLimiter, okxA2mcpStandardServiceHandler)
app.all('/api/a2mcp/football-news-brief', strictLimiter, okxA2mcpStandardServiceHandler)
app.get('/api/x402/polymarket-scout', strictLimiter, x402PolymarketScoutHandler)
app.post('/api/zeroscout/polymarket-brief', zeroScoutLimiter, zeroScoutPolymarketBriefHandler)
app.get('/api/lp-scout-report', readLimiter, lpScoutReportHandler)
app.get('/api/x402-polymarket-scout', strictLimiter, x402PolymarketScoutHandler)
app.post('/api/zeroscout-polymarket-brief', zeroScoutLimiter, zeroScoutPolymarketBriefHandler)
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'polydesk',
  pulse: getPulseCacheStatus(),
  ts: Date.now(),
}))

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: `API route not found: ${req.method} ${req.originalUrl}` })
})

app.use(express.static(join(__dirname, 'dist'), { index: false }))

app.get('/assets/*', (_req, res) => {
  res.status(404).type('text').send('Asset not found')
})

app.get('/opportunity/:slug', async (req, res) => {
  const opportunity = await getPulseOpportunity(req.params.slug).catch(() => null)
  const origin = publicEnv('PUBLIC_APP_URL', 'VITE_PUBLIC_APP_URL') || `${req.protocol}://${req.get('host')}`
  const reward = Number(opportunity?.dailyReward)
  const spread = Number(opportunity?.liveSpread)
  const depth = Number(opportunity?.depthAtTwoCents)
  const description = [
    Number.isFinite(reward) ? `Daily market rewards: ${reward.toLocaleString()} USDC shared by qualifying orders` : '',
    Number.isFinite(spread) ? `${(spread * 100).toFixed(1)}c price gap` : '',
    Number.isFinite(depth) ? `${Math.round(depth).toLocaleString()} shares near the current price` : '',
  ].filter(Boolean).join(' · ')
  sendSpaIndex(res, opportunity ? {
    title: `${opportunity.title} · PolyDesk market rewards`,
    description: description || opportunity.scoutReason || opportunity.description || 'Live Polymarket liquidity intelligence from PolyDesk.',
    image: opportunity.image,
    url: `${origin}/opportunity/${encodeURIComponent(req.params.slug)}`,
  } : undefined)
})

app.get('*', (_req, res) => {
  sendSpaIndex(res)
})

const PORT = Number(process.env.PORT) || 3000
const PULSE_WARM_INTERVAL_MS = Math.max(60_000, Number(process.env.PULSE_WARM_INTERVAL_MS) || 90_000)

async function warmPulse(reason: 'startup' | 'scheduled') {
  const startedAt = Date.now()
  try {
    const feed = await getPulseFeed(true)
    const durationMs = Date.now() - startedAt
    if (reason === 'startup' || durationMs >= 30_000) {
      console.info('[pulse-warm]', { reason, durationMs, markets: feed.markets.length })
    }
  } catch (cause) {
    console.warn('[pulse-warm] failed', {
      reason,
      message: cause instanceof Error ? cause.message : 'unknown_error',
    })
  }
}

app.listen(PORT, () => {
  console.log(`PolyDesk running on port ${PORT}`)
  const startupWarm = setTimeout(() => void warmPulse('startup'), 250)
  startupWarm.unref()
  const scheduledWarm = setInterval(() => void warmPulse('scheduled'), PULSE_WARM_INTERVAL_MS)
  scheduledWarm.unref()
  startPolymarketAlertMonitor()
  startSmartTraderDeliveryWorker()
})
