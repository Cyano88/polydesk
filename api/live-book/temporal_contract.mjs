// Versioned local validation contract. It never grants execution authority.
import { readFileSync } from 'node:fs'
export const TEMPORAL = Object.freeze(JSON.parse(readFileSync(new URL('./temporal_policy.json', import.meta.url), 'utf8')))
if (TEMPORAL.schema !== 'polydesk-temporal-v1' || TEMPORAL.timestampUnit !== 'milliseconds') throw Error('Unsupported temporal policy')
export function bookTimestamp(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{12,15}$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}
export function bookFresh(value, now, maximumAge = TEMPORAL.maximumBookAgeMs) {
  const time = bookTimestamp(value)
  return Number.isSafeInteger(now) && now >= 0 && time !== null
    && Number.isFinite(maximumAge) && maximumAge >= 0
    && now - time <= Math.min(maximumAge, TEMPORAL.maximumBookAgeMs)
    && time - now <= TEMPORAL.maximumBookFutureMs
}
export function preparationState(created, expires, now) {
  if (![created, expires, now].every(n => Number.isSafeInteger(n) && n >= 0)) return 'INVALID_TIME'
  if (created > now) return created-now <= TEMPORAL.maximumClockWaitMs ? 'WAIT_FOR_CLOCK' : 'FUTURE_CREATION'
  if (now-created > TEMPORAL.maximumPreparationAgeMs) return 'STALE_PREPARATION'
  if (expires <= now) return 'EXPIRED'
  if (expires-created > TEMPORAL.maximumPreparationLifetimeMs || expires-now > TEMPORAL.maximumPreparationLifetimeMs) return 'INVALID_LIFETIME'
  return 'VALID'
}
