import { receiptMemoryDescriptor } from './receipt-memory-api.js'
import { independentExecutionDescriptor } from './polymarket-independent-policy.js'

/** Discovery only. Subscription entitlement is never owner, memory, or trade authorization. */
export function managedServiceContinuation(state: string, periodEndAt: string, emailVerified: boolean, now = Date.now()) {
  const active = state === 'active' && Date.parse(periodEndAt) > now
  return {
    schema: 'polydesk-managed-continuation-v1',
    monitoringOnly: true,
    tradeAuthorized: false,
    orderSubmitted: false,
    automaticCopyExecution: false,
    receiptMemory: receiptMemoryDescriptor('https://polydesk.trade'),
    memoryRule: 'Recall only with the trading owner proof, never the watched address or subscription identity. Verified receipts are context, not AI research or trading approval.',
    trading: active ? {
      buy: { ...independentExecutionDescriptor(), entryPoints: ['/api/polymarket-independent/prepare'] },
      sell: {
        method: 'POST', endpoint: '/api/polymarket-account/sell-preflight',
        required: ['ownerAddress', 'marketSlug', 'outcome', 'shares', 'minimumPrice'],
        orderType: 'FOK', previewOnly: true,
      },
      gates: [
        'Exact market, outcome, side, size, price and current fee-inclusive balance checks.',
        'Explicit bounded owner authorization after preview; watched-wallet signals grant no authority.',
        'Recheck readiness before execution. Use the guarded launcher with a stable execution ID for the local plugin path.',
        'An uncertain submission blocks a retry until exact order and finalized receipt reconciliation.',
        'Verified receipt capture and Sibyl synchronization never authorize resubmission.',
      ],
      executionBoundary: 'These are shared preparation handoffs, not an unattended copy executor. Local launcher recovery protection does not prove distributed exactly-once execution.',
    } : null,
    followUpPrompts: !active
      ? [state === 'paused' ? 'Resume monitoring?' : 'Check subscription status?', 'Review previous receipts with owner authorization?']
      : !emailVerified
        ? ['Verify your notification email to enable monitoring.', 'Check subscription status?']
        : ['Show monitored positions?', 'Review previous receipts with owner authorization?', 'Prepare a trade for review?', 'Change alerts or pause monitoring?'],
  }
}
