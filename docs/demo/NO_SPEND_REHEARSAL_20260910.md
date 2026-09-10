# PolyDesk no-spend demo rehearsal — 10 September 2026

Rehearsal completed against release ab4dce6. Evidence captured at
12:08:41 UTC in [the JSON record](no-spend-rehearsal-20260910.json).
161 automated checks passed; none failed. No paid task, signature, approval,
order submission or payment was made by this rehearsal.

## Results and evidence scope

| Area | Result | Evidence type |
| --- | --- | --- |
| Hosted health and public catalog | Passed; three products and six compatibility capabilities | Live unpaid reads |
| Payment challenges | Correct X Layer exact-payment challenges or explicit non-billable failure | Live unpaid requests; payment was never supplied |
| Football news | Provider unavailable; no payment challenge issued | Live degraded branch, handled correctly |
| Research task binding, results, replay and payment boundaries | Passed | Isolated fixtures; no fresh research job |
| Native buy preview | 4 pUSD cap; 3.80 notional, 0.19 market-fee reserve, 0 builder fee, 3.99 required | Live unsigned snapshot; expired previews cannot be executed |
| PolyDesk attribution | Confirmed code attached to native preview | Live unsigned snapshot; no new attributed fill |
| Sell readiness | Blocked: zero shares, no bids at minimum, stale book | Live read-only check of previously closed position |
| Interrupted-order recovery | Filled/open/canceled/partial and uncertain cases passed | Synthetic exact-order bindings and receipt fixtures |
| Real recovery ledger | NO_UNCERTAIN_EXECUTION | Local read-only status; no real crash recovery needed |
| Buyer follow-up prompts | Existing state table and recovery next prompts mapped below | Instruction/script review, not proof every future AI response follows them |

The rehearsal validates these checks; it does not establish fresh unattended
buyer-agent acceptance. Paid research review/escrow settlement and the real
buy/sell receipts remain historical evidence from the main demo Q&A.

## Three-minute recording run sheet

Keep the evidence label visible for each scene. The script does not call paid
endpoints with payment credentials or perform any live acceptance or trade.

| Time | Scene | Evidence label | Buyer follow-up |
| --- | --- | --- | --- |
| 0:00–0:20 | Show PolyDesk service listing and the payment/review boundary | LIVE UNPAID PREFLIGHT | Show service details |
| 0:20–0:45 | Show the saved research job and original JSON, readable AI findings, confidence rationale and evidence gaps | HISTORICAL RESEARCH | Show results; Review delivery |
| 0:45–1:05 | Show previously verified research acceptance/payment receipt; distinguish delivery acceptance from a trading decision | HISTORICAL SETTLEMENT | Preview this trade; Decline and analyze more markets |
| 1:05–1:30 | Show this rehearsal's unsigned buy fee breakdown and PolyDesk builder attribution | LIVE PREVIEW SNAPSHOT | Review fees; Keep funds and analyze another market |
| 1:30–1:50 | Show the closed-position sell rejection and explicit blockers | LIVE READ-ONLY CHECK | Show receipt; Analyze another market; Keep funds |
| 1:50–2:25 | Run isolated crash/recovery tests: pending guard, duplicate blocked, exact finalized receipt recovered | SIMULATED INTERRUPTION | Show the recovered receipt and refresh the position |
| 2:25–2:45 | Show missing/unfinalized evidence stays blocked and an open order is tracked | SIMULATED FAILURE CASES | Track the existing order; Check receipt |
| 2:45–3:00 | Show the evidence record and supported limits | REHEARSAL SUMMARY | Show receipts; Analyze another market; Keep funds |

## Presenter wording

“PolyDesk shows the research and its evidence before buyer review. Accepting
that research is separate from deciding to trade. The trading preview includes
fee reserves inside the buyer's cap and attaches our builder code. Here the
sell check correctly refuses to sell a position that is already closed.

“If the computer shuts down during submission, we retain a durable order
record. Recovery checks the exact order and finalized receipt, rather than
placing another trade. This crash scene is a simulation. We also verified the
read-only recovery readers against our previously completed sell.

“Missing evidence stays blocked. Today’s rehearsal made no payment or trade.
The next acceptance milestone is a fresh buyer-agent flow with a separately
agreed budget.”

## Judge questions

- **Does a connection timeout trigger another purchase?** No automatic retry.
  The supported local launcher retains the pending claim; original execution
  IDs cannot be replayed. Other clients/machines are outside this local guard.
- **What if the order endpoint no longer returns a filled order?** Search
  authenticated history for the exact order ID and verify fully accounted
  finalized fills. An empty lookup never proves the order was not submitted.
- **What if only part filled?** Verify filled amounts and retain the known
  remainder status. Partial history without authoritative order status stays
  blocked rather than authorizing a replacement order.
- **Why is the sell blocked here?** The prior position has zero shares; there
  were also no qualifying bids and the book was stale. This is the correct
  failure branch, not a new sell or proof of a fresh successful sale.
- **Was the news failure charged?** The public request returned the explicit
  unavailable response without a payment challenge. No payment was supplied.
- **Is this unattended production proof?** No. It is a successful no-spend
  rehearsal with historical transaction evidence and isolated recovery tests.

## Reproduce the key scenes

From the release checkout:

```powershell
node scripts/okx-demo-preflight.mjs
node --test scripts/polymarket-execution-guard.test.mjs scripts/polymarket-execution-recovery.test.mjs
.\scripts\polymarket-wsl.ps1 -Recover
```

The broader run included research, marketplace discovery, standard-service
payment boundaries, fee budgets, native/independent preparation, smart-trader,
governed/signed receipts, sell readiness and the recovery suites (161 tests).
Recovery on the real empty ledger reports no pending execution; demonstrate
crash scenarios through the isolated tests, never by fabricating a real ledger.