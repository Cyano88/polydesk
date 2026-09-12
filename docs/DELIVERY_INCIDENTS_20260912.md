# Durable delivery incidents and scan recovery — 2026-09-12

Failure alerts are operator-visible records of paid research that needs attention. They do not debit a buyer, initiate a trade, grant approval or automatically request new AI research. Acknowledgement means an operator has seen the incident; resolution requires observing a healthy completed delivery.

## Implemented

- Paid-record scans use stable key pagination with a durable cursor, 100 records per sweep. A recreated worker resumes the cursor; completed records cannot trap every sweep on the same first 100 rows. The cursor wraps at the end so changed older records and new records behind the cursor are eventually revisited.
- Alert classification is independent of recovery eligibility. It includes unavailable research, overdue delivery (five minutes), failed delivery, missing or incomplete research, invalid timestamps and exhausted retries.
- Existing recovery eligibility and payment binding are retained. At most four recovery attempts run per sweep under existing settled receipts. Creating/reading/acknowledging incidents cannot call the recovery function.
- Incidents persist in Postgres, deduplicate by receipt, carry a version and episode count, and have OPEN, ACKNOWLEDGED and RESOLVED states. Changed failures reopen acknowledgement; a recurring failure reopens a resolved incident.
- A durable heartbeat records last start, successful scan, full traversal, failure code and counters. The operator response reports NOT_OBSERVED, HEALTHY, STALE or FAILED. Staleness uses three recovery intervals, with a minimum three minutes. A successful scan is not proof every job is healthy.
- Raw exception messages are not stored in incidents. All monitor routes require the operator bearer credential and return Cache-Control: no-store.

## Operator API

GET /api/operator/delivery-incidents returns heartbeat, incidents and a nextCursor. Pass it as `after` to list another page; resolved records remain visible. This endpoint reads state; it does not run a sweep.

POST /api/operator/delivery-incidents/{id}/acknowledge takes `{"version":1}` using the exact currently displayed version. Identical acknowledgement is idempotent. Changed or resolved incidents reject stale acknowledgement. This action cannot retry compute, pay, settle or trade.

Follow-up: review the incident, inspect its original delivery, then decide whether the existing authorized recovery path or a correction is appropriate. Never interpret an acknowledgement as buyer acceptance or proof that a defect was fixed.

## Verification

113 focused tests passed across payment recovery, research recovery, degraded delivery, smart-trader and the new monitor. Monitor coverage includes a job after 100 completed rows, cursor recovery after service recreation, independent degraded/exhausted incidents, four-attempt execution limit, concurrent incident deduplication, acknowledgement/reopen behavior, failed sweep heartbeat, stale heartbeat, recovery failures and authenticated API behavior. Production build/server checks and live verification are recorded with the release.

## Limits

No email, webhook or other external notification transport is enabled. The response explicitly reports notificationDelivery=DISABLED. An operator must poll the authenticated endpoint until a destination and test send are separately authorized. If Postgres is unavailable, the service cannot persist a new incident; the endpoint fails and the last stored heartbeat becomes stale. This is not a replacement for an independent uptime monitor or a tested backup/restore process.

At scale, detection latency is a complete cursor traversal (100 records per configured interval), not a guarantee of instant notification. Malformed stored records fail the sweep and expose FAILED heartbeat for operator investigation. Existing automatic recovery may still consume provider capacity under an already-settled job; this release adds no payment authorization and does not make degraded research auto-retryable.
