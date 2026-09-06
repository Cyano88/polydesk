# Base payment recovery release

Scope: durable pre-settlement Base authorization claims, exact service-payment identity binding, conservative failed-settlement responses, and finalized-chain recovery of the original paid ANALYZE request. No wallet, signing or trade execution change is included.

POST `/api/x402/base/polymarket-smart-trader/recover` accepts only `paymentAttemptId` and `transaction`. Recovery requires existing durable storage and an explicitly configured trusted HTTPS `BASE_PAYMENT_RECOVERY_RPC_URL`. It never selects a public fallback, accepts caller-supplied RPC/receipts, or makes another payment. Missing configuration fails closed. Configuration activation and a separately authorized facilitator payment remain distinct from deploying this code.

The verifier requires Base mainnet, native USDC, the original authorization nonce/payer/seller/exact fee, and finalized canonical receipt evidence. Additional USDC logs and unsupported batch attribution stop. The existing bounded paid-delivery workflow handles restored requests. Recovery itself never grants a trading approval.

Excluded: Polygon finalized-receipt policy, legacy receipt rejection/migration, governed ZeroScout research-binding changes, preparation-handoff changes, the separate buyer/Sibyl worktree, and unrelated perps/UI/ops work. These remain local pending separate review. Existing Polygon and preparation behavior is intentionally unchanged in this release.

Prior evidence includes synthetic route tests, real local PostgreSQL concurrency/rollback/reopen acceptance and read-only Base RPC compatibility. Those checks are not proof of an actual service payment. Release-specific build and regression checks must pass before pushing.

Release-tree verification (2026-09-06): clean lockfile install, production build and server typecheck passed. 138 tests passed across Base recovery/lifecycle/configuration, Smart Trader, standard services and the unchanged governed Polygon suite. Excluded Polygon runtime/test files and dependency manifests match the baseline. No payment or trade was performed.

Rollback baseline: `25b86f68fb9f616d4fabbda4eacdc86be859f4eb`. Rolling back removes application-level Base attempt protection, so any rollback involving unsettled attempts requires payment intake coordination; do not delete or reset attempt records.
