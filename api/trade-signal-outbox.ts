import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { mutateDurableJson, readDurableJson } from './render-durable-store.js'

const OUTBOX_KEY = 'polydesk:trade-signal-outbox:v1'
const MAX_EVENTS = 500

export type TradeSignalEvent = {
  schema: 'polydesk-trade-signal-v1'
  eventId: string
  eventType: 'signal.created' | 'execution.verified'
  signalId: string
  occurredAt: string
  producer: { agent: 'PolyDesk'; service: 'Governed Polymarket Trader'; serviceRequestId: string }
  correlation: { executionId: string; externalOrderId: string }
  instrument: {
    venue: 'Polymarket'
    assetClass: 'prediction-market'
    marketTitle: string
    marketUrl: string
    outcome: string
    tokenId: string
  }
  action: {
    side: 'BUY'
    orderType: 'FAK' | 'FOK'
    maximumAmountUsdc: string
    maximumPrice: string
  }
  policy: {
    decision: 'APPROVE'
    decisionHash: string
    orderHash: string
    mandateHash: string
    reasons: string[]
  }
  execution?: {
    status: 'VERIFIED_FILLED'
    orderId: string
    transactionHash: string
    fillSize: number
    fillPrice: number
    fillAmountUsdc: number
  }
  delivery: { okxLiveSignals: 'pending-schema' }
}

type TradeSignalOutbox = {
  schema: 'polydesk-trade-signal-outbox-v1'
  events: TradeSignalEvent[]
  updatedAt: string
}

type GovernedSignalInput = {
  executionId: string
  externalOrderId: string
  occurredAt: string
  market: TradeSignalEvent['instrument']
  action: TradeSignalEvent['action']
  policy: Omit<TradeSignalEvent['policy'], 'decision'>
}

type VerifiedExecutionInput = GovernedSignalInput & {
  execution: NonNullable<TradeSignalEvent['execution']>
}

function eventId(signalId: string, eventType: TradeSignalEvent['eventType'], unique: string) {
  return `pds_${createHash('sha256').update(`${signalId}:${eventType}:${unique}`).digest('hex').slice(0, 24)}`
}

function baseEvent(input: GovernedSignalInput) {
  const signalId = `polydesk:${input.executionId}`
  return {
    schema: 'polydesk-trade-signal-v1' as const,
    signalId,
    occurredAt: input.occurredAt,
    producer: {
      agent: 'PolyDesk' as const,
      service: 'Governed Polymarket Trader' as const,
      serviceRequestId: input.externalOrderId,
    },
    correlation: { executionId: input.executionId, externalOrderId: input.externalOrderId },
    instrument: input.market,
    action: input.action,
    policy: { decision: 'APPROVE' as const, ...input.policy },
    delivery: { okxLiveSignals: 'pending-schema' as const },
  }
}

export function buildGovernedTradeSignal(input: GovernedSignalInput): TradeSignalEvent {
  const base = baseEvent(input)
  return {
    ...base,
    eventId: eventId(base.signalId, 'signal.created', input.policy.decisionHash),
    eventType: 'signal.created',
  }
}

export function buildVerifiedExecutionSignal(input: VerifiedExecutionInput): TradeSignalEvent {
  const base = baseEvent(input)
  return {
    ...base,
    eventId: eventId(base.signalId, 'execution.verified', input.execution.transactionHash.toLowerCase()),
    eventType: 'execution.verified',
    execution: input.execution,
  }
}

export function appendTradeSignalEventToOutbox(
  current: TradeSignalOutbox | undefined,
  event: TradeSignalEvent,
): TradeSignalOutbox {
  const events = current?.events ?? []
  if (events.some(item => item.eventId === event.eventId)) return current as TradeSignalOutbox
  return {
    schema: 'polydesk-trade-signal-outbox-v1',
    events: [...events, event].slice(-MAX_EVENTS),
    updatedAt: event.occurredAt,
  }
}

export async function appendTradeSignalEvent(event: TradeSignalEvent) {
  return mutateDurableJson<TradeSignalOutbox>(OUTBOX_KEY, current => appendTradeSignalEventToOutbox(current, event))
}

export async function tradeSignalOutboxHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50))
  const after = String(req.query.after ?? '').trim()
  const outbox = await readDurableJson<TradeSignalOutbox>(OUTBOX_KEY)
  const events = outbox?.events ?? []
  const cursorIndex = after ? events.findIndex(event => event.eventId === after) : -1
  const start = after && cursorIndex >= 0 ? cursorIndex + 1 : Math.max(0, events.length - limit)
  const selected = events.slice(start, start + limit)
  return res.status(200).json({
    ok: true,
    schema: 'polydesk-trade-signal-outbox-v1',
    events: selected,
    nextCursor: selected.at(-1)?.eventId ?? (after || null),
    integration: {
      okxLiveSignals: 'pending-schema',
      note: 'Map this stable internal envelope only after OKX provides the official Live Signals ingestion contract.',
    },
  })
}
