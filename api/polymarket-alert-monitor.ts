import WebSocket from 'ws'

import { polymarketAlertEvents } from './polymarket-alert-events.js'
import {
  bootstrapPolymarketAlertMonitor,
  evaluatePolymarketAlertAssets,
  processPolymarketResolutionEvent,
  reconcilePolymarketLpOrders,
  reconcilePolymarketResolutionAlerts,
  reconcilePolymarketWatchedPortfolios,
} from './polymarket-portfolio.js'

const MARKET_STREAM_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
const RECONNECT_MAX_MS = 30_000
const ASSET_EVALUATION_COOLDOWN_MS = 15_000
const PORTFOLIO_RECONCILIATION_MS = 60_000
const LP_ORDER_RECONCILIATION_MS = 30_000

type MarketStreamMessage = {
  event_type?: string
  asset_id?: string
  market?: string
  question?: string
  slug?: string
  winning_asset_id?: string
  winning_outcome?: string
  price_changes?: Array<{ asset_id?: string }>
}

export function startPolymarketAlertMonitor() {
  if (/^(0|false|no)$/i.test(process.env.POLYMARKET_EMAIL_ALERTS_ENABLED ?? '')) {
    return
  }

  const assets = new Set<string>()
  const pendingEvaluation = new Set<string>()
  const lastEvaluatedAt = new Map<string, number>()
  let socket: WebSocket | null = null
  let reconnectTimer: NodeJS.Timeout | null = null
  let evaluationTimer: NodeJS.Timeout | null = null
  let heartbeat: NodeJS.Timeout | null = null
  let portfolioReconciliation: NodeJS.Timeout | null = null
  let lpOrderReconciliation: NodeJS.Timeout | null = null
  let reconnectDelay = 1_000
  let stopped = false

  const queueEvaluation = (assetIds: string[]) => {
    for (const assetId of assetIds) {
      const lastEvaluated = lastEvaluatedAt.get(assetId) ?? 0
      if (assets.has(assetId) && Date.now() - lastEvaluated >= ASSET_EVALUATION_COOLDOWN_MS) {
        pendingEvaluation.add(assetId)
      }
    }
    if (!pendingEvaluation.size || evaluationTimer) return
    evaluationTimer = setTimeout(() => {
      const queued = [...pendingEvaluation]
      pendingEvaluation.clear()
      evaluationTimer = null
      const evaluatedAt = Date.now()
      queued.forEach(assetId => lastEvaluatedAt.set(assetId, evaluatedAt))
      void evaluatePolymarketAlertAssets(queued)
    }, 1_500)
    evaluationTimer.unref()
  }

  const subscribe = (assetIds: string[], operation?: 'subscribe') => {
    if (socket?.readyState !== WebSocket.OPEN || assetIds.length === 0) return
    socket.send(JSON.stringify(operation
      ? { assets_ids: assetIds, operation }
      : { assets_ids: assetIds, type: 'market', custom_feature_enabled: true }))
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer || assets.size === 0) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelay)
    reconnectTimer.unref()
    reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2)
  }

  const handleMessage = (raw: WebSocket.RawData) => {
    const text = raw.toString()
    if (!text || text === 'PONG') return
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }
    const messages = Array.isArray(parsed) ? parsed : [parsed]
    for (const item of messages) {
      if (!item || typeof item !== 'object') continue
      const message = item as MarketStreamMessage
      if (
        message.event_type === 'market_resolved'
        && message.market
        && message.winning_asset_id
        && message.winning_outcome
      ) {
        const resolution = {
          market: message.market,
          winningAssetId: message.winning_asset_id,
          winningOutcome: message.winning_outcome,
          question: message.question,
          slug: message.slug,
        }
        for (const delayMs of [0, 5_000, 20_000, 60_000]) {
          const timer = setTimeout(() => void processPolymarketResolutionEvent(resolution), delayMs)
          timer.unref()
        }
        continue
      }
      const changedAssets = [
        message.asset_id,
        ...(message.price_changes ?? []).map(change => change.asset_id),
      ].filter((value): value is string => Boolean(value))
      queueEvaluation(changedAssets)
    }
  }

  function connect() {
    if (stopped || assets.size === 0 || socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) {
      return
    }
    socket = new WebSocket(MARKET_STREAM_URL, {
      handshakeTimeout: 10_000,
      maxPayload: 2 * 1024 * 1024,
      perMessageDeflate: false,
    })
    socket.on('open', () => {
      reconnectDelay = 1_000
      const initialAssets = [...assets]
      for (let offset = 0; offset < initialAssets.length; offset += 250) {
        subscribe(initialAssets.slice(offset, offset + 250), offset === 0 ? undefined : 'subscribe')
      }
      void reconcilePolymarketResolutionAlerts()
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send('PING')
      }, 10_000)
      heartbeat.unref()
      console.info('[polymarket-alert] live monitor connected', { assets: assets.size })
    })
    socket.on('message', handleMessage)
    socket.on('error', error => {
      console.warn('[polymarket-alert] live monitor error', {
        message: error instanceof Error ? error.message : 'websocket_error',
      })
    })
    socket.on('close', () => {
      if (heartbeat) clearInterval(heartbeat)
      heartbeat = null
      socket = null
      scheduleReconnect()
    })
  }

  polymarketAlertEvents.on('asset', (assetId: string) => {
    if (!assetId || assets.has(assetId)) return
    assets.add(assetId)
    if (socket?.readyState === WebSocket.OPEN) subscribe([assetId], 'subscribe')
    else connect()
  })

  void bootstrapPolymarketAlertMonitor()
    .then(initialAssets => {
      initialAssets.forEach(assetId => assets.add(assetId))
      connect()
      if (!portfolioReconciliation) {
        portfolioReconciliation = setInterval(() => {
          void reconcilePolymarketWatchedPortfolios()
        }, PORTFOLIO_RECONCILIATION_MS)
        portfolioReconciliation.unref()
      }
      void reconcilePolymarketLpOrders()
      if (!lpOrderReconciliation) {
        lpOrderReconciliation = setInterval(() => {
          void reconcilePolymarketLpOrders()
        }, LP_ORDER_RECONCILIATION_MS)
        lpOrderReconciliation.unref()
      }
    })
    .catch(error => {
      console.warn('[polymarket-alert] monitor bootstrap failed', {
        message: error instanceof Error ? error.message : 'unknown_error',
      })
    })
}
