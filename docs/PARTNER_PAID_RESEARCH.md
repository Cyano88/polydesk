# Partner paid research

The reusable public skill is free. Paid compute remains behind the existing Base x402 route (0.30 native USDC); partner credentials do not bypass settlement. The public marketplace path remains keyless. See [the public contract](../public/skills/polydesk/references/paid-research.md).

Implemented: application-scoped durable reservation, immutable normalized research binding, one authorization attempt per job, verified transaction/payer binding, saved original delivery JSON, degraded-result guidance, and a durable first correction request. The public OpenAPI lists reservation, status and correction operations.

Ordering: reserve -> validate exact input/partner -> verify x402 proof -> durably bind attempt -> durably claim attempt -> settle -> persist settlement -> bind transaction to reservation -> invoke the existing paid delivery worker. Every ambiguous settlement/write failure returns no-repay recovery instructions. Finalized-chain recovery repeats the binding idempotently before restoring the paid delivery record.

Correction requests are stored in the reservation, not an automated refund system. Operators inspect the authenticated job status by the support job ID, review the defect, and use existing authorized paid-delivery remediation where appropriate. There is no notification daemon or correction SLA in this release. Research acceptance is not escrow release on x402. Existing transaction-based result URLs remain public; this does not retrofit private research delivery.

Before a Base marketplace test: validate a live unpaid reservation, idempotent replay, changed-body conflict, cross-application isolation and missing-auth rejection; inspect the live payment offer. A real paid test needs separately authorized 0.30 USDC payment, receipt verification, available AI findings, original JSON and follow-up review. Do not report marketplace indexing or live paid recovery proven from unpaid checks.
