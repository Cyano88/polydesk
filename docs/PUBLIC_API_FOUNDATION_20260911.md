# Public API foundation release

Implemented: free GET /api/v1/capabilities, /api/v1/openapi.json and /api/v1/markets. Shared operation metadata generates discovery and OpenAPI. Market search reuses discoverPolymarket; no new payment or trading path. API responds with request IDs, no-store, structured nextActions and bounded errors. Existing rate limiting applies. MCP, external jobs, subscriptions and unified fee-inclusive previews remain planned.

Documentation: platform quickstart, agent llms.txt index, existing manifest links, API surface and external design status. Replaced obsolete migration instruction with a warning that compatibility IDs require current marketplace verification.

Verification: eight HTTP/public-surface tests passed; server typecheck passed. Production build status is recorded in the task response. No paid live request or trade performed. Operator routes and unrelated working changes preserved.

Follow-up: tenant-scoped identity and durable jobs/payment recovery, followed by unified fee-inclusive previews and MCP. This release establishes discovery, not the full external integration contract.
