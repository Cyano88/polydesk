# PolyDesk A2A demo: buyer questions and answers

Captured from the September 10, 2026 walkthrough. Use this alongside the
[existing video script](okx-demo-video.md) and
[combined demo script](okx-combined-demo-video.md).
Those scripts cover earlier flows; this document describes the newer One-Off
A2A research and escrow demonstration. Do not mix its payment sequence with x402.

## Opening explanation for judges

"PolyDesk lets another agent commission research under a disclosed service fee.
The buyer funds escrow before the work begins. PolyDesk delivers both readable
AI analysis and the original structured JSON. The buyer can inspect the results
before accepting the delivery and releasing the service payment. Any trade is a
separate decision with its own authorization."

## Questions buyers and judges may ask

### Does the buyer see results before accepting the delivery?

Yes. The buyer receives the report first, including the market, evidence, AI
assessment, limitations, and validity window. Reviewing the report is separate
from accepting its delivery. Showing or downloading results does not release
payment or authorize a trade.

### Was no USDT paid before the research? Can the buyer run away without paying?

The service fee is funded into escrow before research begins. In our observed
One-Off flow, 0.1 USDT was escrowed before the provider began the accepted work.
It was not yet released to PolyDesk. Once the buyer accepted the research
delivery, the task reached complete, which the OKX task protocol identifies as
funds released to the provider.

A buyer disappearing therefore does not mean the research was unfunded.
However, the exact timeout, dispute, refund and provider-claim conditions still
need verification before we claim how abandoned reviews settle. Do not promise
automatic or unconditional payout, or quote a deadline from memory.

### What is the difference between accepted, submitted and complete?

- Accepted: the provider has accepted the task; the observed escrow flow funded
  the service before research began.
- Submitted: the provider submitted its deliverable; delivery/review may still
  be in progress. Confirm buyer receipt separately.
- Complete: delivery acceptance and service-payment release have completed.

Say "research delivery accepted" for the final review decision, to distinguish it
from the earlier provider acceptance of the task.

### Is AI confidence 42/100 a 42 percent chance of winning?

No. It is the AI's reported research-confidence score, not a win probability,
expected return, or calibrated statistical forecast. The market quote and the
opportunity-screening score are separate measures.

Show the thesis, counter-thesis, sources, evidence quality, risks and missing
information beside the confidence score. The observed reports did not supply
a numerical derivation of 42 or 55; do not invent one.

### What analysis supported the original 42/100?

The first report returned INSUFFICIENT with MEDIUM evidence quality. Its supplied
sources associated the fixture with the selected market but did not establish
a United sporting or pricing advantage. It flagged conflicting fixture excerpts,
missing verified team news and comparative odds, and no configured smart-money
feed. Its reasoningSummary field was empty; readable support came from its
summary, signals, thesis, counter-thesis and data gaps.

### What changed in the fresh review?

The fresh report returned OPPOSE buying United Yes, with 55/100 research
confidence and MEDIUM evidence quality. Its stated argument relied on a single
external preview reporting stronger early-season results for City. Its
counterargument cited United's home setting and reported attacking output.

These are the report's attributed claims, not independently verified match
facts. Conflicting fixture information, absent primary team-news confirmation,
and missing comparative pricing remained. A higher confidence number did not
mean stronger support for buying United.

### Why deliver a report that says insufficient evidence or opposes the trade?

A useful research service must be able to explain why the evidence does not
support the proposed trade. Delivering that assessment can satisfy a research-only
request. It does not oblige the buyer to accept poor-quality work or authorize
execution. The buyer reviews whether the commissioned research was delivered.

### Can another agent actually consume the result?

Yes, one observed run delivered the original JSON with task and buyer binding,
exact market/token identifiers, source evidence, AI assessment, report ID and
validity timestamps. The buyer's saved bytes matched the provider's submitted
bytes, and the evidence/selection paths resolved against the JSON root.

This proves that run's transport and format integrity. It does not prove every
source claim is true or every future run will succeed.

### Does accepting the research execute a trade?

No. Acceptance releases the research service payment; it grants no trading
authority. The demonstrated reports explicitly had orderAuthorized=false and
orderSubmitted=false. No trade was executed in that completed demonstration.

### What should the buyer see next?

First display the actual AI analysis and original report, then ask:

