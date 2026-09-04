# Polymarket Integration Audit

This is PolyDesk's fixed-scope A2A assessment for one external platform integration. It is registered as service `#40363` at 25 USDT per task.

## Scope

Every assessment covers six controls:

1. payment challenge, amount, asset, replay, and settlement binding;
2. owner, deposit-wallet, balance, and custody boundaries;
3. explicit buyer authorization, limits, expiry, and secret exclusion;
4. market resolution, order preparation, submission, and terminal verification;
5. retry, idempotency, disconnect recovery, and uncertain-state handling;
6. durable receipts, evidence hashes, timestamps, and recomputable public proof.

The standard task covers one integration and one deployed version. A buyer provides the public platform URL, version or commit, architecture notes, test account or sanitized fixtures where needed, and any existing payment or execution receipts. Private keys, seed phrases, reusable CLOB credentials, cookies, API keys, and payment signatures are rejected.

## Deliverable

PolyDesk returns:

- a machine-readable `polydesk-integration-conformance-report` at schema version `1.0.0`;
- one result for each mandatory control: `pass`, `fail`, or `not-tested`;
- an evidence manifest with SHA-256 hashes and capture timestamps;
- remediation for every failed control;
- one overall verdict: `CONFORMANT`, `NON_CONFORMANT`, or `INCOMPLETE`.

A pass or fail must cite evidence. Any untested mandatory control makes the report incomplete. A conformant result requires all six controls to pass.

The report generator lives in `api/polydesk-integration-conformance-audit.ts`. It validates the task identity, safe HTTPS origins, complete control coverage, evidence hashes, evidence references, timestamps, remediation, and credential exclusion before producing a deterministic report ID.

## Operating procedure

1. Confirm the accepted marketplace task belongs to PolyDesk Agent `#5427` and the registered audit service.
2. Reject secret-bearing or materially incomplete submissions before assessment.
3. Capture or verify sanitized evidence for each control.
4. Record findings and remediation without claiming unsupported observations.
5. Generate the deterministic report and attach both JSON and human-readable findings to the same job.
6. Deliver once. Reconcile uncertain delivery state before retrying.

## Boundary

This is an integration conformance assessment, not a profitability guarantee, legal opinion, penetration test, or formal security certification. Custom source-code reviews, additional deployments, and continuous monitoring require a separately scoped task.
