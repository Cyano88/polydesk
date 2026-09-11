# PolyDesk external adoption metrics

Version: 1.0 design baseline, September 11, 2026. Instrumentation specification; no current adoption counts claimed.
Companion: [external integration contract](EXTERNAL_INTEGRATION_CONTRACT.md).

## Measurement objective

Measure whether external integrations produce repeat, authorized, verified service usage and incremental Onchain OS adoption. Traffic, wallet setup and unsigned previews alone are not success. Distinguish direct PolyDesk use, external partners, OKX.AI, operator tests and official marketplace reviews.

Primary metric: weekly active external integrations with at least one verified service delivery or finalized buyer-authorized execution. Count each authenticated partner application once per UTC week. Report delivered research, managed reports and executions separately, alongside the combined deduplicated count.

## Funnel and denominators

| Metric | Definition |
| --- | --- |
| Activated integration | Authenticated external application completes its first non-test verified delivery or execution |
| Time to first value | Median and p90 elapsed time from credential issuance to first verified outcome; report pending integrations separately |
| Activation rate | Integrations reaching first value within seven days / integrations issued credentials at least seven days ago |
| Qualified discovery conversion | Identified integration starts a valid request within seven days of its first catalog access / identified integrations with seven days observation; anonymous discovery reported separately |
| Service delivery success | Paid service jobs with verified delivery / settled jobs whose delivery deadline has elapsed; pending jobs and refunds shown separately |
| Signing completion | Independently verified Onchain OS signatures / buyer-authorized Onchain OS signing attempts; count one attempt per authorization |
| Execution success | Authorized executions with verified nonzero fills / submitted authorized executions whose reconciliation deadline elapsed; report partial, full, rejected and unknown separately |
| End-to-end trade conversion | Verified executions / approved trade previews, using matured cohorts; declined previews are reported separately, not treated as a product defect |
| Integration retention | Activated applications with a verified outcome in days 8-14 / applications activated at least 14 days ago; also report days 22-28 |
| External distribution share | Verified external-partner operations / all verified non-test operations, deduplicated by canonical operation ID |
| Onchain OS signer share | Verified executions linked to an authenticated Onchain OS signing adapter / verified executions with known signer provenance; report unknown provenance separately |
| Onchain OS connected cohort | Distinct pseudonymous owner/application connections with verified wallet authentication; not a claim of new OKX users |
| Verified new-wallet adoption | Count only where authoritative provider evidence establishes first creation and authorized attribution; otherwise label new-to-PolyDesk connection |
| Repeat Onchain OS usage | Connections with verified signing on at least two distinct days within 28 days / connections with a full 28-day observation window |
| Sponsored execution coverage | Eligible finalized on-chain operations with verified sponsor coverage / eligible finalized on-chain operations with known gas payer; exclude off-chain signatures |
| Report freshness | Median/p95 time from source observation to delivery acknowledgement; distinguish transport acceptance from buyer receipt or read |

Do not describe first-observed usage as causal acquisition. Incremental adoption needs consented referral/provider evidence or a controlled pilot comparison. Do not count a relayer transaction, signature and fill as three trades. Partial fills sum to one order's executed volume without counting unfilled amounts.

## Reliability, safety and economics

- Acknowledgement latency: p50/p95/p99 from authentic inbound request to actual outbound acknowledgement; AI stdout is not acknowledgement. Proposed launch SLO: p95 under 60 seconds during published operating conditions.
- Delivery latency and deadline breaches: measured per capability; publish realistic capability deadlines rather than a universal promise.
- Duplicate charge or execution incidents: target zero; page the operator on any confirmed occurrence.
- Cross-tenant disclosure or unauthorized financial action: target zero; suspend the affected path on a confirmed incident.
- Unknown payment/execution states: count and age buckets, time to authoritative reconciliation, and unresolved balance at period end.
- Corrections/refunds: jobs requesting correction, corrected deliveries, refund requests and actual completed refunds are separate metrics. A complaint alone does not establish abuse.
- Follow-up coverage: actionable responses containing valid nextActions / actionable responses. Proposed acceptance target 100%; test prompt correctness, not merely nonempty text.
- Gas/fee disclosure coverage: executable previews with current, complete cost evidence / executable previews. Launch gate 100%; unknown costs produce a blocked preview.
- Memory reliability: successful owner-scoped recalls, missing history, live-position mismatches and duplicate actions blocked. Do not store recalled contents in analytics.
- Revenue: service gross receipts, completed refunds, marketplace/payment costs, upstream research/data cost, eligible builder receipts and partner payouts as distinct reconciled amounts. Contribution margin is net receipts less attributable costs, not trade notional.
- Trade volume: sum verified fills by execution venue and collateral; show USD conversions separately with source/time. Signing volume is not OKX revenue.

## Event contract

Required envelope: eventId, schemaVersion, eventType, occurredAt, receivedAt, environment, evidenceClass, tenantId, applicationId, partnerId, marketplace, canonicalOperationId, correlationId, paymentAdapter, signerProvider, executionVenue, outcome, errorCode and evidenceReference where applicable.

evidenceClass: production, operator_test, synthetic, official_review or unknown. Classification is assigned by trusted infrastructure, not accepted from untrusted client claims. Unknown is excluded from headline production adoption until resolved. UTC timestamps; deduplication by eventId and canonical operation/state transition; support late arrivals and corrected/reorged chain evidence.

Events: integration.created, discovery.read, job.created, payment.required, payment.settled, delivery.verified, delivery.received, delivery.reviewed, correction.requested, wallet.connection_verified, preview.ready, preview.blocked, authorization.verified, signature.verified, execution.submitted, execution.reconciled, receipt.verified, subscription.enrolled, subscription.paused, subscription.event_delivered, memory.reconciled and refund.completed.

Emit server-side where possible. Client-only claims of wallet provider or conversion remain unverified. Never retain signing payloads, tokens, emails, prompts, raw findings, account balances or wallet addresses in analytics. Use tenant-scoped pseudonymous owner IDs; do not correlate users across partners without an explicit permitted purpose. Financial evidence remains in access-controlled operational storage; analytics stores references and minimum necessary aggregate amounts. Define retention and deletion policies before launch; proposed raw event retention 90 days with longer-lived non-identifying aggregates, subject to contractual requirements.

## Partner and OKX reporting

Weekly dashboard: active external applications; new-to-PolyDesk Onchain OS connections; verified signatures and executions; repeat usage; service delivery success; p95 acknowledgement latency; sponsored operation coverage; outstanding failures; reconciled economics. Slice by marketplace, adapter and capability. Export only authorized aggregate partner data and suppress small cohorts where identification is possible.

Monthly narrative: which external integration shipped, what verified usage followed, where users dropped out and which interoperability failures were fixed. Claim a distribution loop only when acquired integrations return and attract further independently attributable integrations. No fabricated targets, test volume or unverified wallet creation counts in partner pitches.

Instrumentation acceptance: reconcile a sample from request through payment, authorization, receipt and accounting; duplicate events leave aggregates unchanged; synthetic/review traffic stays excluded; a failed or refunded operation cannot appear as retained revenue; alternate signers cannot inflate Onchain OS adoption; delayed evidence updates the original cohort.
