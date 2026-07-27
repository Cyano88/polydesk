import assert from 'node:assert/strict'
import test from 'node:test'
import { sportmonksUrls } from '../api/poly-stream.js'

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
