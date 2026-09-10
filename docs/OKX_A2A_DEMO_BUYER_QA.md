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
## Fresh review 2: verified AI failure investigation

Job 0x6d9c23a4bc257912d43f9effadd82191bed2bd274ddb0c911e3ccd86309c62ca
was submitted with researchStatus=UNAVAILABLE and no model-backed assessment.
The original 19,450-byte report has SHA-256
722bc744899b7a3873a7c8e38650b960bef6afee362daf85139fba217c461dce.
It contains public market/source evidence, but lacks the commissioned AI thesis,
counter-thesis and confidence explanation. This is a provider delivery defect,
not a negative assessment of the trade.

Scoped ZeroScout Railway logs for September 10, 2026, 06:56-06:58 UTC establish:
- gpt-5.6-terra timed out at 20,000 ms.
- gpt-5.6-sol timed out at 19,998 ms (20,000 ms measured duration).
- The routing budget was exhausted before gpt-5.6-luna; it was not attempted.
- The input contained 15,818 characters; output token limit was 4,000.
- The degraded report was archived successfully. Its storage transaction is
  archive evidence, not evidence of successful AI analysis or escrow release.

The generic report message does not prove every available model was attempted.
The verified cause is exhaustion of this request's roughly 40-second routing
window after two timeouts. It does not establish a provider-wide outage, an
upstream balance issue, or that a larger timeout will guarantee success.

Correction constraints: the job's persisted research result is immutable;
repeating its request returns the saved degraded result. The verified regular
platform delivery flow requires accepted status and provides no documented
in-place replacement for this submitted job. Do not erase the report, reset the
job, silently create another paid task, or claim a prose explanation supplies
the missing model-backed assessment. A formal rejection with this specific
missing deliverable can enter the supported provider refund decision flow.
No rejection, refund, dispute, model rerun or payment release was performed
as part of this investigation. Timeout tuning needs bounded validation before
claiming restored reliability. No runtime/source fix was deployed by this audit.
## Confirmed refund and OKX email: September 10, 2026

The buyer explicitly authorized formal rejection of Fresh Review 2 for missing
commissioned AI analysis. Rejection was confirmed with transaction
0x5cb9d527e787df20002e5ea5795c9e0a9d5be1913bd824de98d422dc4cb53b37.
The provider's authoritative rejection playbook recommended the agree-refund
branch for this substantiated defect. Its decision deadline was September 11
at 07:08 UTC (08:08 AM Lagos, displayed to minute precision).

The operator separately approved the provider refund with "yes agree". That
actual reply was relayed to the provider decision for this exact job. The refund
agreement transaction was
0xb78e0f808cc2dcad01d07040f9f9ba469522c93495b4ad5d968ca511c1e6f239.
OKX emitted job_refunded with code=0, jobStatus=failed and timestamp=1789024332:
September 10, 2026 at 07:12:12 UTC / 08:12:12 AM Lagos. A separate live CLI
status check also returned failed. In this protocol, that terminal state means
refunded, not an unsuccessful refund transaction. The full 0.1 USDT service fee
was refunded based on the full-refund flow and successful official event. A
separate ERC-20 transfer-log or wallet balance-delta check was not performed.
No dispute bond was posted, and no trade was authorized or submitted.

### Email evidence and correction of the earlier uncertainty

The user confirmed receiving an OKX email and supplied the latest Documents
image, WhatsApp Image 2026-09-10 at 08.09.24.jpeg. It was visually inspected and
preserved byte-for-byte as [the email screenshot](../demo-assets/okx-refund-request-email-20260910.jpeg).
The screenshot shows the OKX mark, the heading that PolyDesk received a refund
request from a buyer, and the complete matching job ID
0x6d9c23a4bc257912d43f9effadd82191bed2bd274ddb0c911e3ccd86309c62ca.
It asks the provider to approve the refund or file for evaluation.

This is observed evidence of the platform refund-request email for this task,
corroborated by the user's receipt confirmation. Our earlier suggestion that
PolyDesk needed its own email sender to obtain this alert was premature: OKX
sent the platform alert independently of PolyDesk's application email code.
The screenshot does not show sender headers or transport authentication; it
is not an email-header audit. It proves neither guaranteed email delivery for
all future events nor an email for an already-opened dispute. This was a refund
request/rejection notification; no dispute was opened in this demonstration.

