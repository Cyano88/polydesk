# One-Off research delivery audit

Audit date: 2026-09-10 (Africa/Lagos). Evidence timestamps below are UTC.
Scope: one research-only OKX A2A task, not trading or whole-stack sign-off.

## Result

PASS: original human-readable research delivery, exact selection, archived AI
assessment and proof content integrity. HOLD: strict machine-readable consumer
contract. No task acceptance or payment release was performed by this audit.

## Evidence

- Task: `0xab6d20e2900a838c0c843c7ab4da9254be7709abcae1a20968705447d46e6cb6`.
- Provider 5427; buyer 5579; One-Off service; approved service budget 0.1 USDT.
- Last observed task state: submitted, not complete.
- Original report: 8,172-byte Markdown file; no manual supplement for this task.
- Provider saved: `2026-09-09T23:45:56.911Z`.
- Buyer saved: `2026-09-09T23:47:47.939Z`.
- Both file SHA-256 values:
  `103da04b81b80e0a2375a7da9e32dfdce10a5c3676bff2d6e43d262cd8c6f88b`.
- Report ID: `pdar_2121c18ac4ff63062b83a4679083817e4b73384b751a677b318a1479d9f86223`.
  Present in delivered text; durable report binding was not independently read
  during this audit.
- Generated: `2026-09-09T23:44:22.036Z`.
- Valid until: `2026-09-09T23:59:22.035Z` (buyer receipt was before expiry).
- Archived observation: `2026-09-09T23:43:59.197Z`.
- Archive created: `2026-09-09T23:43:59.251Z`.
- Storage root: `0xd9f1d4205e70039a9ad0564fca11940400deec75896a54be5c4b1e3772ac6643`.
- Retrieved archive content hash matched:
  `0x0dab535c9b57e14a9b03b3650ba881632848ecdb714f588028aa8a134ad030bc`.
- Referenced storage transaction:
  `0x764d8623ed91037fa7bf18fd892ccf9f392954cd69f69a096d69647803d174c6`.
  Chain receipt/finality was not independently checked; content-hash verification
  does not certify factual accuracy of source claims or storage finality.

## Content checks

- Exact market: `epl-mun-mac-2026-09-13-mun`; Yes; BUY research only.
- Condition: `0xb28000f3db74c4e892a9b8bafb5b66d1a7815aeee9689864a1ec644f32bb4c9b`.
- Yes token: `19101488282691860729231803936229393208813096118086124934330053364832952447484`.
- Market URL: https://polymarket.com/event/epl-mun-mac-2026-09-13
- Report and archive agree on reference 0.305, bid 0.30, ask 0.31, depth 7540.21,
  book age 74 seconds, and last trade 0.69. These are historical, not fresh quotes.
- Report explicitly flags the last-trade/book discrepancy instead of resolving it
  by assumption. It remains an unexplained data-quality limitation.
- Report publication/retrieval dates checked against archived source metadata agree.
  This is an archive consistency check, not a new independent source verification.
- Archive confirms researchOnly true, stance INSUFFICIENT, evidenceQuality MEDIUM.
- Report includes REQUESTING_AGENT, REVIEW_REQUIRED, blockers, no automatic retry,
  and orderAuthorized false. No execution was requested by this test.

## Remaining production gate

The delivered artifact is Markdown prose, not the complete structured engine
response. Its handoff repeats `$.evidence` and `$.selected`, but neither JSON path
can be resolved against the delivered Markdown document. Thus this test proves
readable delivery, not a strict parser-safe handoff for arbitrary agents.

Next change: deliver the actual task-bound JSON report (including selected,
evidence, agentHandoff, generatedAt, validUntil and reportId), optionally alongside
a readable summary. Validate referenced paths and exact identifiers at the
delivery boundary. Do not fabricate a reportId, alter immutable old reports, or
purchase another test automatically.

Not signed off here: governed trade execution, Sibyl memory, managed subscription,
integration-audit service, Base compatibility, repeated-run reliability, payment
release, or the entire production stack.

## Follow-up implementation

The worker now requires a new --report-out path for executed RESEARCH requests.
It validates and writes the full operator response as standalone JSON without
rewrapping, reconstructing, or changing timestamps. Runtime instructions require
this exact file for official delivery, with a readable message alongside it.
Real-engine regression fixtures cover AVAILABLE and UNAVAILABLE reports, JSON
path resolution, mismatched identifiers, non-authorizing flags, expiry shape,
and overwrite refusal. This closes the local format defect; a future authorized
live original-JSON delivery is still required to verify runtime compliance.
