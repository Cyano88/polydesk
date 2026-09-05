export const INDEPENDENT_RESEARCH_POLICY = 'agent-independent-v1' as const
export const INDEPENDENT_RESEARCH_DISCLAIMER = 'This is the buyer agent\'s independent decision. ZeroScout approval is not required or implied. The buyer accepts responsibility for its thesis and signed limits; all market, wallet, funding, price, spend, and signature checks still apply.'

export function independentExecutionDescriptor() {
  return {
    mode: INDEPENDENT_RESEARCH_POLICY,
    automatic: false,
    entryPoints: ['/api/x402/base/polymarket-smart-trader', '/api/a2mcp/polymarket-smart-trader'],
    entryAction: 'INDEPENDENT_PREPARE',
    entryInput: 'Put the acknowledged independent preparation request inside independentOrder. No market is chosen automatically.',
    endpoint: '/api/polymarket-independent/prepare',
    method: 'POST',
    supportedSides: ['BUY'],
    supportedOrderTypes: ['FAK', 'FOK'],
    requiresZeroScout: false,
    requiresAnalysisPayment: false,
    acknowledgement: { acknowledgeIndependentDecision: true },
    required: ['acknowledgeIndependentDecision', 'externalOrderId', 'ownerAddress', 'marketUrl', 'outcome', 'side', 'maxSpendUsdc', 'maximumPrice'],
    disclaimer: INDEPENDENT_RESEARCH_DISCLAIMER,
    next: 'Explicitly choose this route and your own limits. Preparation is free; the existing governed handoff retains its separately disclosed service access terms. An ESCALATE research receipt is not converted into an APPROVE receipt.',
  }
}