### Future video: failure and refund branch

1. Show the original JSON: researchStatus UNAVAILABLE, absent AI assessment;
   explain that market data alone did not fulfill the commissioned AI review.
2. Show sanitized provider timeout evidence: two roughly 20-second timeouts,
   then routing budget exhausted before the third model. No fabricated score.
3. Show buyer rejection and the specific missing-deliverable reason.
4. Show the preserved OKX email screenshot and matching task ID. Say:
   "OKX emailed the provider when the buyer requested a refund."
5. Show the provider's refund-versus-evaluation choice and explicit operator
   agreement to refund. This complaint was accepted; no dispute was filed.
6. Show job_refunded/code=0 and the live terminal status. Explain failed means
   refunded in the CLI; quote the 0.1 USDT refund and agreement transaction.
7. End with: "The refund is complete. Next, fix and validate the AI timeout
   handling before commissioning another paid review."

Suggested narration: "When the AI review failed, we did not invent an answer
or pressure the buyer to accept. The buyer rejected the incomplete delivery,
OKX emailed PolyDesk, and the provider approved a full refund. We verified the
refund event and preserved the original evidence."

This remains a controlled test with the same operator controlling buyer and
provider. It demonstrates the refund lifecycle, not independent customer demand
or contested-dispute arbitration. No screen-recorded video has yet been made.
## Timeout recovery deployed and validated

ZeroScout commit f4430b165b3d58a9c05a54bcc8f61cbc97cefda0 fixes fallback
starvation within the existing 40-second model-routing deadline. The first two
attempts reserve time for a third route when configured candidates permit it;
shorter budgets scale the reservation down. Fast failures can still permit
additional candidates. This does not promise that every discovered model runs.
The degraded message now distinguishes failed/timed-out attempts from candidates
that may not have been tried. No report or completed/refunded task was rewritten.

Validation passed:
- Five focused deadline-allocation tests, including scheduling overhead.
- Full direct-trade smoke suite, including two hanging routes followed by a
  successful third route before a 10-second test deadline; balance-rejection,
  strict JSON, trust handling and non-authorizing degradation checks remain.
- Client and server TypeScript checks.
- Railway deployment a57944f0-b755-454b-9db5-41afc8e75189 succeeded for f4430b1.
- Public health returned ok=true with AI configured. The deployed startup probe
  reported model readiness available at 2026-09-10T07:21:06.507Z.
- One local synthetic canary using the production compute route/settings returned
  valid model-backed JSON in 14,829 ms (model call 13,600 ms). Input was 16,612
  characters, output limit 4,000 tokens; model gpt-5.6-terra, default trust.
  Its INSUFFICIENT/LOW result refers only to synthetic evidence, not the United
  market. No buyer task, archive upload, trade or escrow payment was created by
  that canary. Production credentials were not included in this documentation.

Demo follow-up: "We reproduced the fallback starvation, fixed it within the
same overall deadline, deployed it, and validated both the third-model fallback
and a live model response before asking a buyer to purchase again."
This is one live canary plus mocked regression coverage, not a reliability rate
or proof every future research request will succeed. A new real review remains
a separate disclosed purchase requiring buyer approval.
## Recovery-review failure: latency diagnosis

Job 0xd6bb3b388b5f2c03e5e9210607f83b1c8099382281dba0a45ad9e7a26a0bff51
also delivered researchStatus UNAVAILABLE. The original provider JSON is 18,236
bytes, SHA-256 0e3a642cb077dd225ed47a994d7ca9e4d28307cf806222ac8f8f7c736fd53f06.
No refund, acceptance or additional buyer purchase was performed in this diagnosis.

Production logs confirm f4430b1's third-attempt reservation operated as intended:
- gpt-5.6-terra: timeout at 20,000 ms (20,002 ms measured).
- gpt-5.6-sol: timeout at 9,999 ms (10,001 ms measured).
- gpt-5.6-luna: timeout at 9,997 ms (9,999 ms measured).
- gpt-5.5 was not attempted because the routing budget was exhausted.
All used default trust, chat completions, 14,418 input characters and a 4,000
output-token limit. No completed response was available for JSON parsing;
these logs do not show a balance rejection or authentication failure. Log
collection timestamps are buffered; use measured attempt durations for timing.

