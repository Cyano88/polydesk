# Sibyl hackathon video: evidence and talking points

Prepared September 10, 2026. Recording remains the final step. Preserve the original PolyDesk avatar. Keep private keys, signatures, credentials, private submission links and account email out of recordings.

## Story

PolyDesk brings Polymarket research and buyer-approved workflows to agents on OKX and Base. Base pays for the service, Onchain OS remains the signing surface, and Polymarket execution stays on Polygon. Sibyl preserves relevant history so a returning buyer is warned about an earlier fill before preparing another order. Research, payment, memory access and trading permission are distinct.

## Evidence labels to show on screen

| Claim | Evidence now | Label for video |
| --- | --- | --- |
| Base service payment worked | Strict chain reconciliation of 0.30 USDC, exact original authorization, finalized canonical block, matching request hash and completed ANALYZE delivery with AVAILABLE research | Historical live payment, independently rechecked September 10 |
| Payment recovery avoids another charge | One current durable attempt, settled; no unresolved attempt records. Nine older delivery receipts succeeded on chain but lack the newer authorization binding | Current attempt verified; legacy evidence separate |
| Fresh-session memory changes a decision | Real pinned Sibyl SDK 0.8.0 and existing buyer decision code, four independent Python processes, isolated synthetic receipt fixture | Synthetic receipt; real SDK; separate processes |
| Production execution-to-memory chain is complete | Not established: live execution-memory outbox was empty at inspection | Remaining acceptance gate |
| Buyer follow-up prompts | Local async/status response change; 22 focused tests and server typecheck passed | Local tested change, not yet deployed |

Payment reference: 0x3171e54ff003b82a5948c8ef12bb05f5d2c3ea0eba7c34a432fa6b27a5c92cc9.
Evidence files: BASE_PAYMENT_RECONCILIATION_20260910.json, SIBYL_MEMORY_INVENTORY_20260910.json and BASE_SIBYL_AUDIT_CHECKPOINT_20260910.md.

## Suggested 3?4 minute recording sequence

1. 0:00?0:25 ? Problem: an agent returning after a restart can forget previous activity and repeat work or propose another trade. Introduce the five-service menu, then focus on one complete workflow.
2. 0:25?1:05 ? Show the historical Base payment and matching research result. Explain fee, chain, original JSON, AI score meaning and unresolved evidence gaps. A screening score is not a win probability or profit forecast. Do not describe research acceptance as approving a trade.
3. 1:05?1:30 ? Show the exact preview boundary: account authority, funds, fees, market/outcome, amount/shares, price and expiry. Explain that buyer-agent approval must cover that exact trade. Do not execute solely for the recording unless separately authorized.
4. 1:30?2:35 ? Continuous unedited memory segment with timestamp or commit: clearly label synthetic receipt; show capture process ending; run a separate review process; show recalled execution ID and changed next action. The existing test showed process 752 with no match, capture process 755, recall process 784 with one match and REVIEW_EXISTING_TOKEN_FILLS. These IDs are evidence of this run, not values to hardcode in a future recording.
5. 2:35?3:00 ? Dependency test: rename only the disposable test database. Separate process 785 no longer finds the fill warning. Explain exactly what degrades: history-based reconciliation is lost. No result grants signing, payment or position verification. Never delete production memory for the demo.
6. 3:00?3:40 ? Show follow-up choices and closing value: findings ? evidence/JSON ? review ? separately requested preview ? receipt/position choices where verified. State remaining hosted acceptance honestly; do not splice the synthetic receipt into the live payment story as if it were one production trace.

## Questions judges may ask

**What if the buyer takes the research and does not pay?**
The existing Base service settles its approved service fee before paid research delivery. The original request is bound to its receipt. OKX task escrow is a separate platform flow; it must not be implied for Base.

**What if payment succeeded but the connection failed?**
Inspect the original attempt and canonical receipt. Recover the same paid request rather than automatically charging again. The read-only reconciliation made no new payment and changed no records.

**Does accepting research or paying a subscription approve a trade?**
No. Each exact trade needs buyer-agent approval within the buyer's granted authority. Following a wallet or monitoring does not grant authority. Unattended copy is unavailable.

**What happens if the result has a defect?**
Review the specific issue against the agreed scope and preserve original evidence. Base currently has no demonstrated OKX-style dispute-email, escrow-release or automatic-refund mechanism. Conversation prompts are not proof that such a backend exists.

**Why is Sibyl necessary?**
In the isolated test, persisted history changed the actual buyer review action after a process restart. Removing that memory lost the prior-fill warning. This is behavior, not just writing logs. Production adoption still requires a verified execution receipt reaching owner-scoped memory and a deployed buyer reading it.

**Is the Base research receipt itself a remembered trade?**
No. The current server memory contract is OWNER_VERIFIED_EXECUTION_RECEIPTS. Research payment is not a Polygon fill and was not inserted into that memory. The production outbox was empty when checked.

**Does memory prove the current position?**
No. History is partial and current account/position checks remain necessary. Recall never grants trading permission.

## Reproduce the isolated test

Use the existing pinned SDK 0.8.0 runtime with scripts/sibyl-fresh-process-acceptance.py --buyer-source pointing to the separate buyer checkout's sibyl directory. The test uses temporary storage, blocks SDK network calls and never opens production memory. The verifier result is explicitly a synthetic fixture. It exercises the real buyer projection validation, SDK storage and execution_review function; it does not exercise hosted HTTP authentication or a real trade verifier.

## Submission accuracy gates

The official rules recovered and checked in the preceding preparation require a fresh-session memory moment, public licensed repo with prior-work declaration, README memory write/read pointers, demo and build-log posts. Confirm the exact buyer source is included or pinned accessibly; a local-only second checkout is not a reproducible submission. Licensing and public posting remain explicit publication tasks. Base indexing, OKX listing approval and hackathon eligibility are separate claims.

Before claiming full production completion: deploy/verify the prompt changes, activate the reviewed buyer version, establish an eligible execution receipt and verify its real owner-authorized fresh-session recall. Do not spend again merely to re-prove the already verified Base research payment.


## Existing-trade eligibility audit - September 10, 2026

Direct read-only production inspection found zero polymarket-governed-execution and zero polymarket-governed-receipt records. No existing receipt can be enqueued with receipt-memory-admin under the current contract. The historical buy and sell documented in OKX_A2A_DEMO_BUYER_QA.md used the local plugin; those notes explicitly do not prove consumption of the governed signed-payload handoff. They also predate the newer public-order recovery binding. A successful settlement is not the missing owner-authority and exact signed-order proof.

No receipt was invented, upgraded or enqueued, and no new trade was placed. The real remaining integration gap is between the supported local executor and the server's governed memory receipt contract. A future adapter must preserve honest provenance and authenticate the buyer; it must not set missing proof flags to true. Alternatively, a fresh separately authorized governed execution can produce an eligible receipt. Current synthetic fresh-process proof remains correctly labelled.

Evidence: SIBYL_EXISTING_RECEIPT_ELIGIBILITY_20260910.json. The observed absence is scoped to this production database and these record prefixes; it does not claim there were no historical trades.
