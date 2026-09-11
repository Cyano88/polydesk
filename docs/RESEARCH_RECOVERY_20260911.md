# Receipt-bound research recovery

POST `/api/a2mcp/polymarket-smart-trader/payment/:transaction/recover-research` with the existing operator bearer and exactly `{"action":"RECOVER_RESEARCH"}`.

Only a persisted 0.30 USDC Base/CDP receipt with unavailable research is eligible. Readiness must pass first. The existing durable executor claims the original request, verifies its hash and payer, rejects concurrent work and retains the six-attempt ceiling. This endpoint never settles another payment or submits a trade. Public receipt possession is insufficient authority.

The original decision remains available at its decision URL; recovery records the previous decision ID and analysis hash. Save original delivery JSON before recovery. Successful available research cannot be recomputed with this endpoint. Check the returned status URL for actual AI availability, not merely HTTP success. After a timeout, check status before requesting another recovery.

Buyer follow-up: "Recover this research delivery without another payment". The buyer-facing operator performs this authorized action; do not distribute the operator credential to partners. After recovery: "Show results", then "Review the recovered delivery". Acceptance remains separate from payment settlement and trading.

2026-09-11 audit: provider returned HTTP 429 `Private usage limit reached`. Its middleware charged readiness probes against the same minute/day budgets as actual research. Repeated quotes can consume the five-call minute allowance. Provider fix separates a bounded 30/min readiness allowance, does not consume compute or leases, and checks two compute calls of headroom for direct research. This is a capacity check, not a reservation; concurrent demand may still consume capacity. The precise historical quota bucket was not independently recovered. No limits were raised or reset.

Validation: eight PolyDesk recovery/correction tests, seven provider access/readiness tests, and both server type checks/builds passed. Live recovery pending deployment verification.
