# PolyDesk requesting-agent review handoff

This release extends the existing PolyDesk-compatible skill and both Smart Trader entry points. It does not replace ZeroScout or alter service payment terms.

## Flow

1. Free GET `/api/polymarket/discover` returns candidates with condition IDs and labeled token IDs. Resolve event, competition, date, rules and outcome; never select the first result automatically. Next-fixture claims still require authoritative schedule evidence.
2. ANALYZE requires an explicit outcome and side. Existing service-payment confirmation rules apply. Preflight failure issues no payment challenge and provides a `reviewRequest` descriptor.
3. Free REVIEW accepts exact `marketId` or `marketUrl`, `outcome`, `side`, and optional screening `mandate`. It runs before AI/storage/payment readiness checks and returns current public market/book/wallet-flow context, not AI or news. Credentials, ambiguous outcomes and conflicting condition lookups fail closed.
4. ANALYZE and REVIEW include `agentHandoff` (`polydesk-agent-handoff-v1`). Review `selected`, `evidence`, blockers, source freshness and continuation. Unavailable AI is neither a market rejection nor a recommendation.
5. An autonomous agent may independently review only under existing user authority; otherwise ask the user. The BUY-only independent template leaves acknowledgement false and owner/order ID/spend/price unset. The existing preparation endpoint and governed flow retain wallet, market, book, funding, limits, eligibility and signature checks. No handoff is an order submission or fill.

## Delivery and recovery

The settled request remains asynchronous. Its payment-status URL now includes `result`, the persisted evidence response, for terminal deliveries. New unavailable-AI responses finish transport with `deliveryStatus: degraded`, `researchStatus: UNAVAILABLE`, and a review handoff. This does not claim successful AI analysis or proof delivery. They do not automatically loop through further AI attempts or restart from polling. Explicit operator degraded-research recovery remains bound to the original payment and six-attempt budget, without a new charge.

Prior receipt hashes and responses are not rewritten. Missing-proof records without a versioned review handoff retain the existing recovery policy. No analysis-engine version bump or bulk remediation is included.

## Verification boundary

Tests cover discovery, free review with research/payment dependencies down, exact outcome binding, unknown fields, book identity and timestamps, unacknowledged requests, BUY-only independent preparation, AI approval versus escalation, one-attempt degraded delivery, and payment recovery. Live REVIEW checks are read-only and do not prove signing or fills. AI availability remains provider-dependent.
