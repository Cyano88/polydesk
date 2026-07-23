import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorldCupFinalDeliverable,
  FOOTBALL_DATA_ROADMAP,
  WORLD_CUP_2026_FINAL_SUMMARY,
} from '../api/worldcup-final-summary.js'

test('returns the verified World Cup 2026 podium and final result', () => {
  const deliverable = createWorldCupFinalDeliverable(new Date('2026-07-23T08:00:00.000Z'))

  assert.equal(deliverable.ok, true)
  assert.equal(deliverable.availability.live, false)
  assert.deepEqual(WORLD_CUP_2026_FINAL_SUMMARY.podium, [
    { position: 1, team: 'Spain' },
    { position: 2, team: 'Argentina' },
    { position: 3, team: 'England' },
  ])
  assert.equal(WORLD_CUP_2026_FINAL_SUMMARY.final.score, '1-0')
  assert.equal(WORLD_CUP_2026_FINAL_SUMMARY.final.decided, 'after extra time')
  assert.equal(WORLD_CUP_2026_FINAL_SUMMARY.bronzeFinal.score, '4-6')
  assert.equal(deliverable.generatedAt, '2026-07-23T08:00:00.000Z')
})

test('publishes the five-league live-data roadmap without a launch-date claim', () => {
  assert.deepEqual(FOOTBALL_DATA_ROADMAP.competitions, [
    'English Premier League',
    'La Liga',
    'Bundesliga',
    'Serie A',
    'Ligue 1',
  ])
  assert.equal(FOOTBALL_DATA_ROADMAP.status, 'coming_soon')
})
