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

## Production acceptance update

Release `0ba4eb494e9878d94c8f70437945f7a92678ac83` was pushed to main and verified live on Render as deployment `dep-dahc3rnavr4c738pv930` on 2026-09-10. The VPS checkout matches this commit; the active workspace instructions match the repository instructions and the A2A daemon is active.

All 25 new orchestration tests also passed on the Linux operator host (in addition to the previously completed 150-test regression suite and server typecheck).

The hosted acceptance probe used an existing enrolled buyer and fresh authoritative subscription lookup. It verified:

- Actual state: `MONITORING_ACTIVE`.
- Follow-up prompts: Show monitored positions? Review a trade? Change alerts or pause monitoring?
- Repeating the same request returned `idempotentReplay: true`.
- A mismatched buyer was rejected by the operator before forwarding.
- `tradeAuthorized: false` and `orderSubmitted: false`.
- Three exact active subscriptions were found; this count is not evidence that all three buyers completed onboarding.

This probe created a durable STATUS operation only. It did not send a buyer message, request paid research, alter enrollment, or execute a trade. It verifies the hosted operator-to-API conversation path, not a new inbound buyer chat exchange. Live owner-authorized recall, buyer-wallet execution adapters, pending-operation recovery, receipt-memory synchronization, and full buyer conversation acceptance remain outstanding. Automatic copy execution remains disabled.

Demo evidence: distinguish local/simulated controller tests from the hosted status acceptance and from the earlier real One-Off trade receipts. Do not describe these checks as a live managed copy trade.
## Managed receipt continuation implementation

The managed conversation now supports CHECK_TRADE with short-lived owner-signed access bound to the exact subscription, buyer, execution, and optional completion evidence. It reads the existing governed execution record, verifies its authority owner, and reuses the actual governed completion handler when completion evidence is supplied. That handler performs canonical settlement checks and commits the verified receipt and memory outbox atomically. The managed adapter rereads the persisted record before reporting completion.

The action distinguishes unconfirmed settlement, pending verification, legacy receipts requiring reverification, and verified completion. Every result supplies buyer follow-up prompts. It never submits an order or claims Sibyl synchronization without checking memory delivery. Durable conversation replay avoids repeating completion; raw access and completion signatures are not persisted in the conversation journal.

Scope: governed BUY receipts only. Buyer-local order signing/submission, native plugin SELL receipts, live unattended copy adapters, and owner-authorized live acceptance remain separate work. The provider wallet is never used as a substitute for buyer authority. The existing public owner-authorized recovery endpoints remain available when a managed subscription expires.
## Receipt continuation deployment acceptance

Final release: 99e02fe5a45da6630356a4a7531b591f727b2508, Render deployment dep-dahc9vgcmn7c73e76lp0, verified live 2026-09-10. VPS checkout and instructions synchronized. Final server typecheck passed. The full three-service suite passed 158 tests before the last two narrow safeguards; their targeted tests passed, and all 35 final managed orchestration tests passed on the Linux host.

Hosted acceptance passed for an existing controlled enrolled subscription: MONITORING_ACTIVE, duplicate STATUS replay, wrong-buyer rejection, and three exact active subscription identities. A clearly synthetic unsigned execution reference returned OWNER_AUTHORIZATION_REQUIRED with the exact signing message and follow-up prompts. This unsigned challenge performed no real receipt lookup, signature, order submission, paid research, enrollment change, or buyer message. The probe did persist two controlled conversation operations (STATUS and the synthetic authorization challenge).

Unsigned CHECK_TRADE requests can now return the exact access message directly, so the buyer need not construct it manually. After signing, use a new request ID with the same execution fields plus signature. Request fresh authorization when the five-minute proof expires. A saved request ID returns a snapshot, not a refreshed status.

Remaining: buyer-local submission adapter, native SELL receipt integration, live unattended copy source/execution/reconciliation adapters, and live owner-authorized managed execution acceptance. No production readiness claim for unattended copying is supported by these checks. Demo evidence must retain this distinction.