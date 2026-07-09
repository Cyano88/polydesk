import express from 'express'
import type { Response } from 'express'
import { config as loadEnv } from 'dotenv'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import polymarketBridgeHandler from './api/polymarket-bridge.js'
import polymarketBuilderHandoffHandler from './api/polymarket-builder-handoff.js'
import polymarketBuilderSignerHandler from './api/polymarket-builder-signer.js'
import polymarketOrderHandler from './api/polymarket-order.js'
import polymarketPortfolioHandler from './api/polymarket-portfolio.js'
import polymarketRelayerBuilderSignerHandler from './api/polymarket-relayer-builder-signer.js'
import polymarketSubmitOrderHandler from './api/polymarket-submit-order.js'
import polyStreamHandler from './api/poly-stream.js'
import polyWorldcupNewsHandler from './api/poly-worldcup-news.js'
import { rateLimit } from './api/rate-limit.js'

loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

function publicEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

function runtimePublicConfigScript() {
  const privyAppId = publicEnv('VITE_PRIVY_APP_ID', 'PRIVY_APP_ID')
  const authBridge = publicEnv('VITE_AUTH_BRIDGE', 'AUTH_BRIDGE') || 'hybrid'
  const checkpointFactoryAddress = publicEnv(
    'VITE_CHECKPOINT_FACTORY_ADDRESS',
    'CHECKPOINT_FACTORY_ADDRESS',
  )
  const payload = JSON.stringify({
    auth: {
      authBridge,
      privyAppId,
      privyEnabled: Boolean(privyAppId && authBridge !== 'legacy'),
    },
    streampay: {
      checkpointFactoryAddress,
    },
  }).replace(/</g, '\\u003c')
  return `<script>window.__HASH_PAYLINK_CONFIG__=${payload};</script>`
}

function sendSpaIndex(res: Response) {
  const indexPath = join(__dirname, 'dist', 'index.html')
  const html = readFileSync(indexPath, 'utf8')
  res.type('html').send(html.replace('</head>', `${runtimePublicConfigScript()}</head>`))
}

app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
      "child-src 'self' https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  next()
})

app.use(express.json({ limit: '256kb' }))

const strictLimiter = rateLimit({ name: 'strict', windowMs: 60_000, max: 20 })
const readLimiter = rateLimit({ name: 'read', windowMs: 60_000, max: 120 })

app.all('/api/polymarket-bridge', strictLimiter, polymarketBridgeHandler)
app.post('/api/polymarket-builder-handoff', strictLimiter, polymarketBuilderHandoffHandler)
app.post('/api/polymarket-builder-signer', strictLimiter, polymarketBuilderSignerHandler)
app.post('/api/polymarket-order', strictLimiter, polymarketOrderHandler)
app.all('/api/polymarket-portfolio', readLimiter, polymarketPortfolioHandler)
app.post('/api/polymarket-relayer-builder-signer', strictLimiter, polymarketRelayerBuilderSignerHandler)
app.post('/api/polymarket-submit-order', strictLimiter, polymarketSubmitOrderHandler)
app.get('/api/poly-worldcup-news', readLimiter, polyWorldcupNewsHandler)
app.get('/api/poly-stream', readLimiter, polyStreamHandler)
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'polydesk', ts: Date.now() }))

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: `API route not found: ${req.method} ${req.originalUrl}` })
})

app.use(express.static(join(__dirname, 'dist'), { index: false }))

app.get('*', (_req, res) => {
  sendSpaIndex(res)
})

const PORT = Number(process.env.PORT) || 3000
app.listen(PORT, () => {
  console.log(`PolyDesk running on port ${PORT}`)
})