One operator-only diagnostic reconstructed the input from the saved public
report evidence and used the existing 60-second single-model diagnostic path.
The request was 14,380 characters (not byte-identical to the original request).
Using the same production compute settings from the local operator environment,
gpt-5.6-terra returned valid JSON in 19,578 ms, with 1,300 output tokens,
including 192 reasoning tokens. Total diagnostic duration was 19,580 ms.
The prior synthetic canary model call took 13,600 ms and 736 output tokens.

Interpretation: a real-evidence inference can succeed, but this observed response
had only 422 ms headroom under the production primary-attempt cutoff. This is
consistent with variable model/transport latency and insufficient timeout
headroom. It does not isolate provider queueing from network/runtime effects,
prove malformed input, or prove raising the timeout alone guarantees success.
The earlier fix addressed fallback starvation, not end-to-end reliability.

The diagnostic performed no archive upload or task delivery and did not replace
the saved report. Its assessment is not a fresh trade recommendation. Next work
should budget inference, fallback, archive and caller timeouts together and test
representative real-evidence inputs before asking for another paid review.
No timeout configuration change was deployed in this diagnosis.

## Coordinated timeout correction and real-evidence validation

On 2026-09-10, the subsequent authorized correction deployed ZeroScout commit
4e11c74 and PolyDesk commit 48da0b1. Inference now allows 90 seconds overall,
35 seconds per attempt, and up to 20 seconds reserved for fallback. Three slow
routes receive approximately 35 + 35 + 20 seconds, subject to overhead.
The PolyDesk research caller now allows 150 seconds, with zero automatic retries,
and the outer A2A worker allows 240 seconds. The general upstream default remains
75 seconds; this change targets the research call.

Deployment evidence:
- Render deployment dep-dah5s8bbc2fs73fgs6r0 is live at PolyDesk 48da0b1.
- Railway deployment 7d0a81e7-c638-44f2-97ab-07c2ab262fc6 succeeded at 4e11c74.
- Production variables were read back as total 90000 / attempt 35000 ms.
- Deployed startup readiness reported available at 2026-09-10T07:41:03.185Z;
  its small probe returned valid JSON in 12,057 ms of model time.
- VPS worker updated to 48da0b1, 240000 ms verified, daemon active.
- An unauthenticated public-config request returned HTTP 403; it was not used
  as evidence of effective configuration.

Six deadline-allocation tests, the full direct-trade routing smoke suite,
77 relevant PolyDesk tests, and both repositories' TypeScript checks passed.
The smoke suite exercises two hanging routes followed by a successful third.

Three sequential operator-only calls used normal generateCustomIntelligence,
locally with production compute settings and reconstructed saved public evidence.
They did not use the special single-model 60-second diagnostic override.
All returned valid model-backed JSON with a trade assessment and degraded=false,
using gpt-5.6-terra with default trust.

| Saved evidence case | Input characters | Model ms | Total ms | Output tokens |
| --- | ---: | ---: | ---: | ---: |
| Recovery review d6bb | 14,380 | 21,984 | 23,297 | 1,371 |
| Fresh review 2, 6d9c | 15,780 | 20,182 | 21,322 | 1,325 |
| Earlier fresh review 0864 | 14,560 | 22,372 | 23,426 | 1,292 |

Every observed model duration exceeded the old 20-second cutoff. This supports
the timeout-headroom diagnosis, but three samples of the same market do not
establish a reliability rate, validate every fallback provider, or prove the
full deployed HTTP/archive/receipt/settlement path. Reconstructed requests are
not byte-identical to the originals. These historical inputs and diagnostic
scores are not current trade advice or replacement deliveries.
No archive, buyer task, escrow release, refund or trade was created by these
validation calls. The original failed recovery report remains unchanged.

