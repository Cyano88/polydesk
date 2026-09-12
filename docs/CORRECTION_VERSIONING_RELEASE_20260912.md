# Correction versioning and buyer prompts — 2026-09-12

A second correction request could previously return the first issue without recording the new defect. This release adds correction rounds under the existing receipt and aligns prompts with acceptance eligibility.

## Contract

- First REQUEST: issue; no previous revision is required.
- Next REQUEST: issue plus previousRevisionHash matching the latest published correction. The same unresolved issue may be reopened by explicitly referencing that hash.
- An exact retry returns the existing round. A conflicting issue during a pending round returns CORRECTION_PENDING; an old request cannot overwrite the current round.
- PUBLISH: originalAnalysisHash, addendum and round. Round 1 remains compatible with the legacy call; later rounds require an exact round number.
- Published addenda are immutable. previousRounds preserves their issue, timestamps, content and revision hashes. Legacy round-1 records keep their existing hash.
- Partner correction requests validate the original request, transaction, payer, amount and network, then create the receipt correction before acknowledging the partner request. An interrupted acknowledgement can be retried without payment.
- Pending corrections invalidate current acceptance and return correction-status prompts. Unavailable AI never offers acceptance. Once a correction is published, the buyer must explicitly accept its new revision hash.
- Partner status displays the current canonical correction and CORRECTION_REQUIRED while pending, with CHECK_CORRECTION as the next action.

## Verification

74 focused tests passed across smart-trader, partner research, receipt corrections, acceptance, public API and delivery guidance. Production build and server TypeScript checks passed.

New regression coverage includes concurrent duplicate requests, two published rounds, same-issue reopening, legacy-record compatibility, stale publisher rejection, preserved original report and first correction hash, renewed partner acceptance, and ineligible prompt suppression. The complete two-round HTTP scenario uses synthetic records and does not invoke payment, research compute or order execution.

Existing original-report hash guards remain intact: an unexpected replacement of the underlying report fails closed. This release does not authorize changing the original evidence, auto-publishing a correction, accepting on the buyer's behalf, issuing refunds or trading.

Live verification is read-only against the already accepted receipt. No invented correction is added to a real buyer's report merely to test the release. Live results are recorded separately after deployment.
