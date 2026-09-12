# LP Scout production hardening ? September 13

The owner confirmed expired trial access caused the prior payment interruption. Fresh unsigned OKX LP Scout requests returned HTTP 402 with the expected 0.30 USDT offer before this implementation stage. No payment was made.

## Changes

- Shared scout book validation requires matching token and condition identity, a source timestamp within 120 seconds (at most 5 seconds ahead), finite positive sizes, valid probability prices and tick size, and a nonempty uncrossed book. Invalid books cannot pass the safety screen or supply a last-trade-price fallback quote. Source timestamp and rejection reasons accompany candidate diagnostics.
- Requested markets that fail screening remain available as diagnostics with an explicit failed status and no order-placement instructions. Buyer prompts start with findings and receipt review. Defects route to operator review under the existing payment; fresh execution requires a separate preview, fee/balance checks and approval. These prompts do not implement automatic acceptance or correction.
- OKX LP Scout now writes a fail-closed Postgres intent before settlement, saves settlement before analysis, and saves completed responses for identical-request replay. The payment-header digest is a capability bound to the request; the reusable signature is not stored. An altered request is rejected. Completed replay avoids both payment verification/settlement and research. A PAID record can resume after restart without settlement.
- SETTLING ambiguity, RUNNING process loss and failed delivery require operator reconciliation. They never automatically charge again or repeat possibly incurred compute. This is deliberate: do not reset these states blindly. Existing activity receipts and reports remain unchanged.

## Recovery operator procedure

Find the returned lps_ job ID under durable key prefix polydesk:lp-paid-job:. SETTLING is an intent, not proof of payment. Match the buyer receipt with provider settlement evidence before deciding any recovery. PAID has saved settlement and can resume using the identical original header and request. DELIVERED returns the saved response. RUNNING or REVIEW_REQUIRED must be checked against activity receipts, saved reports and provider work before any controlled recovery. No new payment should be requested to repair the same paid delivery.

The new journal covers the OKX LP Scout route. The separate legacy Hash PayLink entry point does not gain journal recovery from this change. Source validation and buyer copy are shared. No automatic operator scanner, alert integration or autonomous recovery of ambiguous jobs is claimed.

## Verification

Focused tests exercise valid and invalid source books, duplicate and concurrent requests, changed request rejection, DB failure before settlement, uncertain settlement, analysis failure, completed replay, and simulated restart between receipt save and delivery. Existing receipt capability and ZeroScout single-flight tests remain included. 20 focused tests passed, and the server TypeScript check passed.

A live paid LP Scout delivery and real process-restart recovery remain to be verified with an approved payment. Simulated dependency tests are not a live settlement test. Do not describe all PolyDesk services as fully production-proven based on this change.

Reference for book identity fields: https://docs.polymarket.com/api-reference/wss/market
