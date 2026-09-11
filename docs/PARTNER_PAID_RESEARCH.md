# Partner paid research

The reusable public skill is free. Paid compute remains behind the existing Base x402 route (0.30 native USDC); partner credentials do not bypass settlement. The public marketplace path remains keyless. See [the public contract](../public/skills/polydesk/references/paid-research.md).

Implemented: application-scoped durable reservation, immutable normalized research binding, one authorization attempt per job, verified transaction/payer binding, saved original delivery JSON, degraded-result guidance, and a durable first correction request. The public OpenAPI lists reservation, status and correction operations.

Ordering: reserve -> validate exact input/partner -> verify x402 proof -> durably bind attempt -> durably claim attempt -> settle -> persist settlement -> bind transaction to reservation -> invoke the existing paid delivery worker. Every ambiguous settlement/write failure returns no-repay recovery instructions. Finalized-chain recovery repeats the binding idempotently before restoring the paid delivery record.

Correction requests are stored in the reservation, not an automated refund system. Operators inspect the authenticated job status by the support job ID, review the defect, and use existing authorized paid-delivery remediation where appropriate. There is no notification daemon or correction SLA in this release. Research acceptance is not escrow release on x402. Existing transaction-based result URLs remain public; this does not retrofit private research delivery.

Before a Base marketplace test: validate a live unpaid reservation, idempotent replay, changed-body conflict, cross-application isolation and missing-auth rejection; inspect the live payment offer. A real paid test needs separately authorized 0.30 USDC payment, receipt verification, available AI findings, original JSON and follow-up review. Do not report marketplace indexing or live paid recovery proven from unpaid checks.

## Verification, 11 September 2026

Focused suite: 88 tests passing across Base settlement/recovery, partner authentication/jobs/research, and public API. Server type check and production build passed. Live unpaid proof: [JSON](PARTNER_RESEARCH_UNPAID_LIVE_20260911.json). Reservation/read/replay returned 200; changed input and unpaid correction 409; cross-application access 404; missing authentication 401; mismatched payment request 409 before settlement. Synthetic market identifier, no payment proof, no compute and no order. A bound transaction without its delivery record explicitly requires recovery.

The remaining Base marketplace test is a separately approved real payment and available AI delivery, followed by receipt/result verification and marketplace discovery checks. These unpaid probes do not prove those stages.
