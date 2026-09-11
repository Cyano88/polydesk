# Partner access and durable discovery jobs

Implemented scope: authenticated free market-discovery jobs. Paid research, escrow review, trade execution and external monitoring are not enabled through these routes. API authentication is not payment or wallet authority.

## Provisioning

An operator provisions a separate key for each tenant/application using:

```sh
node scripts/partner-key.mjs --tenant partner-name --app service-name --out /private/new-partner-directory
```

Use an access-controlled directory outside the repository. On Windows enforce restrictive directory ACLs; POSIX mode flags alone do not establish Windows access control. The helper refuses existing directories and never prints the secret. Import server-record.json into the JSON array in the server-only POLYDESK_PARTNER_KEYS_JSON environment variable. It contains a SHA256 hash, never the raw credential. Send partner-key.txt through an approved secret channel, never chat, source control or logs. No live partner credentials are created automatically by deployment.

Keys expire after 90 days by default and have jobs:read, jobs:create and jobs:resume scopes. Remove unwanted scopes before installing the record. Create and resume also require jobs:read. Rotate by adding a new key record with the same tenant/application, distributing it securely, then revoking the old record. Set revoked=true or remove it and reload the service configuration to revoke. Keys are not OAuth credentials; MCP remains unimplemented. Shared operator secrets are never accepted.

DATABASE_URL or POSTGRES_URL is required for jobs. Missing/malformed key configuration or unavailable storage returns 503; invalid, expired or revoked credentials return 401. Scope failure returns 403. No in-memory production fallback.

## Requests

Read /api/v1/openapi.json for the exact shapes. Supply Authorization: Bearer <partner-key> in a server-side client, never a public browser bundle. Use a stable Idempotency-Key of 8-128 ASCII letters, digits or _.:- on POST /api/v1/jobs:

```json
{"capability":"market-discovery","input":{"q":"Manchester United","intent":"next EPL match"}}
```

This creates a durable record before attempting a free public search. The response includes jobId, status, result, status/resume URLs, payment.required=false and nextActions. A successful search can complete within the initial response. 202 indicates stored or running work, never delivered findings. No webhook or autonomous queue worker is promised.

GET /api/v1/jobs/{id} reads persisted status only. POST /api/v1/jobs/{id}/resume with an empty body resumes queued, failed or expired-lease work. Resume needs its own scope. A running job has a 60-second lease; wait and check status rather than starting a duplicate. At most three search attempts are allowed per job. Contact the operator after exhaustion. Completed jobs never rerun through resume.

Retry the original POST with the SAME idempotency key and business input after a lost response. It returns the original record, including a RUNNING or FAILED record that may need explicit resume. Changed input with the same key returns 409. Reuse the same tenant/application when rotating credentials. A new application has no access to another application's jobs even within the same tenant; return 404 rather than reveal its existence.

Durability uses the existing Postgres transactional key/value store and advisory locks. Concurrent creation serializes before a row exists. Lease tokens fence late writes from an old worker. A storage failure after search is recovered through the original job; only repeatable free reads may rerun. This is not exactly-once external execution and must not be reused for payment or trading effects.

No automatic pruning is enabled in this initial release: jobs and idempotency bindings persist until an operator-managed retention/deletion policy is introduced. Deleting a record deletes its retry protection; do not delete it while clients may recover it. Public market inputs/results only; do not submit secrets or private personal data in queries. Metrics instrumentation is separate and not yet active.

## Validation

`node --import tsx --test scripts/partner-jobs.test.ts scripts/public-api.test.ts`

`node --import tsx scripts/partner-jobs-postgres-proof.ts` with a designated database proves persistence across a fresh process using synthetic market output. It stores a clearly named operator_test job and makes no upstream market, wallet, payment or trade call. The proof does not establish live partner onboarding or paid-job recovery.