Demo follow-up: "The timeout correction is deployed, and all three saved
inputs returned AI analysis. The failed delivery still needs its own buyer-review
decision. Would you like to request a refund for its missing AI analysis?
A fresh paid review requires a separate disclosed purchase approval."

## Recovery-review refund request

The buyer explicitly approved requesting a refund for United Review After Recovery.
Before mutation, the live task was submitted, buyer 5579, provider 5427, budget
0.1 USDT. The buyer rejected task
0xd6bb3b388b5f2c03e5e9210607f83b1c8099382281dba0a45ad9e7a26a0bff51
because researchStatus UNAVAILABLE omitted the agreed AI assessment, thesis,
counter-thesis and confidence explanation. Later diagnostics do not replace the
original delivery. The rejection succeeded and a fresh status read confirmed
rejected. Transaction:
0xcf9e40b616e6b48b0edf56576f29c8ee54892c9fdd10d79eb0e4839851f6c130

This records a refund request, not a completed refund or a filed dispute.
No provider refund agreement, escrow release or new purchase was performed in
this step. Provider agreement remains a distinct decision for the same operator
who controls both demo identities; do not present this as independent demand.
Follow-up: "Your refund request is submitted. As PolyDesk's provider, would you
like to approve the full 0.1 USDT refund?"

## Recovery-review refund confirmed

The operator explicitly approved the full 0.1 USDT refund as provider 5427.
Relaying the verbatim reply "yes" initially stalled: the provider session treated
it as ambiguous between its internal A (dispute) and B (refund) options, despite
our visible question asking specifically about approving a full refund. A check
after one minute still showed rejected. The provider session had ended without
executing a financial action. The operator then executed agree-refund directly
under the already explicit, task-specific authorization; no repeat approval or
dispute was needed.

Refund-agreement transaction:
0x30c69e6623d349e69f4ec50b229568d272c037884980e6592ff91312671d9c56

Both buyer 5579 and provider 5427 received job_refunded, code 0, jobStatus failed,
for task 0xd6bb3b388b5f2c03e5e9210607f83b1c8099382281dba0a45ad9e7a26a0bff51,
timestamp 1789027313 (2026-09-10 08:01:53 UTC / 09:01:53 Lagos).
An independent CLI status read also returned failed. Here failed is the closed,
refunded task outcome, not a failed refund transfer. These checks verify the
platform refund event; no separate ERC-20 transfer-log or wallet-balance audit
was performed. No new paid research job or trade was created.

Demo UX defect to retain: a yes/no question shown to the user must remain bound
to that exact action when relayed to a provider session. A bare yes must not be
reinterpreted against a different internal multi-option card. This session used
an authorized direct-command fallback; no general relay-code fix is claimed.
Follow-up: "The full 0.1 USDT refund is confirmed. Would you like to start a
fresh research review for 0.1 USDT, or inspect the validation findings first?"

## Fresh validated review: original JSON receipt verified

Task 0x6fbeb3612da2117158baf4f5ea20661361b5e68ab9883ad1b6557cc93756463c
(United Fresh Review Validated) was commissioned with explicit 0.1 USDT approval.
Creation transaction: 0xd689565eb5e90c77c45c0c9e9cbb5810d67ba6da1753771e6e7baa29254c5a64.
On receipt check, the buyer CLI deliverable list was empty even though the buyer
session had downloaded, read and then saved the original JSON. Its old temporary
download path no longer existed because the file had moved to persistent storage.
The actual user file is UnitedFreshReviewVal_20260910_081218990.json; provider
original is UnitedFreshReviewVal_20260910_080902388.json in their respective
.onchainos/deliverables user/asp task folders. Both and the local downloaded copy
are 21,990 bytes with SHA-256:
19e432be477870bd7310a8307db25af2c2474ff6b38997f8a37cd606def4b9f2.
The empty listing is not evidence of non-receipt; its cause remains unverified.

Report generated 2026-09-10T08:08:17.506Z; validUntil 08:23:17.505Z
(09:23:17 Lagos). researchStatus AVAILABLE, modelBacked true, stance INSUFFICIENT,
confidence 42/100, evidence quality MEDIUM. Summary, signals, thesis and
counter-thesis are present; reasoningSummary is empty. The report cites conflicting
fixture date/time excerpts and missing attributable team-form, injury, suspension
and lineup evidence. These are report findings, not independently reverified facts
in this receipt check. The 42 score is research confidence, not win probability.
The saved report includes a 0G storage proof; this receipt check verified byte
identity, not an independent storage-chain audit.

