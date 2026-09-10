# Local trade-memory release - September 10, 2026

## Changes

The executor guard now accepts native indented JSON while retaining exact saved-order binding checks and duplicate protection. Recovery finishes module evaluation before importing the memory adapter, avoiding a cyclic-import stall after a verified fill. A missing first-use ledger returns explicit incomplete-history guidance, never an invented clean trading history.

## Verified evidence

Production build passed. The isolated no-spend rehearsal passed 93/93 tests with no failures or skips, including the real Sibyl SDK and a regression for the recovery CLI import cycle. Machine evidence is in demo/sibyl-rehearsal-20260910.json and its log. The report records its pre-commit base and working-tree test changes honestly.

The separately authorized live 10-share BUY and SELL finalized. Both fills were captured and recalled by a fresh process, and the account was independently verified to have zero open positions. See the live-fill and live-sell JSON evidence in demo/. Total round-trip loss including fees: 0.31195 pUSD. No additional trade or payment was made during release verification.

## Deployment scope

Release changes cover the buyer-local scripts, provider checkout and public documentation. The existing local launcher already points at this tested checkout. Publish to main, allow the Render auto-deploy, and fast-forward the clean provider checkout to the same revision. No buyer credentials or memory stores are copied to the provider. Provider instructions are compared to the tracked file before declaring alignment.

## Remaining boundaries

Hosted governed memory acceptance is unproven. A continuous demo video is not yet recorded. No license file is tracked; choose a license before claiming licensed submission readiness. Public posts and hackathon submission are not part of this deployment. Other pre-existing worktree changes are excluded from this release.
