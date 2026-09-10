# Sibyl demo runbook and tested flows

Release rehearsal September 10, 2026: 101 passed, 0 failed, 0 skipped. Machine evidence: sibyl-rehearsal-20260910.json; full output: sibyl-rehearsal-20260910.log. Run again for recording with node scripts/sibyl-demo-rehearsal.mjs from the release checkout. Requires Windows/WSL and the existing pinned Sibyl 0.8.0 runtime; POLYDESK_TEST_SIBYL_PYTHON can select an explicitly installed equivalent runtime.

## Recording sequence

| Beat | Show | Explain precisely |
| --- | --- | --- |
| Service value | Existing five-service menu, then focus on research-to-trade assistance | One shared product, platform-specific access and payments |
| Base payment | BASE_PAYMENT_RECONCILIATION_20260910.json and the original transaction | Historical 0.30 USDC payment on Base, strict finality and original-request binding verified; no payment made during rehearsal |
| Research delivery | Already-paid result, AI evidence and original JSON | Score is a screening assessment; explain gaps. Research review is separate from trading permission |
| Buyer continuation | Show results; Show evidence; Show original JSON; Review this research; Analyze another market | Prompts come from actual paid-status response. Expired/unapproved research does not offer an executable trade |
| Exact trade boundary | Existing documented preview/receipt flow, labelled historical | Account, balance, fees, side, amount, price and expiry are checked. A buyer agent must approve each exact trade within its granted authority |
| Persist relevant history | Rehearsal's synthetic fully filled order passing the real adapter's checks | Synthetic provider and chain evidence enters a separate local Sibyl category; never present it as a new live trade |
| Fresh-session recall | Keep the recording continuous: capture ends, separate Node process reads through native Sibyl SDK | Actual decision becomes LOCAL_MEMORY_RECONCILIATION_REQUIRED; show prior buys/sells and refresh current position |
| Outage and recovery | Test memory capture fails, existing receipt/inventory survives, memory-only retry succeeds | Repairing memory never resubmits the order or charges again |
| Missing memory | Fresh process points to isolated missing test store and fails; restore test root and recall succeeds | Expected history cannot silently become empty success. Production memory is not removed |
| Close | Show original receipt, remembered fills and current-position follow-up choices | Recall does not prove the current position or authorize signing |

For the required continuous fresh-session beat, show the timestamp and tested commit. The saved report identifies its base commit and notes uncommitted test changes at the time of execution; the published rehearsal commit contains those changes. Do not replace recorded process output with invented UI messages.

## Judge questions and answers

- **What if the buyer takes the report without paying?** Base research is delivered after the approved service payment settles. This is separate from OKX marketplace escrow; do not transfer OKX dispute/release wording to Base.
- **What if payment or submission times out?** Inspect the same durable attempt and chain/order evidence. Uncertainty blocks another submission. Recovering a result is not authorization to pay or trade again.
- **What if Sibyl is unavailable after a successful trade?** Keep the receipt and expected memory inventory. Report LOCAL_MEMORY_REVIEW_REQUIRED and retry only capture for that execution after the problem is corrected.
- **What changes because of memory?** A fresh process finds the earlier token fill and requests reconciliation before the next decision. The test demonstrates changed behavior using the actual adapter and SDK.
- **Can a copy-trading subscription spend automatically?** No. Monitoring/following a wallet does not grant trading permission. Every exact copied trade needs buyer-agent approval under buyer-granted authority; unattended copy is unavailable.
- **Does a remembered BUY mean the position is still open?** No. Review both BUY and SELL history and refresh the actual current position. The memory response explicitly leaves currentPositionVerified false.
- **Are local and hosted receipts interchangeable?** No. Local finalized-fill memory has its own provenance and category; it does not claim governed authority or populate the hosted governed outbox.
- **Was this entire memory flow tested with a new live trade?** No. Ninety checks passed with synthetic trade/provider evidence and the real SDK in isolated storage. Base payment is separately verified live historical evidence. Live capture of a new eligible guarded trade remains an acceptance gate.

