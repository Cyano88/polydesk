import { createHash } from 'node:crypto'
import WebSocket from 'ws'
import { observeLiveBook } from './live-book/live_book.mjs'

// Only trusted server code calls this; no HTTP input can supply observation evidence.
// Re-observe the exact prepared snapshot. Never change its timestamp or extend expiry.
export async function verifyPreparedFeed(plan: {market: {conditionId: string; tokenId: string; bookHash: string | null; bookTimestamp: string | null}; createdAt: string; expiresAt: string}, now = Date.now): Promise<boolean> {
  const binding = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  try {
    const observation = await observeLiveBook({token_id: plan.market.tokenId, condition_id: plan.market.conditionId}, {Socket: WebSocket, now})
    const clock = now(), observed = observation.observedAtMs
    return observation.ok === true && observation.schema === 'polydesk-feed-observation-v2'
      && observation.conditionId === plan.market.conditionId && observation.tokenId === plan.market.tokenId
      && observation.bookHash === plan.market.bookHash && String(observation.snapshotTimestampMs) === plan.market.bookTimestamp
      && observation.heartbeatVerified === true && observation.restComparisons === 2
      && typeof observed === 'number' && observed <= clock && clock - observed <= 5000
      && Date.parse(plan.createdAt) <= clock && clock - Date.parse(plan.createdAt) <= 30000
      && Date.parse(plan.expiresAt) > clock
      && binding === createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  } catch { return false }
}
