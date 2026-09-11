# Paid research contract

## Choose the entry point

- Marketplace buyer: POST `https://polydesk.trade/api/x402/base/polymarket-smart-trader` using x402. No PolyDesk partner key is required.
- Direct integration needing application-scoped recovery: reserve first with POST `https://polydesk.trade/api/v1/research-jobs`, `Authorization: Bearer <partner-key>`, `Idempotency-Key: <stable-request-key>`, and the ANALYZE body. This reservation is free and does not start research.

Example body (replace placeholders with verified discovery values):
```json
{"action":"ANALYZE","marketId":"<exact-condition-id>","outcome":"<exact-label>","side":"BUY"}
```

Save the original body, idempotency key and returned job ID. On the canonical payment POST send the same body plus the same partner Authorization and `X-PolyDesk-Research-Job: <job-id>` headers. Preserve these headers on paid replay and recovery. Use a client that can forward custom headers; do not assume a CLI supports them. If it cannot, use the public marketplace path and its transaction status URL, without claiming partner-job tracking.

## Review payment before compute

The configured PolyDesk research fee is **0.30 native USDC on Base (chain 8453; 300000 atomic units)**. Inspect the live x402 challenge for the exact token address, recipient, network, amount, scheme and expiry. Stop on mismatches; obtain fresh approval if terms change. Any platform fee must be disclosed separately. A partner key, downloaded skill or fee quote does not pay this fee.

Check spendable USDC against the research amount plus any separately disclosed costs. Check whether the payment client sponsors settlement; if not, check the required gas balance and estimate. Off-chain signatures alone do not consume gas, but settlement, approvals, funding and trading may. Do not promise that the whole flow is gasless. Onchain OS is the recommended wallet/payment client; compatible x402 clients may also pay. The agent uses its own authorized wallet environment, never PolyDesk's provider credentials.

Only verified settlement permits paid research. Public discovery and REVIEW remain free. Base research payment does not fund or authorize a Polymarket trade on Polygon.

## Recover instead of paying twice

Read `GET /api/v1/research-jobs/<job-id>` with the same partner credential. Recreate a lost reservation using the same idempotency key and original body. A changed body returns a conflict. One reservation binds one payment attempt; do not replace its authorization nonce to bypass recovery.

If payment is ambiguous, retain the payment attempt ID and transaction from the client/receipt. POST only `{ "paymentAttemptId": "<original-id>", "transaction": "<original-hash>" }` to `/api/x402/base/polymarket-smart-trader/recover`, preserving partner headers. Recovery checks finalized chain evidence and never makes another payment. If no transaction is known, reconcile with the payment client/operator. Do not guess a hash or repay automatically.

Poll the returned delivery status URL to resume the existing bounded delivery worker if needed; partner GET reads saved status and does not start compute. A disconnect, failed response or `retryPayment: false` is not permission for a new charge. Follow returned recovery instructions.

## Show findings and handle defects

Display `result` as the original JSON, plus AI thesis, counter-thesis, evidence, score explanation and unresolved gaps when present. Read `delivery`, `researchStatus`, `buyerGuidance` and `nextActions`. A degraded result is not successful AI research. Do not infer an AI recommendation from deterministic market checks.

For a specific defect, POST `{ "issue": "<specific missing or incorrect scope item>" }` to `/api/v1/research-jobs/<job-id>/correction` with the partner credential. It durably records the first issue for manual operator review under the existing payment. Replays preserve that issue. No automatic correction ETA, email notification or refund is promised. Keep the job ID for support.

x402 payment is already settled: accepting this research does not release escrow. Research review, a fresh fee-inclusive trade preview and exact buyer execution approval are separate. Never submit an order on research payment authority.

Partner reservation access is scoped, but existing transaction-based delivery URLs remain public bearer-style links. Do not send private wallet keys or confidential research inputs. MCP transport, external subscriptions and a unified v1 trading API are not currently offered.

## Keyless marketplace correction

For a completed Base receipt without a partner job, follow the payment status response's `correctionUrl`. GET returns a published, receipt-linked operator addendum without changing the original JSON. If no correction exists, provide the receipt and specific defect to the PolyDesk operator. Creation and publication require operator authentication; a public transaction hash does not authorize changes. Do not request or expose the operator key to buyers. Corrections carry their own revision hash and authorship, remain under the original payment, and grant no trade authority. Follow the correction's review prompts; do not represent an operator addendum as a new ZeroScout AI report.

## Indexing acknowledgement

After a successful Base payment, retain `X-PolyDesk-Payment-Attempt-Id` and `X-PolyDesk-Indexing-Status` when your client exposes response headers. PolyDesk stores the sanitized indexing acknowledgement with the settlement. `success` means the facilitator reported cataloging success; `processing` is pending; `rejected` requires diagnosis; `unknown` means no usable acknowledgement was captured. These statuses do not prove featured placement or visible search results. Missing metadata never authorizes repayment. Request operator inspection of the existing attempt if needed.
