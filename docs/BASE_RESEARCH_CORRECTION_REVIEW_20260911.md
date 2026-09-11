# Review of paid Base research delivery

Payment: 0x6aae292456541a754d9b20b1e0347afbe0aef5422e94ac7f0ac410d6dbf3b0ae
Amount: 0.30 USDC on Base. Decision: pstd_f56dd88ee77b030ceedc86752ce3a7dd.
Original analysis hash: adc09c94e848ef7b870b201684a3b95554cafad030d95997de614688e7473573.
Review only: no new payment, rerun, refund, acceptance or trade executed. This document is a local correction brief, not an externally submitted request.

## Findings requiring correction

1. Freshness: all seven dated external articles are dated between December 30, 2025 and May 29, 2026, while the research was retrieved September 11, 2026. Retrieval timestamps do not make their claims current. Correct by sourcing current, timestamped primary evidence; label older material as background and stop using it to characterize today's market regime without corroboration.
2. Price provenance: the approximately $69,111.38 reference is scraped Binance page text, without a verified exchange timestamp or candle series. The resulting roughly 30 percent move-to-target inference is conditional on an unverified price. Replace with timestamped exchange data for the exact resolution pair, or explicitly leave price distance unverified and remove numerical inferences built on it. Verify the market creation window and any relevant prior threshold hit if asserting that the threshold remains unmet.
3. Source quality and independence: the Yahoo and 24/7 Wall St. March 18 items repeat the same ChatGPT forecast story. Several extracts contain navigation, cookie text or error-page boilerplate. Deduplicate syndicated sources and use substantive passages attributable to primary evidence; do not count eight returned records as eight independent useful sources.
4. Scope separation: missing maximum-price-drift measurement belongs to fresh execution checks, not a reason to demand buyer trading limits for this research-only purchase. Separate research-evidence gaps from execution readiness. Optional unconfigured smart-money data was correctly disclosed and is not independently a delivery defect.

## What was delivered correctly

Exact market/outcome and Binance intraperiod one-minute High resolution rule; live CLOB snapshot with $0.46/$0.47 bid/ask at collection; thesis and counter-thesis; explicit data gaps; original JSON and ZeroScout storage proof. ESCALATE is a legitimate result, not itself a defect. A correction may still return ESCALATE.

The screening score is transparent: spread 18.33 + liquidity 20 + smart money 0 + market activity 0.48 + near-touch depth 15 + resolution buffer 10 = 63.81. This is a deterministic market screening score, not a win probability. The AI confidence field is separately 55; it is not a calibrated outcome probability. The empty reasoningSummary field does not mean there is no explanation: summary, thesis and counterThesis contain reasoning.

## Correction acceptance criteria

Preserve the original market, Yes outcome, BUY analysis perspective, payment and immutable original JSON/hash. Publish a separately identified addendum or revision linked to this receipt; identify replaced claims and source observation times. Recompute claims from verified current inputs, or explicitly mark them unavailable. Provide a deduplicated evidence list and distinguish provider timestamps from retrieval times. No second buyer payment for rectifying this scope; no automatic refund or trade authorization. A recommendation change is not required.

## Correction-path gap

This test used the public keyless marketplace route, not a partner research reservation. POST /api/v1/research-jobs/{id}/correction requires a scoped partner job. The existing paid-delivery recovery code excludes ordinary completed AVAILABLE reports from degraded-research recovery; do not relabel this report UNAVAILABLE or manufacture an engine-version change to force a rerun.

Next implementation needed: a receipt-linked operator correction path that verifies the original paid record, preserves original evidence, records the specific defect, prevents duplicate remediation and emits a revision under the original payment. Buyer-facing public correction requests need ownership/authentication, not possession of a public transaction hash alone. Until that path exists, this brief is ready for operator handling but has not been queued by the public API.
