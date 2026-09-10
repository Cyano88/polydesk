# Base extension and Sibyl submission preparation

Prepared September 10, 2026. Scope: reuse PolyDesk's existing service engines, buyer approval gates and receipt flows through Base discovery/payment adapters. This is a preparation checkpoint, not a claim of live Base settlement or submission readiness.

## Recovered owner decisions

The September 3 session (01a06647-b48f-7210-a8d2-b92bcebe0cc7) selected extending Polymarket utility to Base's agentic marketplace using Sibyl. The September 5 session (01a072a8-a33c-76a1-9f7a-6e32681dfb95) explicitly retained OKX services, Onchain OS signing and Sibyl memory. The requested outcome was a working flow, not UI polish.

Retain the current five-service menu: one-off trade assistance, managed agent, integration audit, football data and LP Scout. Preserve the original avatar. A subscription or watched wallet never authorizes copy trading; each exact trade needs buyer-agent approval within buyer-granted authority.

## Current evidence

| Component | Verified in this preparation | Remaining proof |
| --- | --- | --- |
| Base analysis adapter | Mounted in server.ts; x402 Base USDC 0.30 configuration, Bazaar metadata, shared Smart Trader engine | Current live configuration, successful approved payment, original result and durable receipt |
| Base payment recovery | Durable attempt identity, original-request recovery, no automatic second payment; focused tests pass | Reconcile historical failed attempts before any new paid canary; verify live trusted RPC readiness |
| Sibyl integration | Authenticated recall route and owner-scoped Postgres outbox/projection implementation; September 8 release documentation records synthetic runtime checks | Fresh-process recall of relevant verified receipt changing a real buyer decision; deployed buyer version and memory activation |
| Existing OKX flows | Guide repair and five-service review submission documented separately | Listing approval is separate from Base discovery; do not infer either from the other |

Validation run this turn: 71/71 tests passed across base-agentic-market-smart-trader.test.ts, base-payment-lifecycle.test.ts and base-payment-recovery.test.ts. These use controlled dependencies and do not prove a live payment. No payment, signature, trade, deployment or marketplace submission was performed in this preparation.

Older BASE_AGENTIC_MARKET.md says Sibyl is a later phase and transport is local only. Later release documents supersede parts of that historical status; current runtime readiness still needs independent verification. Buyer integration lives in a separate polydesk-buyer-plugin checkout and must be audited there before claiming activation.

## Architecture and service mapping

Base is the service-payment/discovery lane. Polygon remains Polymarket execution. Onchain OS remains the buyer signing surface. Postgres holds authoritative execution receipts; Sibyl recalls owner-scoped verified history. Paying for research never approves trading.

| Service | Reuse | Base extension work |
| --- | --- | --- |
| One-off assistance | Research, evidence, preparation, fee checks, execution approval, receipt | Complete the existing Base analysis lane first; align result JSON and next actions with the newer OKX conversation |
| Managed agent | Onboarding, monitoring preferences, owner-authorized recall, exact copy preview | Define Base-funded entitlement lifecycle and buyer identity binding; do not translate the OKX monthly subscription into an unsupported x402 subscription |
| Integration audit | Audit compiler and immutable JSON/findings/manifest export | Add Base purchase/delivery adapter, artifact retrieval and explicit correction policy; no trade authorization attached to audit acceptance |
| Football data | Existing provider validation and data handler | Base price/configuration and discovery adapter; preserve invalid-input/provider-outage checks before charging |
| LP Scout | Existing liquidity/reward/risk engine | Base price/configuration and discovery adapter; budget remains research context, never spending authority |

Only the existing analysis lane has an inspected Base price: 0.30 USDC. Other Base prices and managed terms remain undecided. OKX USDT prices must not be silently copied as new Base offers. Keep all five in scope while proving one complete Base path first.

## Buyer conversation contract

1. Collect market, outcome and research intent; show the exact Base fee and payment terms.
2. After authorized payment, verify settlement and provide a durable status/recovery reference. An uncertain result offers Check payment status, never automatic repayment.
3. Show AI findings, score meaning, supporting evidence, gaps and original JSON. Offer Show evidence, Download JSON, Request correction and Preview this trade or Analyze another market.
4. A delivery acknowledgement records review. The existing Base x402 path settles before research delivery: it has no demonstrated OKX-style escrow release, dispute email or automatic refund mechanism. Describe correction handling honestly; design any refund mechanism separately.
5. Preview includes account authority, available balance, fees, market/token identity, amount/shares, price limit and expiry. Changed or expired previews require renewed approval.
6. After supported execution, verify the receipt before claiming completion. Offer Show receipt, Check position, Preview a sell or Analyze another market.
7. In a fresh session, obtain owner-authorized Sibyl recall. A matching earlier fill must require reconciliation with current positions before another order. Missing memory stops this memory-dependent path; it is not an empty-history success.

