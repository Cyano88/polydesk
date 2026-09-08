// Buyer-local live guard. Public feeds only; never grants authority or retries preparation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { TEMPORAL, bookTimestamp, bookFresh } from './temporal_contract.mjs'
export const LIVE_BOOK_CODES = Object.freeze([
  'UNSIGNED_FEE_MARKET_NETWORK', 'UNSIGNED_FEE_MARKET_HTTP', 'UNSIGNED_FEE_MARKET_FORMAT', 'UNSIGNED_FEE_MARKET_SIZE',
  'UNSIGNED_FEE_BUILDER_NETWORK', 'UNSIGNED_FEE_BUILDER_HTTP', 'UNSIGNED_FEE_BUILDER_FORMAT', 'UNSIGNED_FEE_BUILDER_SIZE',
  'UNSIGNED_FEE_MARKET_MAPPING', 'UNSIGNED_FEE_CURVE', 'UNSIGNED_FEE_BUILDER_RATE',
  'UNSIGNED_FEE_COLLATERAL', 'UNSIGNED_FEE_ALLOCATION', 'UNSIGNED_FEE_ROUNDED_AMOUNT', 'UNSIGNED_FEE_MINIMUM_SIZE',
  'PREPARATION_NETWORK_FAILED', 'PREPARATION_HTTP_REJECTED', 'PREPARATION_PRICE_LIMIT_EXCEEDED',
  'PREPARATION_READINESS_REJECTED', 'PREPARATION_CONFLICT', 'PREPARATION_VALIDITY_REJECTED',
  'PREPARATION_ORDER_TYPE_MISMATCH', 'UNSIGNED_ENVELOPE_VALIDATION_FAILED',
    'UNSIGNED_REVIEW_INVALID', 'UNSIGNED_PREPARATION_INVALID', 'UNSIGNED_TIMING_INVALID',
    'UNSIGNED_CREATED_AT_INVALID', 'UNSIGNED_CREATED_AT_FUTURE', 'UNSIGNED_EXPIRES_AT_INVALID',
    'UNSIGNED_PREPARATION_EXPIRED', 'UNSIGNED_EXPIRY_MISMATCH',
    'UNSIGNED_PREPARATION_STALE', 'UNSIGNED_LIFETIME_INVALID',
    'UNSIGNED_MARKET_INVALID', 'UNSIGNED_WALLET_INVALID', 'UNSIGNED_SIGNING_ROUTE_INVALID',
    'UNSIGNED_LIMIT_INVALID', 'UNSIGNED_SDK_LOAD_FAILED', 'UNSIGNED_TICK_INVALID',
    'UNSIGNED_SDK_BUILD_FAILED', 'UNSIGNED_ROUNDED_LIMIT_EXCEEDED', 'UNSIGNED_FEE_BUDGET_INVALID',
  'LIVE_BOOK_CONNECTION_FAILED', 'LIVE_BOOK_DISCONNECTED', 'LIVE_BOOK_EVENT_INVALID',
  'LIVE_BOOK_SNAPSHOT_MISSING', 'LIVE_BOOK_SNAPSHOT_STALE', 'LIVE_BOOK_HEARTBEAT_MISSING',
  'LIVE_BOOK_DEADLINE_EXCEEDED', 'LIVE_BOOK_REST_FAILED', 'LIVE_BOOK_DISAGREES',
  'LIVE_BOOK_PREPARATION_MISMATCH', 'PREVIEW_INVALIDATED_BY_MARKET_CHANGE',
])
export class LiveBookFailure extends Error {
  constructor(code) {
    assert.ok(LIVE_BOOK_CODES.includes(code)); super(code); this.code = code
    this.handoff = { ok: false, error: code, state: 'EXECUTION_BLOCKED',
      nextAction: 'INSPECT_MARKET_DATA_THEN_REPREPARE', automaticRetryAllowed: false,
      signingAuthorized: false, orderSubmitted: false, paymentPerformed: false }
  }
}
const reject = code => { throw new LiveBookFailure(code) }
const decimal = value => {
  assert.equal(typeof value, 'string')
  assert.match(value, /^\d{1,24}(?:\.\d{1,18})?$/)
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole).toString() + (fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : '')
}
const hash = value => { assert.match(value, /^(?:0x)?[a-f0-9]{40,64}$/); return value }
const levels = rows => {
  assert.ok(Array.isArray(rows) && rows.length <= 4096)
  const map = new Map()
  for (const row of rows) {
    const price = decimal(row.price), size = decimal(row.size)
    assert.ok(!map.has(price))
    if (size !== '0') map.set(price, size)
  }
  return map
}
const canonical = map => JSON.stringify([...map].sort(([a], [b]) => a.localeCompare(b)))
export class LiveBook {
  constructor(token, condition) {
    assert.match(token, /^\d+$/); assert.match(condition, /^0x[a-f0-9]{64}$/)
    this.token = token; this.condition = condition; this.revision = 0; this.timestamp = 0
    this.bids = null; this.asks = null; this.failed = false; this.receivedAt = null
  }
  apply(event, now) {
    try {
      assert.ok(event && typeof event === 'object')
      assert.ok(Number.isSafeInteger(now) && now >= 0 && (this.receivedAt === null || now >= this.receivedAt))
      const changes = event.price_changes
      const relevant = event.market === this.condition || event.asset_id === this.token || (Array.isArray(changes) && changes.some(x => x.asset_id === this.token))
      if (!relevant) return
      assert.equal(event.market, this.condition)
      const timestamp = bookTimestamp(event.timestamp)
      assert.notEqual(timestamp, null)
      assert.ok(Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= now + TEMPORAL.maximumBookFutureMs && timestamp >= this.timestamp)
      if (event.event_type === 'book') {
        assert.equal(event.asset_id, this.token)
        this.bids = levels(event.bids); this.asks = levels(event.asks); this.hash = hash(event.hash)
      } else if (event.event_type === 'price_change') {
        assert.ok(this.bids && this.asks && Array.isArray(changes) && changes.length <= 4096)
        if (!changes.some(x => x.asset_id === this.token)) return
        for (const c of changes.filter(x => x.asset_id === this.token)) {
          assert.ok(c.side === 'BUY' || c.side === 'SELL')
          const map = c.side === 'BUY' ? this.bids : this.asks
          const price = decimal(c.price), size = decimal(c.size)
          if (size === '0') map.delete(price); else map.set(price, size)
          assert.ok(map.size <= 4096)
          this.hash = hash(c.hash)
        }
      } else { throw Error('Market changed outside supported book updates') }
      this.timestamp = timestamp; this.receivedAt = now; this.revision++
    } catch (error) { this.failed = true; throw error }
  }
  fresh(now) { return !this.failed && this.bids && bookFresh(String(this.timestamp), now) }
  matches(book, now) {
    if (!this.fresh(now)) return false
    return this.matchesSnapshot(book, now)
  }
  // Content agreement is distinct from snapshot-age policy. Never authorizes an order.
  matchesSnapshot(book, now) {
    if (this.failed || !this.bids || !this.asks || !Number.isSafeInteger(now)
        || now < this.receivedAt) return false
    const other = new LiveBook(this.token, this.condition)
    other.apply({ ...book, event_type: 'book' }, now)
    return other.revision === 1 && this.timestamp === other.timestamp && this.hash === other.hash
      && canonical(this.bids) === canonical(other.bids) && canonical(this.asks) === canonical(other.asks)
  }
}
export async function readBook(fetcher, token) {
  const url = 'https://clob.polymarket.com/book?token_id=' + token
  const r = await fetcher(url, { method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000) })
  assert.equal(r.status, 200); assert.ok(!r.redirected && (!r.url || r.url === url))
  const reader = r.body.getReader(), chunks = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength; assert.ok(size <= 131072); chunks.push(value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function withLiveBook(intent, prepareOnce, { fetcher = fetch, Socket = WebSocket, now = Date.now, waitMs = 12000 } = {}) {
  return runLiveBook(intent, prepareOnce, { fetcher, Socket, now, waitMs }, false)
}
// Observation cannot accept a preparation callback or relax the execution entry point.
export async function observeLiveBook(intent, { fetcher = fetch, Socket = WebSocket, now = Date.now, waitMs = 12000 } = {}) {
  return runLiveBook(intent, null, { fetcher, Socket, now, waitMs }, true)
}
// Hold the buyer-owned feed across one unsigned preparation. Never consumes JSON evidence.
export async function withVerifiedFeed(intent, prepareOnce, { fetcher = fetch, Socket = WebSocket, now = Date.now, waitMs = 12000 } = {}) {
  assert.equal(typeof prepareOnce, 'function')
  return runLiveBook(intent, prepareOnce, { fetcher, Socket, now, waitMs }, false, true)
}
async function runLiveBook(intent, prepareOnce, { fetcher, Socket, now, waitMs }, observationOnly, quietPreparation = false) {
  assert.ok(Number.isSafeInteger(waitMs) && waitMs >= 0 && waitMs <= 12000)
  intent = structuredClone(intent)
  const tracker = new LiveBook(intent.token_id, intent.condition_id)
  let socket
  try { socket = new Socket('wss://ws-subscriptions-clob.polymarket.com/ws/market') }
  catch { reject('LIVE_BOOK_CONNECTION_FAILED') }
  let connected = false, fault = null, lastPong = 0
  const fail = code => { fault ||= code }
  const started = now()
  socket.addEventListener('open', () => {
    connected = true
    try {
      socket.send(JSON.stringify({ assets_ids: [intent.token_id], type: 'market' }))
      socket.send('PING')
    } catch { fail('LIVE_BOOK_CONNECTION_FAILED') }
  })
  socket.addEventListener('close', () => { connected = false; fail('LIVE_BOOK_DISCONNECTED') })
  socket.addEventListener('error', () => { fail('LIVE_BOOK_CONNECTION_FAILED') })
  socket.addEventListener('message', ({ data }) => {
    try {
      if (data === 'PONG') { lastPong = now(); return }
      assert.ok(typeof data === 'string' && Buffer.byteLength(data) <= 131072)
      const decoded = JSON.parse(data), events = Array.isArray(decoded) ? decoded : [decoded]
      assert.ok(events.length <= 256)
      for (const event of events) tracker.apply(event, now())
    } catch { fail('LIVE_BOOK_EVENT_INVALID'); socket.close() }
  })
  const timer = setInterval(() => {
    try { if (connected) socket.send('PING') } catch { fail('LIVE_BOOK_CONNECTION_FAILED') }
  }, 10000)
  const expiry = setTimeout(() => { fail('LIVE_BOOK_DEADLINE_EXCEEDED'); socket.close() }, 35000)
  const observationRecent = () => tracker.receivedAt !== null && now() >= tracker.receivedAt
    && now() - tracker.receivedAt <= TEMPORAL.maximumBookAgeMs
  const snapshotAcceptable = () => observationOnly || quietPreparation ? observationRecent() : tracker.fresh(now())
  const heartbeatHealthy = () => lastPong > 0 && now() >= lastPong && now() - lastPong <= 15000
  const healthy = () => connected && !fault && heartbeatHealthy() && snapshotAcceptable()
  const requireHealthy = () => {
    if (fault) reject(fault)
    if (!connected) reject('LIVE_BOOK_CONNECTION_FAILED')
    if (!tracker.bids) reject('LIVE_BOOK_SNAPSHOT_MISSING')
    if (!snapshotAcceptable()) reject('LIVE_BOOK_SNAPSHOT_STALE')
    if (!heartbeatHealthy()) reject('LIVE_BOOK_HEARTBEAT_MISSING')
  }
  const read = async () => {
    try { return await readBook(fetcher, intent.token_id) }
    catch { reject('LIVE_BOOK_REST_FAILED') }
  }
  const matches = book => { try { return observationOnly || quietPreparation ? tracker.matchesSnapshot(book, now()) : tracker.matches(book, now()) } catch { return false } }
  try {
    while (!healthy() && !fault && now() - started < waitMs) await new Promise(resolve => setTimeout(resolve, 50))
    requireHealthy()
    const book = await read()
    requireHealthy()
    if (!matches(book)) reject('LIVE_BOOK_DISAGREES')
    const revision = tracker.revision
    const envelope = observationOnly ? null : await prepareOnce() // exactly once, never automatic retry
    requireHealthy()
    if (tracker.revision !== revision) reject('PREVIEW_INVALIDATED_BY_MARKET_CHANGE')
    if (!observationOnly && (envelope?.preparation?.market?.bookHash !== tracker.hash ||
        Number(envelope?.preparation?.market?.bookTimestamp) !== tracker.timestamp)) reject('LIVE_BOOK_PREPARATION_MISMATCH')
    const after = await read()
    requireHealthy()
    if (tracker.revision !== revision || !matches(after)) reject('PREVIEW_INVALIDATED_BY_MARKET_CHANGE')
    if (observationOnly) return { ok: true, schema: 'polydesk-feed-observation-v2',
      conditionId: tracker.condition, tokenId: tracker.token, bookHash: tracker.hash,
      bookContentSha256: createHash('sha256').update(JSON.stringify({
        conditionId: tracker.condition, tokenId: tracker.token, timestamp: tracker.timestamp,
        bids: canonical(tracker.bids), asks: canonical(tracker.asks),
      })).digest('hex'),
      scope: 'MARKET_OBSERVATION_ONLY', planBound: false,
      state: 'FEED_OBSERVED_NOT_AUTHORIZED', snapshotTimestampMs: tracker.timestamp,
      snapshotAgeMs: now() - tracker.timestamp, snapshotReceivedAtMs: tracker.receivedAt,
      observedAtMs: now(), heartbeatVerified: true, restComparisons: 2,
      snapshotWithinLegacyAgeLimit: Boolean(tracker.fresh(now())),
      preparationCalled: false, readyForLiveExecution: false, signingAuthorized: false,
      orderSubmitted: false, paymentPerformed: false,
      nextAction: 'OBSERVATION_ONLY_EXECUTION_VALIDATORS_UNCHANGED' }
    return envelope
  } finally { clearInterval(timer); clearTimeout(expiry); socket.close() }
}
