# Existing-payment LP verification retry preview

Status: prepared; not executed. The timeout prerequisite is implemented and tested locally; deployment remains. See LP_TIMEOUT_BUDGET_VERIFICATION_20260914.md.

## Target and payment

- Original scout activity: `c8754d17-d1d5-4081-a190-0e347aa17d84`.
- Existing receipt activity: `d3278bce-b1c6-424e-aae6-e71582460986`.
- Existing payment: 0.30 USDT on X Layer. Additional buyer charge: 0.
- Scope: verify the saved September 12 scout, not run a new market scan.
- Preserve the original report and receipt. Save successful verification as a linked activity.

## Current evidence

A read-only activity check on September 14 still found the original scout and two legacy queue records, with no saved ZeroScout result. The legacy records do not demonstrate a running worker. The previous provider failure was correlated by time and workload, not a matching provider request ID.

The September 13 deployment evidence records LP Claude parameter compatibility repair at ZeroScout commit `12dcce829ff0b4ef938e8228aef1ee20c4eb244a`, with mocked LP, direct-trade and general-research regressions passing. Live inference success remains unverified.

## Execution prerequisite

The LP caller currently uses the shared 75-second timeout. The provider tries a deduplicated sequence of configured LP, general, helper and verifier models plus DeepSeek and GLM, using 30-second attempt timeouts. Optional verification and storage add work. The provider has no LP-wide deadline, so the caller can abort while provider work continues.

Before executing, implement and test an LP-only overall compute deadline, reserve time for proof persistence and response delivery, and make the LP caller timeout exceed that bounded provider budget. Explicitly disable HTTP retries for this repair. Do not change the shared normal-research timeout or public research schema. Merely increasing a global timeout is insufficient.

## Controlled execution contract

1. Recheck for an existing completed result immediately before starting; reuse it if present.
2. Validate the original agent, scout and matching saved payment proof.
3. Submit one verification request under that proof, with no payment call and no fresh market scan.
4. Preserve the original report. Require proof and persist the result linked to the source activity.
5. If the caller ends without a result, stop and reconcile provider completion before any further request. Do not label it as an automatically running retry.
6. Show findings, proof and remaining gaps before asking for delivery acceptance.

Provider compute credits may be consumed by the retry even though the buyer owes no additional payment. Current single-flight protection is process-local; this preview does not claim durable exactly-once provider execution.

## Acceptance criteria

- Explicit historical-data disclosure; no current trade recommendation based on the old snapshot.
- Preserve 80 scanned, zero passed, eight disclosed rejected candidates and the missing detail for the other 72. Do not fabricate missing evidence.
- Keep reward-spread eligibility separate from the full safety screen.
- No trade, new payment or automatic delivery acceptance.
- Normal market research input/output schemas and regression behavior remain unchanged.

Next prompt: Deploy the LP timeout fix and verify both services without rerunning research.
