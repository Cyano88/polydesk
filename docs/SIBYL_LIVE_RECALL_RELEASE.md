# Sibyl-backed recall integration - September 8, 2026

The new POST /api/polymarket-agent-memory/recall-sibyl route reads existing
owner-scoped entities through pinned Sibyl SDK 0.8.0 in a fresh subprocess.
Postgres determines the authoritative receipt inventory and hashes. Returned
receipt content comes from Sibyl and must exactly match that inventory.

The existing /recall PostgreSQL history route remains unchanged. Its signatures
cannot authorize the new route. The new personal-sign message is exactly:

    PolyDesk Sibyl memory read v1
    https://polydesk.trade
    POST /api/polymarket-agent-memory/recall-sibyl
    <lowercase owner>
    <expiresAt UTC milliseconds>
    <after execution ID, or empty line>
    <limit>

The same five-minute maximum expiry and 1-100 page bound apply. Responses are
no-store, schema polydesk-sibyl-memory-recall-v1, source SIBYL_VERIFIED_RECEIPTS,
with per-record memoryStatus RECALLED_VERIFIED. Missing or unsynchronized
projections, mismatched content, runtime failures and busy locks return 503
MEMORY_UNAVAILABLE. No fallback to PostgreSQL-only success or implicit recapture
occurs. Two concurrent recall subprocesses are allowed per web process.

Coverage remains OUTBOX_SINCE_ENABLEMENT and historyComplete=false. An empty
authoritative page still checks the configured SDK/root but creates no owner
store. It is not proof of zero positions or trading permission. Pagination is
not a snapshot of the entire portfolio; fresh account checks remain required.

The local buyer now requires this route and RECALLED_VERIFIED records. A prior
matching token fill returns MEMORY_RECONCILIATION_REQUIRED before order signing.
It rejects legacy SYNCHRONIZED/PENDING flags. Existing local history review,
execution consent, account checks and trade authorization stay separate.

Startup now tests a separate synthetic canary with fresh read-only recall after
idempotent capture. The canary does not enter the production receipt inventory.
The live HTTP canary uses a newly generated disposable identity and checks only
authenticated empty history; it cannot prove a real fill-to-memory cycle.

Local validation: 25 combined Node governed-trade/memory tests; server typecheck;
9 real SDK tests on isolated temporary stores; 6 Rust remote-memory tests.
Deletion testing only renames a temporary test database, never production data.

This server release does not establish buyer-host activation. The separate
buyer checkout contains pre-existing uncommitted work; no upstream plugin-store
push is part of this release. Production buyer installation, authoritative
journal/history adoption and an explicitly authorized real fill/reconciliation
acceptance remain required before claiming end-to-end production readiness.