"Would you like to accept this research delivery and release the service
payment, or raise an issue with the results? Accepting does not authorize a trade."

Register this through the official review-decision flow, not merely a chat
sentence. In our walkthrough, direct completion was blocked until the buyer's
approval was relayed through that flow.

After official completion, append:

"Would you like to review taking this trade, or pass on it and analyze other markets?"

Keep an OPPOSE, INSUFFICIENT or expired warning visible. An ambiguous "yes" to
this two-branch choice requires clarification; it is not execution consent.

### Does choosing a fresh review charge the buyer again?

Public market refresh can be free; it does not rerun the AI analysis.
A new commissioned AI review is a separate task with its fee disclosed and
approved first. Our fresh One-Off review was explicitly approved at 0.1 USDT.
Never reuse the completed task's payment or silently start a paid research loop.

### What must happen before an actual trade?

A supported fresh review/setup must check the exact market and outcome,
current price, report validity, wallet readiness and the buyer's explicit limits.
Show the exact order and obtain the required authorization before signing or
submission. A completed research-only task or expired report cannot become
a trade approval.

## Verified recording evidence

| Evidence | September 10 observation |
| --- | --- |
| Completed research job | 0xda179f4ab860f2de60eae05ea9e54197be151dbc610555ad0b5fd12edabe5b85 |
| Provider / buyer | PolyDesk 5427 / buyer 5579 |
| Service fee | 0.1 USDT, One-Off A2A escrow flow |
| Context guard | Provider log showed saved-request verification before applying |
| Delivery | Original JSON, 23,208 bytes |
| Provider saved | 05:28:45 UTC |
| Buyer saved | 05:30:07 UTC, before report expiry |
| Matching SHA-256 | 9cc3ebdfea27f827fa41e04654fed58291bec7dcdc8cfea8f1b2743c73cc11d1 |
| Report ID | pdar_d4417662403171ac8c5a5866f7ce4067d1e18fe61307bc35e829a2146b714bea |
| Terminal result | Official CLI reported complete after explicit buyer review approval |
| Execution | No trade authorized or submitted |

Payment release was established through the official complete status and its
documented meaning; a separate release transaction receipt was not inspected
in this walkthrough. Report prices and validity windows are historical.

Fresh review job:
0x0864de5bdc64d53be480f870306d79c7cbc657dbe0f9e791effaaf7b06762745.
The buyer saved the 24,952-byte original JSON at 05:58:41 UTC, before its
06:08:45 UTC expiry. Byte-for-byte comparison and task/market validation passed;
SHA-256: 5e9f7e9e8530bcd60ba41b62dfe63467c926a42e57a6182209557d8058c95c13.
The task remained submitted and a buyer review decision was registered. Do not
present it as payment-released without a subsequent complete-status check.

## Suggested 60-second Q&A insert

| Time | Show | Say |
| --- | --- | --- |
| 0-12s | Accepted task and disclosed escrow fee | "The buyer funds escrow before research begins. Payment is secured in escrow, not yet released to PolyDesk." |
| 12-27s | AI stance, confidence, thesis and limitations | "The buyer sees the reasoning, counterargument and missing evidence. Confidence is not a probability of winning." |
| 27-40s | Original JSON and matching buyer/provider hashes | "Another agent receives the same structured report, with exact identifiers and a validity window." |
| 40-51s | Results, review prompt, then complete status | "The buyer reviews the work before accepting delivery and releasing the service payment." |
| 51-60s | Post-completion choice | "Next, review a possible trade or explore other markets. Neither choice silently authorizes a trade or another purchase." |

Record a fresh walkthrough for current quotes. Clearly label historical footage.
Keep private keys, credentials, private wallet details and unrelated tasks off-screen.

## Claims still needing evidence before the final recording

- Exact abandoned-review timeout, refund, dispute and provider-claim rules.
- Repeated unattended reliability beyond the one completed run above.
- Live delivery of the newly added analysis and continuation prompts.
- A separate governed trade and verified fill if the video claims execution.
- Current marketplace listing/review state and current service prices.

Runtime instructions for readable analysis and post-completion follow-up were
deployed in 3e1f481. Instruction deployment alone does not prove another agent's
UI renders them. The three-service roadmap is distinct from the live listing:
our observed service-list still included legacy A2MCP entries. Do not claim
the marketplace already contains only three services without rechecking.
