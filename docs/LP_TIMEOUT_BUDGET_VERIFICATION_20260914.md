# LP timeout budget: local implementation and verification

Status: implemented and tested locally; not deployed. No live inference, payment, trade, or saved delivery mutation was performed.

## Change

ZeroScout LP primary analysis and optional verifier now share a 90-second deadline. Each model attempt, including its format/trust fallbacks and response parsing, has at most 30 seconds or the remaining total budget. Timeout aborts the transport and rejects the local wait even if the operation does not resolve. LP transport fallbacks check cancellation before sending another request.

PolyDesk passes an explicit 180-second timeout and zero HTTP retries for saved LP verification only. The extra 90 seconds allows proof storage and response delivery after compute. Shared request defaults, general-research request/result schemas, model selection and payment handling are unchanged. The original scout and receipt remain intact.

## Offline evidence

- Four new mocked-clock/network tests passed: hung-operation cancellation, shared remaining verifier budget, no fallback request beyond 90 seconds, and verifier transport timeout.
- LP compatibility smoke passed for Messages and chat-completions, including normal intelligence parameter control.
- Direct-trade intelligence smoke passed.
- General-research provider smoke passed.
- Eleven PolyDesk receipt access, report evidence and general-research tests passed.
- ZeroScout server build and PolyDesk server typecheck passed.
- Reviewed scoped diffs; whitespace checks passed.

## Limits and release order

The storage SDK has no LP-specific cancellation deadline. The 90-second storage allowance is a reserve, not a guaranteed storage completion time. A timeout after compute can still mean provider completion is unknown; reconcile before another request. Aborting a transport does not prove remote inference was cancelled or that compute credits were not consumed.

Deploy ZeroScout first, then PolyDesk; verify both deployed revisions and read-only health before the controlled existing-payment retry. Deployment and live retry have not been performed as part of this local verification.

Next prompt: Deploy the LP timeout fix and verify both services without rerunning research.
