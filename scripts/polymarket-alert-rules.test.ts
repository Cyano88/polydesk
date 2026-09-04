import assert from 'node:assert/strict'
import test from 'node:test'

import {
  confirmedFundingDelivery,
  crossedLossThreshold,
  crossedProfitThreshold,
  isMissingPolymarketOrderError,
  normalizeLpOrderLifecycle,
  polymarketPositionUrl,
  resolutionTransition,
  shouldCloseMissingLpOrder,
  shouldAlertNewPosition,
} from '../api/polymarket-alert-rules.js'
import { nextPolymarketDigestAt, validDigestTimezone } from '../api/polymarket-digest-schedule.js'
import { polymarketIntegrationSource, polymarketPortfolioDestination } from '../api/polymarket-alert-destination.js'

test('LP order lifecycle prefers terminal state and detects partial fills', () => {
  assert.equal(normalizeLpOrderLifecycle({ status: 'LIVE', originalSize: '10', matchedSize: '0' }), 'live')
  assert.equal(normalizeLpOrderLifecycle({ status: 'LIVE', originalSize: '10', matchedSize: '2.5' }), 'partial')
  assert.equal(normalizeLpOrderLifecycle({ status: 'MATCHED', originalSize: '10', matchedSize: '10' }), 'filled')
  assert.equal(normalizeLpOrderLifecycle({ status: 'CANCELED', originalSize: '10', matchedSize: '2.5' }), 'cancelled')
  assert.equal(normalizeLpOrderLifecycle({ status: 'EXPIRED', originalSize: '10', matchedSize: '0' }), 'expired')
  assert.equal(normalizeLpOrderLifecycle({ status: 'ORDER_NOT_FOUND', originalSize: '10', matchedSize: '0' }), 'closed')
})

test('missing order classification requires a terminal 404 and repeated checks', () => {
  assert.equal(isMissingPolymarketOrderError({ status: 404, message: 'Order cannot be found - already canceled or matched' }), true)
  assert.equal(isMissingPolymarketOrderError({ status: 401, message: 'order not found' }), false)
  assert.equal(isMissingPolymarketOrderError({ status: 404, message: 'market not found' }), false)

  const createdAt = new Date('2026-08-07T12:00:00.000Z')
  assert.equal(shouldCloseMissingLpOrder({ missingChecks: 1, createdAt, now: createdAt.getTime() + 120_000 }), false)
  assert.equal(shouldCloseMissingLpOrder({ missingChecks: 2, createdAt, now: createdAt.getTime() + 30_000 }), false)
  assert.equal(shouldCloseMissingLpOrder({ missingChecks: 2, createdAt, now: createdAt.getTime() + 120_000 }), true)
})

test('loss alerts fire only when a position crosses below the configured threshold', () => {
  assert.deepEqual(
    crossedLossThreshold({ percentPnl: -20, thresholdPercent: 20, wasBelowThreshold: false }),
    { belowThreshold: true, shouldAlert: true, percentPnl: -20 },
  )
  assert.equal(
    crossedLossThreshold({ percentPnl: -31, thresholdPercent: 20, wasBelowThreshold: true }).shouldAlert,
    false,
  )
  assert.equal(
    crossedLossThreshold({ percentPnl: -12, thresholdPercent: 20, wasBelowThreshold: true }).belowThreshold,
    false,
  )
  assert.equal(
    crossedLossThreshold({ percentPnl: -80, thresholdPercent: 0, wasBelowThreshold: false }).shouldAlert,
    false,
  )
})

test('profit alerts fire only when a position crosses above the configured threshold', () => {
  assert.deepEqual(
    crossedProfitThreshold({ percentPnl: 50, thresholdPercent: 50, wasAboveThreshold: false }),
    { aboveThreshold: true, shouldAlert: true, percentPnl: 50 },
  )
  assert.equal(
    crossedProfitThreshold({ percentPnl: 72, thresholdPercent: 50, wasAboveThreshold: true }).shouldAlert,
    false,
  )
  assert.equal(
    crossedProfitThreshold({ percentPnl: 41, thresholdPercent: 50, wasAboveThreshold: true }).aboveThreshold,
    false,
  )
  assert.equal(
    crossedProfitThreshold({ percentPnl: 80, thresholdPercent: 0, wasAboveThreshold: false }).shouldAlert,
    false,
  )
})