## Commands and follow-ups to explain

- After successful guarded submission: automatic read-only verification and local memory capture attempt. Capture may remain pending while settlement is not finalized.
- Memory-only retry: scripts/polymarket-wsl.ps1 -CaptureMemory -MemoryExecutionId <same-existing-id>.
- Buyer-local fresh-session review: scripts/polymarket-wsl.ps1 -ReviewMemory -MemoryOwner <verified-local-owner> -MemoryToken <exact-token>.
- Success choices: Show receipt; Review remembered fills; Check current position.
- Failure choices: Check existing settlement; Retry memory capture. Never suggest repeating the trade to repair memory.

These are buyer-local commands, not remote owner-signature APIs. The current conversation instructions require review before using memory to propose another trade, but direct execution does not yet have a mandatory memory-acknowledgement gate.

## Evidence and remaining production gates

The original historical buy/sell predate the saved local bindings and cannot be backfilled honestly. The rehearsal does not migrate those trades, spend funds, sign messages or touch production memory. It uses an isolated temporary native store and keeps an explicit synthetic-only label.

Before claiming full live trade-to-memory production acceptance, separately approve one exact fresh trade through the updated guarded launcher, verify its eligible receipt and capture, then run owner-scoped local recall in a fresh session. Hosted governed memory acceptance is a separate unproven path. Record the actual demo last, after selecting the evidence and displaying these boundaries accurately.

## Approved live preview: liquidity check stopped submission

The buyer approved the PolyDesk Polymarket skill preview: Manchester United Yes, 10 shares, BUY FOK, 0.30 maximum price, 3.00 pUSD order amount and 3.50 total cap. At 2026-09-10T20:12:57.685Z the refreshed check returned INSUFFICIENT_DEPTH_AT_LIMIT. Balance was 4.68187 pUSD against 3.30 required collateral; balance was sufficient. No signing or live order submission was attempted. The execution guard subsequently returned NO_UNCERTAIN_EXECUTION.

Evidence: manchester-united-execution-check-20260910.json alongside the earlier preview. Approval does not guarantee liquidity; the exact limit remains binding. This demonstrates a pre-submission stop, not an exchange rejection, settlement receipt or live Sibyl capture. Live trade-to-memory acceptance remains open.

Buyer follow-up prompts: **Check the same 0.30 limit again**; **Show a fresh preview**; **Analyze another market**. A new price or size must be presented for buyer approval. These are documented conversation prompts; this evidence does not claim they were newly integrated into every API response.

Recheck at 2026-09-10T20:16:51.577Z: STALE_ORDER_BOOK (127083 ms old) and INSUFFICIENT_DEPTH_AT_LIMIT. No signing or submission. Balance remained 4.68187 pUSD. Insufficient depth was reported on stale data, so current executable liquidity is unconfirmed. Evidence: manchester-united-recheck-20260910-201651.json. Follow-up: Show a fresh preview; Analyze another market.

Fresh revised preview at 2026-09-10T20:19:01.430Z passed public checks with a 1146 ms book age: Manchester United Yes, BUY 10 shares, FOK, limit 0.31, order 3.10 pUSD, estimated market fee 0.10695 pUSD, estimated spend 3.20695 pUSD, collateral requirement 3.41 pUSD including reserve, total cap 3.50. Balance 4.68187 pUSD. Exact local dry-run passed with PolyDesk builder attribution. No order submitted. Evidence: manchester-united-preview-031-20260910.json. Because 0.31 exceeds the previously approved 0.30 limit, the buyer must approve this revised preview before signing; refresh checks again before submission. Buyer prompt: Execute this preview.

## Live local trade-to-memory acceptance verified

