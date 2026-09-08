# Postgres authority and Sibyl receipt projection

Postgres outbox and authenticated recall deployed in fd05459 on September 8.
Persistent runtime activation was confirmed on Render at 2026-09-08 13:23:45 UTC:
PERSISTENT_CAPTURE_READBACK_VERIFIED, workerEnabled=true. This used a separate
synthetic canary, not a live trade. Subsequent restarts must show the same result
with priorCanaryPresent=true to confirm retention across instance replacement.

## Contract

Successful governed completion now commits its execution record, receipt index
and one polydesk_receipt_memory_outbox row in one PostgreSQL transaction. The
wallet owner comes from the stored verified mandate authority, never a memory
request. The outbox has a unique execution ID, immutable owner/payload binding,
leased claims and an eight-attempt retry ceiling. An outage never erases the
authoritative receipt or starts another trade. Existing signal publishing is
still a separate post-commit operation; replay remains idempotent.

The memory-only worker uses pinned SDK 0.8.0, a hash-pinned Python adapter and
private owner-scoped SQLite projections. It passes only allowlisted receipt data,
not private keys, CLOB credentials or wallet commands. SDK tier limits remain in
force. Capture is idempotent; changed payloads for the same owner/execution fail.
A fresh SDK connection must read back the exact record before acknowledgement.
The projection can be rebuilt from Postgres; it is not a second source of truth.
The new projection category is polydesk_verified_receipt_v1, distinct from the
older local-buyer journal/memory. Existing local buyer guards are not silently
rewired or disabled by this server change.

## Authenticated recall

POST /api/polymarket-agent-memory/recall accepts owner (lowercase EVM address),
expiresAt (integer UTC milliseconds, no more than five minutes ahead), after
(empty or execution ID), limit (1-100; default 20), and a 65-byte personal-sign
signature. Sign this exact newline-separated UTF-8 message, without a trailing
newline; use an empty line for the initial cursor:

    PolyDesk receipt memory read v1
    https://polydesk.trade
    POST /api/polymarket-agent-memory/recall
    <owner>
    <expiresAt>
    <after>
    <limit>

Authentication binds scope and pagination before any database read. Read proofs
are replayable within that bounded interval; they never authorize writes/trades.
The query is owner-scoped and replies no-store. Database failures return 503
MEMORY_UNAVAILABLE, never an empty-history success. The API explicitly returns
POSTGRES_VERIFIED_RECEIPTS, with per-record PENDING, SYNCHRONIZED or
OPERATOR_REVIEW_REQUIRED status. SYNCHRONIZED records a successful prior Sibyl
capture/readback, not a live SDK availability check. This endpoint does not claim
semantic Sibyl search or a complete portfolio. Coverage is OUTBOX_SINCE_ENABLEMENT
and historyComplete remains false; older receipts require reviewed reindexing.

## Runtime rollout

Keep the worker disabled until the production runtime and disk have been audited.
Use the existing DATABASE_URL; never expose it to requesting agents. PostgreSQL
schema creation is idempotent, but apply/test it with the real service database
permissions before activation. The existing render-durable-store TLS settings
remain unchanged and currently disable certificate verification for remote
connections; production TLS trust must be reviewed rather than claimed verified.

Configure SIBYL_MEMORY_PYTHON to an absolute isolated Python interpreter with
the verified sibyl-memory-client 0.8.0 wheel installed. Its pinned wheel SHA256:
391c3a3a27d7101bba8441083949c77717e660edde6a3c08ded14f3f81da149f.
Set SIBYL_MEMORY_BRIDGE to the absolute scripts/sibyl-receipt-memory.py path and
SIBYL_MEMORY_BRIDGE_SHA256 to its independently reviewed deployed-byte digest.
The September 8 rollout audit found no attached disk on the live web service.
The operator approved a 1 GB disk; polydesk-sibyl-memory was created at /var/sibyl.
Create a private service-owned SIBYL_MEMORY_ROOT on an approved persistent disk;
this is derived memory, not wallet or journal storage. Do not reuse an unreviewed
directory or rely on the ephemeral source checkout. Enable
SIBYL_MEMORY_WORKER_ENABLED=true only after a synthetic capture/readback check.
No runtime installer, credentials, signature prompt or trading process runs from
an agent recall request. Missing configuration leaves jobs pending.

The build installs the hash-pinned wheel in .sibyl-runtime and runs SDK tests.
The Render start command is scripts/start-with-receipt-memory.ts. With worker
activation requested it verifies the actual /var/sibyl mount, uses private
receipt-memory and separate receipt-memory-canary directories, and performs two
capture/readback subprocess runs before enabling delivery. Failed startup checks
leave the web service running with the memory worker disabled. Canary data never
enters the receipt outbox or the production owner projections. A later restart
must repeat the check against the same persistent canary to verify retention.

Operator-only commands (no wallet operation):

- `node --import tsx scripts/receipt-memory-admin.ts enqueue <executionId> --execute`
  indexes an existing stored fully verified receipt; rejects unsupported legacy proof.
- `... retry <executionId> --execute` requeues only an exhausted failed job.
- `... rebuild <executionId> --execute` requeues a failed or delivered projection
  after an operator-reviewed restore/rebuild. It cannot steal an active lease.

Alerts are currently structured worker logs and API status. External email/webhook
delivery is not implemented. Monitor pending/failed counts and oldest pending age;
do not equate a healthy web process with healthy memory synchronization.

## Verified acceptance

23 Node tests (16 existing governed-trade + 7 new memory tests) and server
typecheck passed. Five real SDK tests passed. A new dedicated loopback-only
Postgres test cluster verified rollback, 16 concurrent completions, 8 competing
workers, payload conflict rejection, failed/expired lease recovery and fresh-
process persistence. The --local-sibyl acceptance also delivered synthetic
Postgres jobs into the real SDK through WSL and verified digest-bound readback
and replay. The test relay is not the production process launcher.
Operator CLI acceptance also passed: enqueue preserves completed delivery,
ordinary retry rejects a delivered job, and explicit rebuild replays only the
same memory projection. Adapter source SHA256 at this checkpoint:
e8a5e95999b4a1f4cd7b3f8ad6982fabc2cc8fb26fa7202cd2bf4c2acc29d2c0.

Render mounts its volume root with mode 2775. The adapter allows group write only
for the exact /var/sibyl mount, owned by root with the current service group,
without world write, and confirmed in /proc/self/mountinfo. All per-owner
directories still require service ownership and mode 0700. Security regression
tests reject another path/group, world write, and an unmounted directory.

The older dedicated local test cluster reported a corrupt control file and was
not repaired or overwritten. The production schema and runtime are deployed;
historical receipts were not reindexed and no trades were executed by this rollout.
The buyer's signed remote-memory integration remains separate work: do not claim
the existing local-buyer signing gates now use this new server projection.
