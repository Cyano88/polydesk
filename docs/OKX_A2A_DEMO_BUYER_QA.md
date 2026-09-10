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
The official protocol includes review-timeout completion and provider claims.
Use the actual task deadline and next-action flow; payout is not unconditional.
These timeout and dispute branches have not been exercised in this demo.

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

### What if the buyer finds an error?

An issue starts clarification and evidence review, not an automatic rejection or
refund. Compare the complaint with the commissioned scope and original report.
Prepare a factual correction or explanation from existing evidence without
silently charging for new research. Preserve the original JSON and attach any
permitted correction as a clearly identified addendum with its sources and
impact. Never invent a revised confidence score or extend the original expiry.

There is currently no verified official resubmission path after submitted status:
the documented deliver command requires accepted status. A correction may only
be sent through a channel allowed by the real task playbook; it must not be
advertised as replacement delivery. If that channel is unavailable, explain the
limitation and use the supported review/refund/dispute flow. The conversation
does not stop platform deadlines. Runtime handling is implemented as agent
instructions; a live correction-and-receipt demonstration remains untested.

Follow-up: "Please review this clarification. Would you like to accept the
delivery, or formally reject it with the remaining issue? Accepting releases the
service fee and does not authorize a trade."

### What if a buyer repeatedly asks for refunds after consuming the research?

This escrow rejection process is not a card chargeback. For a regular task,
formal rejection opens a documented 24-hour provider decision window. PolyDesk
can agree to a justified refund or contest the rejection using the official
dispute flow. The actual response deadline must come from the live task.

A dispute should compare the agreed scope against the delivered work, using the
original JSON/hash, escrow evidence, submission/receipt times, validity window,
buyer's stated issue and correction history. File integrity alone does not prove
research quality. Disagreeing with an OPPOSE recommendation alone does not prove
the commissioned research was defective.

The regular-task CLI has two steps: dispute raise approves the dispute deposit;
dispute confirm creates the dispute on-chain. A bond may be needed, so disclose
the actual amount and obtain approval through the provider decision flow. Verify
disputed status before claiming a case was filed. Evaluation determines the
outcome; neither winning nor bond recovery is guaranteed. Do not miss the
response window while discussing corrections.

Repeated requests warrant review of verified task outcomes. They do not justify
automatic refund denial. Future engagement decisions can be reviewed by the
operator; no automatic abuse detector or platform-wide ban is implemented.
Existing obligations and valid complaints must still be honored.

Judge-facing answer: "Escrow protects payment before work starts. If a buyer
rejects a valid delivery, PolyDesk can submit evidence through the platform's
dispute process. We distinguish real defects from unsupported refund claims,
and we keep the original report and receipt as evidence."

Protocol references checked September 10, 2026: [official task states](https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-ai/references/task-state-machine.md),
[official task commands](https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-ai/references/task-cli-reference.md),
and [provider delivery rules](https://raw.githubusercontent.com/okx/onchainos-skills/main/skills/okx-ai/references/task-asp.md).
These are documented capabilities, not a live dispute/refund demonstration.

### What if the buyer never approves payment release?

The fresh United task has a verified 72-hour review window. Its saved original
OKX system event is job_submitted, bound to job
0x0864de5bdc64d53be480f870306d79c7cbc657dbe0f9e791effaaf7b06762745,
with timestamp=1789019669 and expireTime=1789278869 (Unix seconds).
Submission was September 10, 2026 at 05:54:29 UTC; review expires September 13,
2026 at 05:54:29 UTC, or 06:54:29 AM Africa/Lagos. Live status remained submitted
when checked September 10 around 06:30 UTC. This deadline is from the original
system event, not inferred from the report validity or buyer download time.

The official deadline renderer describes review expiry as auto-acceptance and
payment release. The CLI also provides claim-auto-complete after review_expired;
follow actual events and verify the terminal status/payment outcome. Do not
promise settlement at the exact deadline second or claim timeout release was
already demonstrated. A formal rejection enters the separate refund/dispute flow.
This task's 72 hours must not be presented as a universal value for every task.

Source: [OKX review deadline renderer](https://github.com/okx/onchainos-skills/blob/main/cli/src/commands/agent_commerce/task/common/deadline.rs).
Task evidence was read from the saved original event on the provider VPS; no
review decision, refund, claim, or dispute was executed during this check.

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

## Fresh research closeout: September 10, 2026

The buyer authorized the scope review and acceptance/release of 0.1 USDT if the
research met scope. Review found the exact market/outcome, current-at-generation
source excerpts, readable AI thesis/counter-thesis, confidence and disclosed gaps.
The request was to investigate and seek evidence, not guarantee a resolved
fixture conflict or complete team news. The report meets that bounded delivery
scope with limitations; it does not establish a profitable or executable trade.
No numerical confidence derivation was supplied or invented. Original JSON and
buyer/provider hashes were rechecked and still matched before acceptance.

The buyer's actual instruction was relayed through the existing job_submitted
review decision. The original system job_completed event returned code=0,
jobStatus=complete and timestamp=1789022300 (September 10 at 06:38:20 UTC,
07:38:20 AM Lagos). A separate status query confirmed complete. The official
completion playbook reported on-chain confirmation and 0.1 USDT released to
provider 5427. No separate transfer transaction hash or balance-delta receipt
was obtained; cite the official event/status, not a fabricated explorer receipt.

The original report opposed BUY Yes, confidence 55/100, MEDIUM evidence quality.
Its 06:08:45 UTC validity had expired by acceptance, but buyer receipt occurred
before expiry. Delivery acceptance is a historical service-quality decision,
not a fresh market assessment. No order was authorized or submitted.

The platform rejected attempted self-feedback; no successful external rating
or independent customer validation is claimed. Provider-side session deletion
reported a cleanup failure after completion; that does not undo settlement.

### Recording sequence and exact evidence

1. Escrow: show the task's 0.1 USDT fee and accepted-before-work evidence.
2. Findings: show OPPOSE, confidence 55/100, thesis, counter-thesis and gaps.
3. Delivery: show the buyer's original 24,952-byte JSON and matching SHA-256.
4. Review: show the buyer's explicit proceed instruction and official relay.
5. Settlement: show complete status and the successful job_completed event;
   explain that official completion confirms release, with no separate transfer
   receipt inspected. Label this September 10 historical demonstration.
6. Follow-up: "This report opposed the trade and is now expired. Would you like
   to review taking this trade, or pass on it and analyze other markets?"

This is a recording script and evidence log. No screen-recorded video was created
by the closeout audit. Keep secrets and unrelated account information out of any
future recording. The test buyer and provider are controlled by the same operator;
this demonstrates functionality, not independent paid customer demand.

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

- Live correction receipt, refund/dispute resolution and timeout-claim behavior; exact task deadlines and dispute bond amounts.
- Repeated unattended reliability beyond the one completed run above.
- Live delivery of the newly added analysis and continuation prompts.
- A separate governed trade and verified fill if the video claims execution.
- Current marketplace listing/review state and current service prices.

Runtime instructions for readable analysis and post-completion follow-up were
deployed in 3e1f481. Instruction deployment alone does not prove another agent's
UI renders them. The three-service roadmap is distinct from the live listing:
our observed service-list still included legacy A2MCP entries. Do not claim
the marketplace already contains only three services without rechecking.
