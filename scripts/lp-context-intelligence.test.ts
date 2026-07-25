import test from 'node:test'
import assert from 'node:assert/strict'
import {
  articleMatchesOpportunity,
  footballMatchMatchesOpportunity,
} from '../api/lp-context-intelligence.js'
import { estimateTwoSidedRewardCapitalUsdc } from '../api/lp-reward-estimate.js'

test('news context requires a recent source and multiple distinctive market terms', () => {
  const now = Date.parse('2026-07-25T12:00:00.000Z')
  const opportunity = {
    title: 'Clarity Act signed into law in 2026?',
    description: 'A US digital asset regulation market.',
  }
  assert.equal(articleMatchesOpportunity(opportunity, {
    title: 'Clarity Act regulation faces a decisive Senate vote',
    description: 'Lawmakers return to the digital asset legislation this week.',
    url: 'https://news.example/clarity-act-senate',
    publishedAt: '2026-07-25T10:00:00.000Z',
  }, now), true)
  assert.equal(articleMatchesOpportunity(opportunity, {
    title: 'Markets open higher',
    description: 'A broad morning update.',
    url: 'https://news.example/morning',
    publishedAt: '2026-07-25T10:00:00.000Z',
  }, now), false)
  assert.equal(articleMatchesOpportunity(opportunity, {
    title: 'Clarity Act regulation update',
    description: 'An old article.',
    url: 'https://news.example/old',
    publishedAt: '2026-07-20T10:00:00.000Z',
  }, now), false)
})

test('football context attaches only to the exact matched Polymarket event', () => {
  const opportunity = {
    marketUrl: 'https://polymarket.com/event/arsenal-v-chelsea',
  }
  assert.equal(footballMatchMatchesOpportunity(opportunity, {
    marketStatus: 'matched',
    polymarketUrl: 'https://www.polymarket.com/event/arsenal-v-chelsea/',
  }), true)
  assert.equal(footballMatchMatchesOpportunity(opportunity, {
    marketStatus: 'pending',
    polymarketUrl: 'https://polymarket.com/event/arsenal-v-chelsea',
  }), false)
  assert.equal(footballMatchMatchesOpportunity(opportunity, {
    marketStatus: 'matched',
    polymarketUrl: 'https://polymarket.com/event/arsenal-v-liverpool',
  }), false)
})

test('reward capital estimate uses the configured minimum shares across both quotes', () => {
  assert.equal(estimateTwoSidedRewardCapitalUsdc(200, 0.34, 0.63), 194)
  assert.equal(estimateTwoSidedRewardCapitalUsdc(10, 0.49, 0.49), 9.8)
  assert.equal(estimateTwoSidedRewardCapitalUsdc(200, undefined, 0.63), undefined)
  assert.equal(estimateTwoSidedRewardCapitalUsdc(0, 0.34, 0.63), undefined)
})
