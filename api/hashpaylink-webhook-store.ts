import { mutateDurableJson, readDurableJson } from './render-durable-store.js'

const STORE_KEY = (process.env.HASH_PAYLINK_WEBHOOK_STORE_KEY ?? 'polydesk:hashpaylink-webhooks:v1').trim()
const MAX_EVENTS = 500

export type StoredHashPayLinkWebhookEvent = {
  id: string
  event: 'checkout.created' | 'payment.processing' | 'payment.confirmed' | 'payment.failed'
  checkoutId: string
  createdAt: string
  receivedAt: string
  data: Record<string, unknown>
  attempts: number
  processed: boolean
  processedAt?: string
  lastError?: string
}

type WebhookStore = { events: Record<string, StoredHashPayLinkWebhookEvent> }

function prune(events: Record<string, StoredHashPayLinkWebhookEvent>) {
  return Object.fromEntries(
    Object.entries(events)
      .sort(([, left], [, right]) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
      .slice(0, MAX_EVENTS),
  )
}

export async function claimHashPayLinkWebhookEvent(event: Omit<StoredHashPayLinkWebhookEvent, 'attempts' | 'processed'>) {
  let alreadyProcessed = false
  await mutateDurableJson<WebhookStore>(STORE_KEY, current => {
    const existing = current?.events?.[event.id]
    alreadyProcessed = existing?.processed === true
    const next: StoredHashPayLinkWebhookEvent = existing
      ? { ...existing, attempts: existing.attempts + 1, receivedAt: event.receivedAt }
      : { ...event, attempts: 1, processed: false }
    return { events: prune({ ...(current?.events ?? {}), [event.id]: next }) }
  })
  return { alreadyProcessed }
}

export async function completeHashPayLinkWebhookEvent(eventId: string, input: { processedAt: string; error?: string }) {
  await mutateDurableJson<WebhookStore>(STORE_KEY, current => {
    const existing = current?.events?.[eventId]
    if (!existing) return current ?? { events: {} }
    return {
      events: {
        ...current?.events,
        [eventId]: {
          ...existing,
          processed: !input.error,
          ...(input.error ? { lastError: input.error.slice(0, 180) } : { processedAt: input.processedAt, lastError: undefined }),
        },
      },
    }
  })
}

export async function latestHashPayLinkCheckoutEvent(checkoutId: string) {
  const store = await readDurableJson<WebhookStore>(STORE_KEY)
  return Object.values(store?.events ?? {})
    .filter(item => item.checkoutId === checkoutId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
}
