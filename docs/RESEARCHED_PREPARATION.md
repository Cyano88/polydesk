# Research-bound unsigned preparation

Local implementation; not yet deployed. Existing PREPARE callers retain the
legacy plugin handoff. POST `/api/polymarket-researched/prepare` supplies the
complete unsigned preparation contract for the buyer adapter.

Required: researchDecisionId, researchAnalysisHash, externalOrderId, ownerAddress,
marketUrl, conditionId, tokenId, outcome, side=BUY, maxSpendUsdc, maximumPrice,
orderType=FAK or FOK. Optional wallet must match the owner-derived deposit wallet.
No caller receipt, independent acknowledgement, signature or credential accepted.

The endpoint reads durable research, validates integrity, payment/proof binding,
expiry and supportive evidence, runs existing PREPARE eligibility checks, then
checks current wallet/book readiness and binds the exact buyer limits, research
ID/hash and shortened expiry into the canonical mandate. It does not purchase
research, sign, submit an order or write memory. Expired/unavailable/ESCALATE
research does not cause a retry or independent-mode fallback.

Buyer source uses acknowledge_independent_decision=false and research_binding
containing researchPolicy=zeroscout-approved-v1, researchDecisionId and
researchAnalysisHash. Independent review still requires true and null binding.
The API-owner identifier remains local and is never sent to preparation.

Separate execution must still verify stored research, exact SDK share amounts,
wallet ownership, eligibility, freshness and buyer consent. Preparation is not
trade authorization. The previously frozen buyer archive remains unchanged;
rebuild and audit a new candidate before distribution.
