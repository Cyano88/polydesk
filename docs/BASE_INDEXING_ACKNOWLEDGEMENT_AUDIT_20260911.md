# Base indexing acknowledgement investigation

Existing payment only: 0x6aae292456541a754d9b20b1e0347afbe0aef5422e94ac7f0ac410d6dbf3b0ae. No payment replay, verification submission with signed proof, settlement, or new authorization was performed.

Confirmed observations:
- Coinbase validator accepted the endpoint and Bazaar metadata before payment; saved validation evidence is available.
- Research payment succeeded and the completed delivery plus correction were accepted.
- Domain-filtered catalog search at 2026-09-11T16:46:54Z returned resources=[] and partialResults=false. Prior domain, recipient and name searches also returned no resources.
- Installed @x402/core HTTP facilitator parsing preserves EXTENSION-RESPONSES in result.extensionResponses. Its encodePaymentResponseHeader explicitly deletes extensionResponses; createSettlementHeaders returns only PAYMENT-RESPONSE.
- PolyDesk forwards settlement.headers but does not save settlement.extensionResponses in its durable Base attempt or paid-delivery record. Payment-time Render log search for bazaar/extensionResponses/EXTENSION-RESPONSES/rejectedReason returned no entries. The matching local client audit entry contains command metadata, not an acknowledgement.

Conclusion: a confirmed acknowledgement-retention gap prevents diagnosing this historical indexing outcome from the inspected records. It is not evidence that Coinbase rejected indexing. Missing paymentPayload.resource, schema rejection and asynchronous processing remain possibilities, not established causes. Validation acceptance is distinct from settlement indexing acceptance. A six-hour ranking refresh is not proof of an indexing delay.

Next engineering change: persist a bounded, sanitized Bazaar acknowledgement (status and rejection reason when present) alongside the original settlement attempt and resource URL; expose absent acknowledgement as UNKNOWN, never as success. Preserve successful payment even if observability storage fails, and never trigger another settlement to obtain metadata. Unit-test success/processing/rejected/absent/malformed responses. The historical acknowledgement cannot be reconstructed by that change.

External follow-up: ask Coinbase to inspect the existing transaction/resource indexing event. A support draft is saved separately and has not been sent. Do not pay again merely to trigger discovery.

Reference: https://docs.cdp.coinbase.com/x402/seller/get-discovered documents EXTENSION-RESPONSES and Bazaar success/processing/rejected statuses.

## Persistence implementation

Future successful Base settlements store indexingAcknowledgement in the same durable write as the transaction. It contains the fixed canonical resource URL, observedAt, success/processing/rejected/unknown status and a short machine-readable rejection reason when safe. Missing or malformed metadata is explicitly unknown; raw headers, signatures and arbitrary facilitator data are not stored. Free-form rejection reasons are withheld to avoid persisting echoed credentials. The response exposes X-PolyDesk-Indexing-Status alongside the existing X-PolyDesk-Payment-Attempt-Id. Operators can inspect the durable attempt using that identifier.

Replay/recovery preserves the original acknowledgement. Finalized-chain recovery without captured acknowledgement records unknown, never inferred indexing success. No additional database write or settlement is introduced. A failed settlement-record write follows the existing no-repay recovery path. This change cannot recover the historical acknowledgement for the already-completed test payment.

## Deeper audit: discovery payload forwarding

Reproduced with the installed real HTTPFacilitatorClient and an intercepted synthetic transport: passing a buyer payment payload without resource/extensions results in /verify receiving neither, even when the server advertises Bazaar in its challenge. Registered Bazaar enrichDeclaration augments quote metadata, not the facilitator payment payload. HTTPFacilitatorClient sends paymentPayload and paymentRequirements only. Passing declaredExtensions to processSettlement does not itself copy Bazaar into that payload.

Fix: a server-owned facilitator adapter injects the canonical resource and server-enriched Bazaar declaration on both verify and settle. It preserves the exact signed payload, accepted payment terms and other extensions; rejects a conflicting resource URL; and replaces untrusted buyer Bazaar metadata with the server declaration. Missing discovery metadata cannot silently pass through. The persisted settlement acknowledgement from the previous change remains in place.

A second defect was an ANALYZE example without outcome, despite live preflight requiring it. The example now includes Yes and an exact-question query. The discovery JSON Schema conditionally requires outcome, side and a research target for ANALYZE. A schema test rejects the incomplete example. Example questions are illustrative; agents must resolve a currently active market before payment.

These are reproduced integration defects, but the original signed client payload was not recovered. Therefore they are not conclusive proof of the historical indexing failure. The existing payment must not be repeated to diagnose or repair indexing. Live validator acceptance after deployment tests metadata shape/reachability; future facilitator acknowledgement or Coinbase reprocessing of the historical event is needed to prove actual cataloging.
