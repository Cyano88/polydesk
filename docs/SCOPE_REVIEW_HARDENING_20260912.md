# PolyDesk scope and review hardening — 2026-09-12

PolyDesk helps agents move from market discovery to paid evidence, explicit research review, and separately approved trading with receipts. Its reusable skill teaches this flow; the HTTP API performs supported backend operations. MCP transport is not implemented.

## Service structure

| Offering | Buyer gets | Boundary |
| --- | --- | --- |
| One-Off Polymarket Trade | A bounded research and trade workflow | Research acceptance does not authorize execution |
| Managed Polymarket Agent | Configured monitoring, summaries and authorized context | Setup is required; copy trading requires buyer authorization |
| Polymarket Integration Audit | Findings about wallet, payment, execution and recovery controls | Findings identify evidence gaps; an audit is not blanket production certification |
| Polymarket LP Scout | Specialist liquidity research | Separate live route and fee contract |
| Football Live Data | Specialist football facts | Optional enrichment; not required for free market discovery |

The first three remain the core A2A products. Catalog availability, marketplace approval and successful paid delivery are separate facts. Base USDC research and OKX marketplace services retain their own prices and settlement contracts. No listing IDs, prices or avatar were changed in this release.

## Implemented

- Shared smart-trader research screens duplicate, stale, undated, future-dated and visibly contaminated source excerpts. Excluded/context-only sources remain visible in the delivery audit trail. Seven-day recency is a conservative screening rule, not factual verification.
- Wallet, spending limits and execution details are excluded from directional AI input. Execution gates still enforce the buyer's limits independently.
- Matching Binance BTC/USDT markets can receive a validated last-closed-minute snapshot, including source, timestamps and raw candle. This is never represented as full resolution history. Unsupported markets receive no invented underlying data.
- Public receipt acceptance requires operator authentication; partner acceptance requires the owning tenant/application and exact request/payment binding. Both require the exact analysis and correction hashes plus explicit limitation acknowledgement.
- Durable acceptance is separate from the immutable report. Retries are idempotent; later corrections require renewed review and preserve earlier acceptance events.
- Follow-up choices remain available after acceptance: show evidence, check a fresh preview, decline, or review a new research fee. No acceptance path signs, trades, refunds or releases escrow.
- Public copy, skill, API discovery and platform guide use the same service boundaries.

## Verification and limits

73 focused automated tests passed across smart-trader, correction, acceptance, source quality, partner research, public API and delivery status suites. Server TypeScript passed. Production build status and live deployment evidence are recorded separately.

The new research checks were tested with deterministic provider fixtures. No additional paid research or trade was executed. Existing paid reports are not rewritten by this release. The standalone LP Scout and Football Live Data engines have not received a fresh end-to-end paid audit in this change. Partner correction publication still requires operator reconciliation against the original receipt; it is not automatic remediation.

The user reported submitting the Coinbase indexing support request. A case number and marketplace indexing resolution remain unverified. Marketplace discovery is not a prerequisite for directly using the documented endpoint.

## Next verification

Use the existing receipt to verify durable acceptance without paying again. For future research, compare source assessments and the AI explanation before buyer review. Run a newly quoted paid test only with explicit fee approval. Do not claim calibrated probabilities, marketplace approval or fully unattended copy execution from these tests.
