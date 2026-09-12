# Receipt-preserving recovery for Base and X Layer

Implemented locally on 2026-09-12. No live recovery, inference, payment, refund, acceptance or trade was executed. This change has not been deployed.

## Contract

The operator-authenticated recovery route remains `POST /api/a2mcp/polymarket-smart-trader/payment/:transaction/recover-research`, accepting only `{"action":"RECOVER_RESEARCH"}`. It reuses the persisted receipt, payer, exact request hash and original settlement time. No caller-supplied replacement market or payment is accepted.

Supported original lanes:

| Network | Provider | Fixed original amount | Original service route |
|---|---|---|---|
| Base | CDP x402 | 300000 atomic units | `/api/x402/base/polymarket-smart-trader` |
| X Layer | OKX Agent Payments Protocol | 300000 atomic units | `/api/a2mcp/polymarket-smart-trader` |

A provider failure explicitly recorded in a legacy report can qualify even when the newer researchStatus field is absent. Proof references alone do not establish successful model inference. Legacy failures remain excluded from automatic missing-proof and engine-upgrade recovery. Successful reports and exhausted recovery budgets remain ineligible.

Known expired market scope returns `RECOVERY_SCOPE_REVIEW_REQUIRED` before provider readiness or compute. This does not authorize substituting a different market. A future operator preview must review current scope and provider readiness; these local tests do not establish live provider availability.

## Preservation and concurrency

Before compute, the atomic paid-record claim appends a full snapshot of the existing delivery into `deliveryVersions`, without nested histories or duplicate results. The active receipt then points to the latest result. Original payment, request and settlement bindings remain unchanged. Versions are immutable through the service API; this is application-level preservation in the existing durable store, not external write-once storage.

Each compute attempt is reserved durably before it starts, including attempts that throw. A claim token prevents a superseded worker from overwriting a newer claim. A provider exception preserves the prior report and consumes its attempt; a further eligible degraded-research attempt requires an explicit recovery action. Existing stale-running job resumption remains available after an operator has actually started work.

Corrections use separate keys for recovered result versions. Existing correction keys, first-round revision hashes and previous rounds are retained. A pending correction to an old report does not silently become a correction to the new report. Each available recovered result requires its own explicit acceptance; research acceptance never authorizes a trade.

## Buyer review and historical reads

- Current receipt status includes archived JSON results, analysis hashes and historical result/correction links.
- `GET .../payment/:transaction?analysisHash=<hash>` reads only that report version and cannot trigger recovery.
- `GET .../payment/:transaction/correction?analysisHash=<hash>` reads the corresponding correction history, including while recovery is running.
- Historical correction queries cannot be used for POST mutations.
- Buyer sequence: show recovered findings, compare original JSON and corrections, review remaining gaps, explicitly accept the current available report or describe a specific defect. Any trading decision follows separately.

## Verification

Isolated in-memory stores and synthetic provider results cover both lanes, identical receipt/request reuse, preservation before compute and after provider exceptions, bounded attempts, concurrent claims, restart reads, multiple recovery versions, old correction access, fresh acceptance, invalid lane/request rejection, expired scope and read-only historical correction URLs. Existing payment-proof, research, monitor, partner and acceptance regression tests are included.

No production receipt was mutated or used as a compute fixture. No deployment is included in this implementation step.

Next prompt: "Review the recovery previews for the three provider failures, without running them."