## Ordered implementation and acceptance gates

1. Read-only runtime audit: deployed commit, Base readiness, buyer plugin version, Sibyl persistence and historical payment-attempt evidence. Identify unresolved attempts without retrying payment or changing their records.
2. Bring the Base result contract up to date: original JSON retrieval, explicit score explanation, correction/status references and consistent next-action prompts. Verify no Base response claims OKX escrow semantics.
3. Exercise the buyer's fresh-session memory dependency with isolated tests: persisted receipt, process restart, verified recall, changed reconciliation decision. Remove only disposable test memory and show the intended path cannot continue; never delete production memory.
4. With exact payment authorization, run one Base canary using identical business parameters in Onchain OS quote and pay. Confirm transaction, payer/seller/fee, stored result and replay without a second charge. BASE_REPLAY_CLIENT_AUDIT.md documents the prior missing-POST-body failure.
5. Verify the buyer-to-receipt-to-Sibyl path using an eligible existing receipt or a separately authorized new trade. Historical incomplete receipts must not be silently upgraded. Base payment approval cannot authorize the Polygon trade.
6. Add the remaining service adapters and their entitlement/delivery tests. Publish discovery metadata only for accurate, tested capabilities; verify actual indexing separately.
7. Prepare the submission evidence and record the demo last, after the proof chain is complete.

## Hackathon checklist

Official rules checked September 10: https://hack.sibyllabs.org/rules and https://hack.sibyllabs.org/submissions.

Submission deadline is September 10 at 23:59 UTC, September 11 at 00:59 Africa/Lagos. Confirm access to the registered team's private submission link; registration cannot be inferred from development work.

Required preparation: public MIT/Apache-2.0 repo with real history; README with prior-work declaration and obvious memory write/read call sites; 2–5 minute demo including continuous fresh-session recall with timestamp or commit; demo and build-log posts tagging the relevant accounts. Verify licensing before publishing: no root LICENSE file was found by this preparation's filename scan.

The key evidence is memory changing behavior after restart, not merely successful capture. Base needs an exercised action in the submitted build; discovery metadata or a 402 response alone is insufficient. Do not add Virtuals solely to claim a multiplier. Public posting, licensing changes and final submission remain separate actions.

Demo proof target: Base payment receipt → AI findings and original JSON → separate exact trade approval → verified execution receipt → process restart → Sibyl recalls prior execution → repeat request is routed to reconciliation rather than duplicate signing. Label synthetic segments and live evidence accurately.


## Superseding reconciliation result - 2026-09-10T19:22:58.155Z

Direct production database inspection used a TLS-verified external connection matched to the web service's configured internal database, with BEGIN READ ONLY and ROLLBACK. All Base attempt records were inspected: one record, settled; zero attempted/unresolved records. Ten Base paid-analysis records were present.

The current attempt e997a0873002f758525415064e5cba7f9c2d4b8fa2206f3d7adb9ce2a011a25c passed verifyBasePaymentRecovery against the configured trusted Base RPC: exact native USDC fee 300000 atomic units, original payer/seller and authorization nonce, successful canonical transaction, matching logs and finalized block. Transaction: 0x3171e54ff003b82a5948c8ef12bb05f5d2c3ea0eba7c34a432fa6b27a5c92cc9. Its stored delivery is completed, request hash matches, result action is ANALYZE and researchStatus is AVAILABLE. This is recovered historical proof, not a payment made today or proof of the newly edited buyer prompts.

Nine other historical delivery references have successful chain receipts but no corresponding newer attempt binding. They remain legacy evidence: receipt success alone was not promoted to strict exact-payment verification. No historical records were migrated, repaired or deleted. Empty/unresolved attempt count does not account for failures before durable claims existed, or independently identify all old client quote IDs.

This supersedes the earlier session-only statement that no successful Base settlement proof had been recovered. No new paid canary is needed merely to prove that Base payment and research delivery previously worked. The remaining priority is fresh-session Sibyl decision-change acceptance and deployment of the reviewed buyer guidance. Any optional new research payment still requires fresh authorization.

Machine-readable proof: BASE_PAYMENT_RECONCILIATION_20260910.json. No signatures, private keys, connection strings or raw payment authorization payloads are included.