Buyer admission reported lookup_off and no execution. The actual report has
orderAuthorized=false and orderSubmitted=false. A fresh task-status query still
returned submitted. No delivery acceptance or service-payment release was issued.
Follow-up: "Show results" before reviewing acceptance or raising a specific issue.

## Fresh validated review accepted and settled

The buyer explicitly instructed: "accept this research delivery and release
0.1 USDT," after seeing the INSUFFICIENT assessment, confidence 42/100, missing
numerical score derivation and unresolved evidence gaps. This exact reply was
relayed to the buyer session for job
0x6fbeb3612da2117158baf4f5ea20661361b5e68ab9883ad1b6557cc93756463c.
After 45 seconds, a fresh CLI status read returned complete. Both buyer 5579
and provider 5427 received job_completed, code 0, jobStatus complete, timestamp
1789028273 (2026-09-10 08:17:53 UTC / 09:17:53 Lagos). The provider's official
completion playbook identified funds received and income 0.1 USDT. These are
platform settlement confirmations; a separate ERC-20 transfer-log/balance audit
was not performed in this closeout.

The original JSON was received and its byte identity verified before acceptance.
Delivery acceptance settles research work despite its inconclusive trading case;
it does not establish a favorable trade or authorize an order. No trade was
submitted by this acceptance action. The same operator controls both demo agents.
This cycle now demonstrates fresh request, AI findings, original JSON receipt,
explicit buyer review and confirmed settlement after the timeout correction.
Follow-up: decline this trade and analyze more markets, or resolve the evidence
gaps before considering a separately authorized trade.

## First live trade attempt blocked before submission

After research settlement, the user requested buying Manchester United Yes,
specified a $5 budget and typed "Confirm live mode" after an explicit preview.
The local Polymarket plugin used the configured deposit wallet with $5.025010
pUSD. The proposed FOK buy was 15 shares at a maximum price of $0.31, order value
$4.65. Live Gamma feeSchedule reported sports_fees_v3, rate 0.05, exponent 1;
the published fee formula estimated roughly $0.16043, giving $4.81043 total.

The actual plugin buy failed its balance precheck with INSUFFICIENT_BALANCE:
it required $5.115 (order $4.65 plus a $0.465 fee reserve). No submitted order,
order ID or settlement transaction was returned. This is a trade-execution
blocker after successful research settlement, not a failed research delivery.
The plugin reserve differs from the public fee formula estimate; no fix or
actual charged fee is claimed. Do not silently deposit funds or exceed $5.
A smaller 14-share order at $0.31 costs $4.34; even using that 10% reserve,
required collateral is $4.774. Prepare its dry-run and obtain approval for the
revised preview before another live attempt. No private credentials recorded.

## Revised $4 trade blocked by OKX connection

The user revised the amount to "use 4 usdc". The operator interpreted this as
an all-in $4 cap and preserved the $0.31 limit: 11 Yes shares, $3.41 order value,
plus the plugin's $0.341 reserve, total $3.751. Dry-run succeeded. The live call
selected DEPOSIT_WALLET mode and reported insufficient pUSD allowance for the
Neg Risk CTF Exchange V2. Its automatic approval failed with NETWORK_UNREACHABLE
and TLS BadRecordMac during OKX auth/refresh. One retry outside the sandbox failed
with the same TLS error during pre-transaction/unsignedInfo. Neither returned
an approval transaction hash, order ID or trade settlement receipt. Further
live retries stopped. A fresh balance read still displayed $5.03 pUSD.
This does not establish whether the network, TLS client or OKX endpoint caused
the connection failure. The prior research job remains complete and settled;
this is a separate trade-approval execution blocker. No extra funding requested.

## Audit: fee-inclusive buyer readiness is incomplete

