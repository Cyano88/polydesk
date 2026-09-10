# Three A2A service alignment — 2026-09-10

Scope: One-Off Polymarket Trade, Managed Polymarket Agent, and Polymarket Integration Audit only. The six retired A2MCP listings are excluded from the listing update. Existing implementation endpoints are not new marketplace products.

## Managed Polymarket Agent

Subscription enrollment, preference changes, lifecycle changes, and status responses now expose a versioned continuation contract. It reuses the existing owner-signed receipt-memory descriptor and independent BUY preparation contract, and exposes the existing FOK SELL preflight route. Owner proof is still required for private receipt recall. The watched address and subscription identity never substitute for the trading owner.

Paused, expired, cancelled, or invalid-period subscriptions do not advertise an active trade handoff. Unverified notification email prompts verification first. Status responses also check that the requested buyer matches the persisted subscription buyer.

These are preparation and recall handoffs. This change does not implement an unattended copy executor or automatically inject private memory into AI research. Sibyl currently stores verified execution receipts, not arbitrary research or audit reports. Reusing it means preserving owner authorization, partial-history disclosure, Postgres integrity, and outbox recovery; do not write research into fill memory.

The shared BUY route performs fee-inclusive preparation and verified wallet/order-book checks. SELL uses the shared inventory, approvals, price/depth and fee preflight. Execution still needs explicit authorization. Local plugin execution must use the guarded launcher and stable execution identity; its protection is not a distributed exactly-once guarantee.

## Polymarket Integration Audit

Report schema 1.1.0 retains the six broad controls and adds eight explicit alignment assessments:
research review, fee-inclusive readiness, bounded trade, fresh execution, uncertain recovery, settlement receipts, Sibyl owner isolation, and buyer continuation.

Each check requires its own status, summary and evidence references. A failure requires remediation. A not-applicable assessment requires a stated scope reason and evidence. Missing checks become not-tested and make the report INCOMPLETE even if all six broad controls pass. Check results participate in the report hash.

Old input without checks remains parseable, but cannot claim full conformance to the new coverage. Consumers must accept schema 1.1.0. Report compilation validates declarations and references; it does not independently verify attached file hashes or conduct live tests. The operator must collect and verify evidence before declaring a pass or a scope exclusion.

The CLI includes follow-up prompts to read findings, request corrections, and verify JSON delivery before acceptance. Audit acceptance never authorizes a trade.

## Remaining release evidence

- Deploy and verify the changed managed responses and audit compiler on the provider host and hosted server.
- Exercise owner-authorized recall through the managed buyer workflow; a unit-tested descriptor does not prove a completed buyer recall.
- An unattended copy executor is not implemented by this alignment. Keep its availability explicit.
- Complete an authorized real integration-audit delivery, buyer review and settlement before claiming that service proven end to end.
- Resolve the discrepancy between retired listing intent and the older services returned by the marketplace directory. Do not restore retired services.
- Review the three-A2A listing draft and the managed guide through the supported marketplace editing flow.
- The scheduled monitor is present, but its log showed a subscription-title binding failure. Live status verification confirmed matching job, buyer and provider with a localized legacy DACS subscription title. A narrow parser compatibility fix now recognizes that exact prefix while preserving the remaining identity checks. Deployment and the next successful scheduled cycle still need verification.

No marketplace listing, payment, trade, email, or subscription change was performed by this local alignment work. Demo preparation remains postponed.

Validation before the additional localized-title fix: 124/124 three-service tests passed; server TypeScript check passed. Local changes only at this checkpoint.

Final validation: 125/125 three-service tests passed. The patched subscription-directory parser was exercised in isolation against live official OKX responses and matched three active managed subscriptions. This read-only check did not run reconciliation or send notifications. Server TypeScript validation passed before the final narrow title-matching change. Deployment remains pending.
