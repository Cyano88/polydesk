# Buyer/Sibyl reconciliation - local, not released

The buyer implementation is in the separate `polydesk-buyer-plugin` checkout.
Its pinned Sibyl SDK 0.8.0 synthetic tests passed 30 checks on both Windows and
WSL on 2026-09-07. The buyer also passed 91 Rust library/binary/CLI tests.
Those tests use temporary stores and mocked subprocesses, not live fills.
An isolated WSL runtime now loads the hash-verified SDK without PYTHONPATH.
All 30 SDK tests pass against that installed runtime. Six additional native buyer
pseudo-terminal tests pass, stopping before signing with no real credentials.

## First server contract change

New completion receipts require Polygon mainnet identity, a finalized watermark,
the exact canonical receipt block and transaction membership. Unsupported or
pending finality fails closed before receipt issuance and signal publication.
Finality is not inferred from transaction success or a fixed confirmation count.
Independent-review receipts preserve `policy.researchPolicy=agent-independent-v1`;
they do not invent an AI approval ID or analysis hash.

Legacy stored receipts remain untouched. Read-only lookup preserves HTTP 200
and the original receipt, explicitly marking missing finality/exact-order proof
as LEGACY_REQUIRES_REVERIFICATION with tradeReceiptVerified/signingAuthorized false.
Completion replay and the strict buyer verifier still reject those receipts.
No historical evidence is deleted, silently upgraded, or added to buyer memory.
An explicit re-verification workflow remains separate work if the inventory finds
affected receipts. Receipt reads use no-store to avoid caching assurance changes.

## Remaining integration gates

- Approved research is now implemented locally across free validation, service
  pre-payment validation and the governed handler. Only durable stored decisions
  are accepted; exact market/outcome/token, integrity, expiry, spend, price, price
  drift and maximum shares are checked. Future-dated approvals are blocked.
  Finalized receipts preserve the explicit approved policy and research ID/hash.
  The 88-test server/service/research/finality suite and server typecheck pass.
- Independent-review plans, exact-policy receipts and distinct v2 Sibyl projections
  are implemented and tested locally; provider acceptance is still required.
- Direct buyer live execution now requires local-memory review and shares the
  runner/capture flow lock. The ignored local isolated SDK runtime is installed
  and verified; portable production packaging and operator-controlled memory-root
  configuration remain required. Empty history does not imply zero current exposure.
- Verify production RPC finalized-tag support and legacy receipt compatibility.
- Review installation, Unix development gates and private storage permissions.
- Prove the actual provider-to-buyer-to-memory path under separately authorized
  acceptance. Synthetic tests and unsigned preparation are not that evidence.

No production memory, wallet, payment or deployment changes were made for this
local patch. Existing original-repository and buyer changes are preserved.