test('funding delivery requires both provider finality and refreshed pUSD', () => {
  assert.equal(confirmedFundingDelivery({
    providerStatus: 'funded',
    readinessState: 'ready_to_buy',
    pusdBalance: '4.98',
  }), true)
  assert.equal(confirmedFundingDelivery({
    providerStatus: 'funded',
    readinessState: 'funding_required',
    pusdBalance: '0',
  }), false)
  assert.equal(confirmedFundingDelivery({
    providerStatus: 'bridging',
    readinessState: 'ready_to_buy',
    pusdBalance: '4.98',
  }), false)
})

test('digest scheduling respects local timezone and weekly weekday', () => {
  assert.equal(validDigestTimezone('Africa/Lagos'), 'Africa/Lagos')
  assert.equal(validDigestTimezone('not/a-zone'), '')
  assert.equal(nextPolymarketDigestAt({
    after: new Date('2026-09-03T06:30:00.000Z'),
    frequency: 'daily',
    timezone: 'Africa/Lagos',
    hourLocal: 8,
    weekday: 1,
  })?.toISOString(), '2026-09-03T07:00:00.000Z')
  assert.equal(nextPolymarketDigestAt({
    after: new Date('2026-09-03T08:30:00.000Z'),
    frequency: 'weekly',
    timezone: 'UTC',
    hourLocal: 9,
    weekday: 1,
  })?.toISOString(), '2026-09-07T09:00:00.000Z')
  assert.equal(nextPolymarketDigestAt({
    after: new Date('2026-11-01T05:00:00.000Z'),
    frequency: 'daily',
    timezone: 'America/New_York',
    hourLocal: 1,
    weekday: 1,
  })?.toISOString(), '2026-11-02T06:00:00.000Z')
})

test('portfolio email destinations preserve only allowlisted integration channels', () => {
  assert.equal(polymarketIntegrationSource('OKX.AI'), 'okx-ai')
  assert.equal(polymarketIntegrationSource('https://attacker.example'), null)
  assert.deepEqual(polymarketPortfolioDestination('okx-ai'), {
    source: 'okx-ai',
    label: 'Open in OKX.AI',
    url: 'https://www.okx.ai/agents/5427',
  })
  assert.deepEqual(polymarketPortfolioDestination('circle-marketplace', {
    circleMarketplaceUrl: 'https://circle.example/marketplace/polydesk',
  }), {
    source: 'circle-marketplace',
    label: 'Open in Circle',
    url: 'https://circle.example/marketplace/polydesk',
  })
  assert.deepEqual(polymarketPortfolioDestination('circle-marketplace', {
    polydeskUrl: 'https://polydesk.trade/polydesk?service=portfolio',
    circleMarketplaceUrl: 'http://attacker.example',
  }), {
    source: 'polydesk',
    label: 'Open portfolio',
    url: 'https://polydesk.trade/polydesk?service=portfolio',
  })
})

test('new-position alerts baseline existing positions before notifying', () => {
  assert.equal(shouldAlertNewPosition({
    enabled: true,
    positionsInitialized: false,
    positionAlreadyKnown: false,
    size: 10,
  }), false)
  assert.equal(shouldAlertNewPosition({
    enabled: true,
    positionsInitialized: true,
    positionAlreadyKnown: false,
    size: 10,
  }), true)
  assert.equal(shouldAlertNewPosition({
    enabled: true,
    positionsInitialized: true,
    positionAlreadyKnown: true,
    size: 10,
  }), false)
})

test('resolution uses the winning asset rather than an end date guess', () => {
  const position = {
    conditionId: '0xmarket',
    asset: '100',
    eventSlug: 'will-it-happen',
  }
  assert.deepEqual(
    resolutionTransition(position, {
      market: '0xMARKET',
      winningAssetId: '100',
      winningOutcome: 'Yes',
    }),
    { type: 'claimable', winningOutcome: 'Yes' },
  )
  assert.deepEqual(
    resolutionTransition(position, {
      market: '0xmarket',
      winningAssetId: '200',
      winningOutcome: 'No',
    }),
    { type: 'resolved-loss', winningOutcome: 'No' },
  )
  assert.equal(
    resolutionTransition(position, {
      market: '0xother',
      winningAssetId: '100',
      winningOutcome: 'Yes',
    }),
    null,
  )
})

test('position links use the event route and safely encode the slug', () => {
  assert.equal(
    polymarketPositionUrl({ eventSlug: 'market with spaces' }),
    'https://polymarket.com/event/market%20with%20spaces',
  )
  assert.equal(polymarketPositionUrl({}), 'https://polymarket.com/portfolio')
})
