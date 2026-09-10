# Base and Sibyl audit checkpoint

September 10, 2026. Local change; not deployed.

## Live read-only observations

- Public /api/health returned 200 and ok:true.
- Unsigned POST /api/x402/base/polymarket-smart-trader returned 402 with a payment challenge. This proves availability of the offer, not settlement.
- Empty POST to the recovery route returned 400 and required the original attempt ID and transaction. No recovery mutation was requested.
- Unsigned Sibyl recall returned 401. Successful authenticated recall was not exercised.
- Provider host checkout is 62eb5f6 and official Onchain OS is 4.5.3. This does not identify the Render web deployment commit.
- Windows preflight attempted an update, timed out and retained 4.5.2. No payment used that CLI.

## Recovered payment history

The September 5 session's later summaries describe corrected replay metadata, a proposed 0.30 USDC paid canary and then Base remaining paused. BASE_REPLAY_CLIENT_AUDIT.md documents omitted business parameters in earlier HTTP replay. No successful settlement proof was recovered in this bounded review. This is not proof that funds never moved. Historical attempt IDs, authorization nonces and chain evidence still need reconciliation before another payment; do not retry old payment IDs.

## Local repair

The shared async acknowledgement and paid-status response now expose buyerGuidance. Processing offers a status check. Available original results offer findings, evidence and JSON review. Failed/degraded delivery offers issue review. Only completed unexpired APPROVE results offer a trade preview; execution authority is always false. Guidance explicitly distinguishes already-settled service payment from escrow release and trading approval. It lives outside the immutable result object.

The existing result field already exposes stored original analysis; no new JSON exporter was needed for this polling contract. Follow-up strings are conversation suggestions, not newly implemented execution, dispute or refund endpoints. The successful cached direct-response path remains unchanged; consumers can use the existing payment-status route for guidance.

Verification: 22 tests passed across paid-delivery-guidance, smart-trader-delivery-status and base-payment-lifecycle; server typecheck passed; git diff --check passed. Prior preparation separately passed 71 Base tests. No new payments, trades, deployments or submissions.

## Buyer memory boundary

The separate polydesk-buyer-plugin source has authenticated recall-sibyl integration and MEMORY_RECONCILIATION_REQUIRED behavior. Numerous pre-existing modified/untracked files remain there, including memory code. This inspection does not establish the installed buyer binary includes them. Preserve that work; audit/build the exact buyer release before production claims.

## Next concrete gates

1. Reconcile historical Base attempts from durable records and canonical chain evidence without repayment.
2. Verify the deployed buyer version and perform fresh-session memory acceptance with eligible existing receipts or isolated labelled test data.
3. Deploy reviewed guidance changes when proceeding with release; verify live response behavior.
4. Obtain fresh exact terms and payment authorization for a new Base canary only after reconciliation. Separate trade authorization remains mandatory.


## Superseding reconciliation result - 2026-09-10T19:22:58.155Z

Direct production database inspection used a TLS-verified external connection matched to the web service's configured internal database, with BEGIN READ ONLY and ROLLBACK. All Base attempt records were inspected: one record, settled; zero attempted/unresolved records. Ten Base paid-analysis records were present.

The current attempt e997a0873002f758525415064e5cba7f9c2d4b8fa2206f3d7adb9ce2a011a25c passed verifyBasePaymentRecovery against the configured trusted Base RPC: exact native USDC fee 300000 atomic units, original payer/seller and authorization nonce, successful canonical transaction, matching logs and finalized block. Transaction: 0x3171e54ff003b82a5948c8ef12bb05f5d2c3ea0eba7c34a432fa6b27a5c92cc9. Its stored delivery is completed, request hash matches, result action is ANALYZE and researchStatus is AVAILABLE. This is recovered historical proof, not a payment made today or proof of the newly edited buyer prompts.

Nine other historical delivery references have successful chain receipts but no corresponding newer attempt binding. They remain legacy evidence: receipt success alone was not promoted to strict exact-payment verification. No historical records were migrated, repaired or deleted. Empty/unresolved attempt count does not account for failures before durable claims existed, or independently identify all old client quote IDs.

This supersedes the earlier session-only statement that no successful Base settlement proof had been recovered. No new paid canary is needed merely to prove that Base payment and research delivery previously worked. The remaining priority is fresh-session Sibyl decision-change acceptance and deployment of the reviewed buyer guidance. Any optional new research payment still requires fresh authorization.

Machine-readable proof: BASE_PAYMENT_RECONCILIATION_20260910.json. No signatures, private keys, connection strings or raw payment authorization payloads are included.


## Existing-trade eligibility audit - September 10, 2026

Direct read-only production inspection found zero polymarket-governed-execution and zero polymarket-governed-receipt records. No existing receipt can be enqueued with receipt-memory-admin under the current contract. The historical buy and sell documented in OKX_A2A_DEMO_BUYER_QA.md used the local plugin; those notes explicitly do not prove consumption of the governed signed-payload handoff. They also predate the newer public-order recovery binding. A successful settlement is not the missing owner-authority and exact signed-order proof.

No receipt was invented, upgraded or enqueued, and no new trade was placed. The real remaining integration gap is between the supported local executor and the server's governed memory receipt contract. A future adapter must preserve honest provenance and authenticate the buyer; it must not set missing proof flags to true. Alternatively, a fresh separately authorized governed execution can produce an eligible receipt. Current synthetic fresh-process proof remains correctly labelled.

Evidence: SIBYL_EXISTING_RECEIPT_ELIGIBILITY_20260910.json. The observed absence is scoped to this production database and these record prefixes; it does not claim there were no historical trades.


## Buyer guidance release verified

Commit 27a29740d632d36555bf13242c0f81bfcf907611 deployed live as dep-dahgdb2jnfac738o2ur0. Existing paid Base analysis returned HTTP 200 with completed delivery, AVAILABLE research, original result JSON and buyerGuidance. Prompts include results, evidence, original JSON, research review and another-market analysis. Trading authority remains false and repayment is disabled. Verified at 2026-09-10T19:38:40Z; evidence: BASE_BUYER_GUIDANCE_LIVE_20260910.json. Production build and 57 shared research tests passed. This supersedes the earlier local-only prompt status; production execution-to-memory acceptance remains open.
