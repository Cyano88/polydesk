import assert from 'node:assert/strict'
import test from 'node:test'

import {
  crossedLossThreshold,
  isMissingPolymarketOrderError,
  normalizeLpOrderLifecycle,
  polymarketPositionUrl,
  resolutionTransition,
  shouldCloseMissingLpOrder,
  shouldAlertNewPosition,
} from '../api/polymarket-alert-rules.js'

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
