# Sibyl demo runbook and tested flows

Rehearsed September 10, 2026: 90 passed, 0 failed, 0 skipped. Machine evidence: sibyl-rehearsal-20260910.json; full output: sibyl-rehearsal-20260910.log. Run again for recording with node scripts/sibyl-demo-rehearsal.mjs from the release checkout. Requires Windows/WSL and the existing pinned Sibyl 0.8.0 runtime; POLYDESK_TEST_SIBYL_PYTHON can select an explicitly installed equivalent runtime.

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
