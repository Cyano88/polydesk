# Managed Agent orchestration implementation — 2026-09-10

## Implemented locally

The private managed route now accepts action conversation. The existing operator verifies the exact active managed subscription in the official directories before forwarding it. Durable per-buyer/per-subscription sessions retain partial answers and require confirmation of the current preference revision before enrollment. Existing stored preferences seed a new session. Local pause and expiry override platform subscription activity.

Onboarding confirmation reuses existing verified-email enrollment. STATUS reports the actual monitoring state and follow-up choices. Inactive digest settings receive internal placeholders only; active schedules require buyer-provided timing.

RESEARCH reuses the One-Off research engine within the active managed entitlement. The buyer explicitly chooses whether to include private receipt history. The same owner-authenticated Sibyl handler verifies recall. Verified historical context is passed to the research engine with a data-only, partial-history boundary; it is never trading approval. Recall signatures are hashed as part of input identity and never persisted as raw signatures in session records.

PREPARE_TRADE calls the existing independent BUY preparation or FOK SELL preflight. Both return previews without submitting orders. Stable request IDs, atomic session mutations, and durable pending markers prevent concurrent or duplicate side effects. A crash before result persistence leaves the operation blocked for reconciliation. The current journal stops at 500 operations rather than silently dropping replay protection; archival/reconciliation tooling is still required before high-volume production use.

## Bounded copy controller

A separate controller verifies owner-signed policies bound to subscription, buyer, source wallet, nonce, issuance/expiry, fee-inclusive per-trade and UTC daily caps, maximum price, and maximum trade count. It currently supports FOK BUY signals only.

Trusted adapters supply observed source signals and current plans. The controller checks source/market identity, signal freshness, owner/side/order type, price, fee-inclusive cost, and active entitlement. Atomic reservations share the daily cap and block additional trades while any attempt is unresolved. A stable signal cannot execute again under a replacement policy.

Execution errors enter reconciliation rather than resubmission. Only an exact matching finalized receipt completes the attempt. Recovery is allowed after policy expiry; new execution is not. Revocation requires a separate owner-signed revocation message. Completion returns receipt and follow-up choices. Conservative reservations are retained after fills; they are not silently recycled.

## What the tests prove

- 150 three-service tests passed, including 14 managed conversation tests and 11 simulated copy-controller tests.
- Server TypeScript validation passed.
- Simulated paths cover partial onboarding, stale confirmation, reuse of existing settings, local pause, memory choice and owner binding, failed recall, expiry during recall, concurrent/replayed requests, uncertain persistence, BUY/SELL previews, signed policy mutation, spend caps, stale/spoofed signals, uncertain submissions, finalized recovery, revocation, and concurrent signals.

These are local tests with simulated execution and storage adapters. They do not prove a live buyer-wallet trade, real production Postgres contention for the new controller, provider costs, or live Sibyl recall through the new managed conversation.

## Remaining integration and release work

- Deploy and validate the conversation route/operator instructions using an authorized controlled buyer.
- Connect a buyer-authorized execution adapter and independent receipt reconciler. No production copy adapter or scheduler has been registered; automaticCopyExecution remains false.
- Persist verified live receipts through the existing receipt/outbox path; do not insert simulated receipts into Sibyl or claim that controller receipt objects alone prove memory synchronization.
- Add operational recovery/archival tools for long-lived conversation journals.
- Complete live buyer acceptance only under explicit spend and execution approval.
- Marketplace scope remains exactly three A2A services; no retired listing was changed.

No live trade, paid research request, email, buyer message, or subscription mutation was performed by these development tests.