This supersedes the earlier open acceptance gate for the local route. The buyer explicitly approved the revised 0.31 preview. Fresh preflight passed at 2026-09-10T20:20:45.341Z, then the guarded PolyDesk Polymarket skill submitted exactly once under buyer:sybil-live:20260910:mun-10-031. Ten Manchester United Yes shares filled at 0.31: 3.10 pUSD notional plus 0.10695 fee, total 3.20695 within the 3.50 cap. No new research payment or allowance approval was made.

The native executor returned indented JSON that the line-only parser did not recognize. It kept the uncertainty lock, preventing another buy. Read-only recovery verified the exact bound order against authenticated order data and finalized fills, recorded FILLED and cleared the lock. Recovery then exposed a dynamic-import cycle with the memory adapter; memory-only capture for the same execution succeeded. Both local handling bugs are corrected. Regression checks: 22 passed, 0 failed, 1 optional SDK test skipped. Fixes are local, not yet deployed or committed.

Live SDK capture returned LOCAL_FILL_MEMORY_VERIFIED. A separate process recalled the same execution and returned LOCAL_MEMORY_RECONCILIATION_REQUIRED, instructing review of previous fills and a fresh position check. The independent live position query then showed 10 Yes shares. No trade was replayed during recovery or memory capture. Guard status: NO_UNCERTAIN_EXECUTION.

Evidence: demo/manchester-united-live-fill-20260910.json includes the recovered receipt, exact transaction and immutable memory projection. This proves the live buyer-local finalized-fill route with honest LOCAL_BOUND_ORDER_AND_FINALIZED_CHAIN provenance. Hosted governed memory remains a separate unproven route, and a continuous video recording is still to be made. Prior historical trades were not backfilled.

Buyer prompts: **Show receipt**; **Review remembered fills**; **Check position**; **Analyze another market**. Selling requires a fresh sell preview and buyer approval. The demo should show the actual recovery, not claim the first submission response completed cleanly.

## Live sell and closed-position recall verified

Buyer approved: Sell these 10 shares at minimum 0.30. Fresh sell preflight passed at 2026-09-10T20:29:09.601Z; exactly one FOK sell submitted under buyer:sybil-live:20260910:mun-sell-10-030. All 10 sold at 0.30. Finalized exact-order fill: 3.00 pUSD gross, 0.105 settled fee, 2.895 net. Against the fresh buy cost of 3.20695, this completed round trip lost 0.31195 pUSD including both trade fees.

The corrected response parser recorded submission normally. Initial automatic capture returned LOCAL_MEMORY_REVIEW_REQUIRED; no detailed cause was exposed. Memory-only retry verified the finalized sell and returned LOCAL_FILL_MEMORY_VERIFIED without replaying the trade. A fresh process recalled both the BUY and SELL execution IDs; an independent live position query returned zero open positions. This shows why memory must review sells alongside buys and cannot alone claim current holdings.

Evidence: demo/manchester-united-live-sell-20260910.json. Local live buy-to-sell-to-memory flow verified; hosted governed acceptance and the actual continuous demo recording remain separate. Buyer follow-ups: Show receipt; Review remembered fills; Analyze another market. Any new trade requires a fresh preview and buyer approval.

Mandatory continuation update: the supported live launcher now requires Sibyl recall and a matching fresh Polygon position before submission. Show -CheckMemoryContinuation returning MEMORY_RECONCILED_CLOSED from the live BUY and SELL history. Use the isolated rehearsal for deletion/restoration tests; never delete production memory. See ../MEMORY_DEPENDENT_BUYER_FLOW_20260910.md. Earlier statements that launcher review was optional describe the previous release.

Fresh-machine judge path verified: see ../JUDGE_QUICKSTART.md and judge-fresh-clone-20260910.json. Native Linux clone with new dependencies and pinned runtime passed 11 Python tests plus 101 judge-flow tests; no wallet or trading binary required. For the reproducibility beat run node scripts/judge-reproduce.mjs after documented setup.