Source audit after the blocked trade confirmed existing wallet ownership,
deployment, pUSD balance and funding-shortfall checks. The native open-prepare
path also checks the correct exchange allowance. However, smart-trader funding
handoff passes amountUsdc directly as requiredBalanceUsdc, and account-readiness
compares that supplied amount without calculating a fee reserve. Native
open-prepare similarly compares balance/allowance against maxSpendUsdc, with no
fee-inclusive calculation. It explicitly reports CLOB credentials and signature
as unverified. Runtime instructions require wallet readiness and buyer limits
but do not implement a reconciled fee-inclusive preflight.

Therefore do not claim the full pre-confirmation flow is implemented. The plugin
protected submission with balance/allowance guards, but its dry-run did not expose
the 10% collateral reserve later used by buy. Required follow-up is a shared,
fail-closed preflight for rounded order cost, live fees, executor reserve,
fee-inclusive buyer cap and wallet balance, correct-spender allowance, and
signer/relayer readiness. Estimates and actual fees must be distinguished.
Read-only checks cannot guarantee a later network call will succeed. The latest
position query returned zero positions and balance still displayed $5.03 pUSD.
No code fix or deployment of this complete preflight is claimed in this audit.

## Trade-blocker corrections: implementation and validation

PolyDesk 4a3f887 deployed on Render (dep-dah736k9v7es73b7u660) and the VPS
runtime instructions were synchronized, daemon active. Added the read-only
/api/polymarket-account/trade-preflight endpoint and shared integer budget math.
It resolves the exact token and owner-derived wallet, reads live fees and the
executor reserve, rounds order size within the total buyer cap, checks correct
exchange allowance, balance, price tick, depth and freshness. Funding readiness
now explicitly says wallet-funding-only/tradeReady=false. The smart-trader handoff
requires preflight outputs instead of funding against order notional alone.
publicChecksPassed is not authentication, signing or order authorization.

The installed official plugin 0.7.1 source had two separate defects relevant to
this failed buy: dry-run omitted its execution-time reserve; deposit-wallet buys
shared a legacy proxy approval branch and checked pUSD allowance to the Neg Risk
Adapter. Deposit-wallet setup instead approves pUSD to the V2 exchanges and CTF
operator access to the adapter. The isolated patch exposes the reserve, checks
the selected exchange for deposit-wallet buys, fails closed on allowance RPC
errors and never routes deposit-wallet approvals through the proxy factory.
Missing real exchange approval requires supported relayer setup, not that legacy
path. The patch does not replace the reserve with the lower estimated market fee.

Patch stored at ops/patches/polymarket-plugin-0.7.1-preflight.patch. Built locally
from the installed official 0.7.1 source; original Windows binary retained.
Patched Linux operator binary SHA-256:
6dcd10b35b37759ccd0cbca6e3bb0f68b6b3e49d5b1beea2d0af4dad609d9ff2.
The optional config-directory override reads the existing local configuration
without copying wallet credentials. scripts/polymarket-wsl.ps1 supplies those
paths to the local Linux build; it is not a geographic workaround and leaves
region checks and TLS verification enabled.

Existing Linux OnchainOS 4.5.3 was verified against the published release hash:
0d66c2135e5c91592ff06c6bc3632fd21c89c5966068e44bd973b8384cfd9493.
With ONCHAINOS_HOME pointing to the same existing local account, it resolved the
same Polygon owner without the Windows BadRecordMac error. Public Linux probes
also reached the OKX endpoint with both TLS 1.2 and TLS 1.3. This narrows the
transport issue but does not prove its root cause or guarantee later signing.
Patched preview for the authorized $4 cap: 11 shares, $3.41 order, $0.341 reserve,
$3.751 required. Patched balance read returned the same deposit wallet and $5.03.

Validation: 65 relevant PolyDesk tests passed before the added order-policy test;
the final seven focused preflight tests and account-readiness tests passed, and
both TypeScript checks passed. Patched plugin: 24 library tests passed, including
the real $5.115 rejection and reserve ceiling regression. Live preflight detected
an old book snapshot even after a cache-busting request. The guard remains; return
the full wallet/budget checks with STALE_ORDER_BOOK so the buyer sees the actual
blocker. No live order was submitted by these audit checks. A read-only success
must not be presented as proof of a filled trade or universal network reliability.
