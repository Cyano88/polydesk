# Integration Audit service delivery alignment

Scope: existing A2A Integration Audit service 40363, listed at 25 USDT per task. No new paid task, marketplace update, delivery, acceptance or payment is authorized by this code change.

## Changes

The operator retains schema 1.1.0 and its six controls and eight alignment checks. Missing checks still yield INCOMPLETE, failures require evidence and remediation, and scope exclusions need evidence and an explanation. This update adds an optional immutable delivery bundle:

```text
npm run audit:report -- --request SANITIZED_INPUT.json --out-dir NEW_TASK_REVISION_DIRECTORY
```

- audit-report.json: the original structured compilation, including exact task/buyer/report identity, historical timestamps, findings, checks, evidence manifest and verification boundaries.
- findings.md: a readable rendering of every control, alignment check, evidence reference, remediation and limitation, plus review and post-acceptance prompts.
- delivery-manifest.json: exact file byte counts and SHA-256 hashes bound to task, buyer, report and generation time. Written last; absent/failed manifest means no complete bundle.

The output directory must not exist. Files are created exclusively and read back for hash verification. Existing artifacts are not overwritten. These hashes attest to exported bytes, not truth of the supplied evidence.

The wrapper now labels price as the listed service price, with taskPaymentVerified=false. It does not misrepresent a test budget or compiler result as a paid 25 USDT audit. Both original JSON and summary retain evidenceIndependentlyVerified=false, marketplaceDelivered=false, and tradeAuthorized=false.

## Buyer flow

The active provider instructions require original JSON plus readable findings and hash manifest for accepted-task delivery. Show findings, failures, untested controls and limitations before review. A correction must preserve originals and identify what changed; an unavailable formal amendment path must not leave an authorized buyer request unanswered. Apply the shared clarification-notification rules.

After separately confirmed audit acceptance and payment state, offer Review the remediation plan or Define a separate re-audit scope. No automatic new paid audit or trading prompt follows an integration audit. Sibyl remains owner-authorized receipt context only where relevant, not storage for audit prose.

## Verification and limits

Focused suite: 17 tests passed, zero failed. New tests cover exact JSON preservation, all summary sections, hashes, failure remediation, unsafe Markdown escaping, invalid CLI options, and refusal to overwrite existing files/directories.

This service compiles assessed findings; the operator must independently collect and verify evidence against agreed scope/version. Export does not authenticate the marketplace task, prove sources, certify security, send a deliverable, or settle a task. A full authorized production-price audit delivery/review/settlement run remains outstanding. ZeroScout research and native trading execution are not automatically invoked by this audit compiler.

Server TypeScript checking passed. The full three-service run passed 183 of 184 checks; one pre-existing buyer-local CLI dry-run hit its 30-second subprocess timeout under parallel load. That exact test passed when rerun alone (11.5 seconds). No implementation or timeout was changed to hide the failure.
