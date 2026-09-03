import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import {
  getPolyWorldcupNewsFeed,
  requestFootballNewsQuery,
  sportmonksNewsUrls,
} from '../api/poly-worldcup-news.js'

test('Sportmonks news uses official preview and recap endpoints', () => {
  const urls = sportmonksNewsUrls({ league: 'La Liga', type: 'all' }).map(value => new URL(value))
  assert.deepEqual(urls.map(url => url.pathname), [
    '/v3/football/news/prematch',
    '/v3/football/news/postmatch',
  ])
  for (const url of urls) {
    assert.equal(url.searchParams.get('include'), 'league;fixture;lines')
    assert.equal(url.searchParams.get('order'), 'desc')
    assert.equal(url.searchParams.get('per_page'), '25')
  }
})

test('news request accepts team, league, and type filters', () => {
  const query = requestFootballNewsQuery({
    query: {},
    body: { filters: { team: 'Real Madrid', league: 'La Liga', type: 'pre-match' } },
  } as unknown as Request)
  assert.deepEqual(query, { team: 'Real Madrid', league: 'La Liga', type: 'pre-match' })
})

test('Sportmonks is primary and a filtered response cannot leak unrelated news', async () => {
  const previous = {
    key: process.env.POLY_STREAM_API_KEY,
    fallbackKey: process.env.POLY_NEWS_API_KEY,
  }
  const originalFetch = globalThis.fetch
  process.env.POLY_STREAM_API_KEY = 'test-key'
  delete process.env.POLY_NEWS_API_KEY
  globalThis.fetch = async input => {
    const url = String(input)
    if (url.startsWith('https://gamma-api.polymarket.com/')) {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/news/postmatch')) {
      return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      data: [
        {
          id: 10,
          fixture_id: 19135250,
          title: 'Real Madrid prepare for their La Liga fixture',
          type: 'prematch',
          league: { name: 'La Liga', image_path: 'https://cdn.sportmonks.com/laliga.png' },
          fixture: { id: 19135250, name: 'Real Madrid vs Getafe' },
          lines: [{ text: 'Team news and match context.' }],
        },
        {
          id: 11,
          fixture_id: 19135251,
          title: 'Celtic prepare for league action',
          type: 'prematch',
          league: { name: 'Premiership' },
          fixture: { id: 19135251, name: 'Celtic vs Rangers' },
          lines: [{ text: 'Unrelated article.' }],
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const feed = await getPolyWorldcupNewsFeed({ team: 'Real Madrid', league: 'La Liga', type: 'all' })
    assert.equal(feed.mode, 'live')
    assert.equal(feed.source, 'sportmonks')
    assert.equal(feed.articles.length, 1)
    assert.match(feed.articles[0].title, /Real Madrid/)
    assert.equal(feed.articles[0].description, 'Team news and match context.')
    assert.equal(feed.articles[0].url, 'https://api.sportmonks.com/v3/football/fixtures/19135250')
  } finally {
    globalThis.fetch = originalFetch
    if (previous.key === undefined) delete process.env.POLY_STREAM_API_KEY
    else process.env.POLY_STREAM_API_KEY = previous.key
    if (previous.fallbackKey === undefined) delete process.env.POLY_NEWS_API_KEY
    else process.env.POLY_NEWS_API_KEY = previous.fallbackKey
  }
})

test('sports news fails closed instead of falling back to a general-news provider', async () => {
  const previous = {
    sportmonks: process.env.POLY_STREAM_API_KEY,
    general: process.env.POLY_NEWS_API_KEY,
  }
  const originalFetch = globalThis.fetch
  process.env.POLY_STREAM_API_KEY = 'test-key'
  process.env.POLY_NEWS_API_KEY = 'must-not-be-used'
  globalThis.fetch = async input => {
    const url = String(input)
    assert.match(url, /api\.sportmonks\.com/)
    return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const feed = await getPolyWorldcupNewsFeed({ team: 'No Fallback FC', type: 'all' })
    assert.equal(feed.mode, 'unavailable')
    assert.equal(feed.source, 'unavailable')
    assert.equal(feed.articles.length, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (previous.sportmonks === undefined) delete process.env.POLY_STREAM_API_KEY
    else process.env.POLY_STREAM_API_KEY = previous.sportmonks
    if (previous.general === undefined) delete process.env.POLY_NEWS_API_KEY
    else process.env.POLY_NEWS_API_KEY = previous.general
  }
})
