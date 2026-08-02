import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import { getPolyStreamFeed, matchHasTeam, requestTeam, sportmonksTeamSearchUrl, sportmonksUrls } from '../api/poly-stream.js'

test('Sportmonks works without a hard-coded league allowlist', () => {
  const previous = {
    ids: process.env.POLY_STREAM_LEAGUE_IDS,
    id: process.env.POLY_STREAM_LEAGUE_ID,
    url: process.env.POLY_STREAM_API_URL,
    sportsUrl: process.env.SPORTS_API_URL,
  }
  delete process.env.POLY_STREAM_LEAGUE_IDS
  delete process.env.POLY_STREAM_LEAGUE_ID
  delete process.env.POLY_STREAM_API_URL
  delete process.env.SPORTS_API_URL
  try {
    const live = sportmonksUrls('live')
    const upcoming = sportmonksUrls('next')
    assert.equal(live.length, 1)
    assert.match(live[0], /\/football\/livescores\/inplay\?/)
    assert.doesNotMatch(live[0], /fixtureLeagues/)
    assert.equal(upcoming.length, 1)
    assert.match(upcoming[0], /\/football\/fixtures\/between\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\?/)
    assert.doesNotMatch(upcoming[0], /fixtureLeagues/)
  } finally {
    if (previous.ids === undefined) delete process.env.POLY_STREAM_LEAGUE_IDS
    else process.env.POLY_STREAM_LEAGUE_IDS = previous.ids
    if (previous.id === undefined) delete process.env.POLY_STREAM_LEAGUE_ID
    else process.env.POLY_STREAM_LEAGUE_ID = previous.id
    if (previous.url === undefined) delete process.env.POLY_STREAM_API_URL
    else process.env.POLY_STREAM_API_URL = previous.url
    if (previous.sportsUrl === undefined) delete process.env.SPORTS_API_URL
    else process.env.SPORTS_API_URL = previous.sportsUrl
  }
})

test('team-specific Sportmonks lookup uses the official fixture-search endpoint', () => {
  const url = new URL(sportmonksTeamSearchUrl('Real Madrid'))
  assert.equal(url.pathname, '/v3/football/fixtures/search/Real%20Madrid')
  assert.match(url.searchParams.get('include') || '', /participants/)
  assert.equal(url.searchParams.get('per_page'), '50')
  assert.equal(url.searchParams.get('order'), 'desc')
})

test('team relevance requires an actual home or away team match', () => {
  assert.equal(matchHasTeam({ title: 'Real Madrid vs Barcelona' }, 'Real Madrid'), true)
  assert.equal(matchHasTeam({ title: 'Barcelona vs Real Madrid' }, 'Real Madrid'), true)
  assert.equal(matchHasTeam({ title: 'Randers vs Copenhagen' }, 'Real Madrid'), false)
  assert.equal(matchHasTeam({ title: 'Real Sociedad vs Barcelona' }, 'Real Madrid'), false)
})

test('team can be supplied by query, body, or nested filters', () => {
  assert.equal(requestTeam({ query: { team: 'Real Madrid' }, body: {} } as unknown as Request), 'Real Madrid')
  assert.equal(requestTeam({ query: {}, body: { team: 'Real Madrid' } } as unknown as Request), 'Real Madrid')
  assert.equal(requestTeam({ query: {}, body: { filters: { team: 'Real Madrid' } } } as unknown as Request), 'Real Madrid')
})

test('team-specific provider response never leaks an unrelated fixture', async () => {
  const previous = {
    key: process.env.POLY_STREAM_API_KEY,
    provider: process.env.POLY_STREAM_PROVIDER,
    fanVibe: process.env.POLY_STREAM_FANVIBE_FEED_URL,
    lookup: process.env.POLYMARKET_MARKET_LOOKUP,
  }
  const originalFetch = globalThis.fetch
  process.env.POLY_STREAM_API_KEY = 'test-key'
  process.env.POLY_STREAM_PROVIDER = 'sportmonks'
  delete process.env.POLY_STREAM_FANVIBE_FEED_URL
  process.env.POLYMARKET_MARKET_LOOKUP = '0'
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [
      {
        id: 1,
        starting_at: '2026-08-03 18:00:00',
        state: { name: 'Not Started', short_name: 'NS' },
        participants: [
          { name: 'Real Madrid', meta: { location: 'home' } },
          { name: 'Barcelona', meta: { location: 'away' } },
        ],
      },
      {
        id: 2,
        starting_at: '2026-08-03 20:00:00',
        state: { name: 'Not Started', short_name: 'NS' },
        participants: [
          { name: 'Randers', meta: { location: 'home' } },
          { name: 'Copenhagen', meta: { location: 'away' } },
        ],
      },
    ],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  try {
    const feed = await getPolyStreamFeed('2026-08-02', 'Real Madrid')
    assert.equal(feed.matches.length, 1)
    assert.equal(feed.matches[0].title, 'Real Madrid vs Barcelona')
    assert.equal(feed.matches[0].sourceUrl, 'https://api.sportmonks.com/v3/football/fixtures/1')
    assert.deepEqual(feed.query, { team: 'Real Madrid' })
  } finally {
    globalThis.fetch = originalFetch
    if (previous.key === undefined) delete process.env.POLY_STREAM_API_KEY
    else process.env.POLY_STREAM_API_KEY = previous.key
    if (previous.provider === undefined) delete process.env.POLY_STREAM_PROVIDER
    else process.env.POLY_STREAM_PROVIDER = previous.provider
    if (previous.fanVibe === undefined) delete process.env.POLY_STREAM_FANVIBE_FEED_URL
    else process.env.POLY_STREAM_FANVIBE_FEED_URL = previous.fanVibe
    if (previous.lookup === undefined) delete process.env.POLYMARKET_MARKET_LOOKUP
    else process.env.POLYMARKET_MARKET_LOOKUP = previous.lookup
  }
})
