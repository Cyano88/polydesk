# Direct 0G research migration

PolyDesk smart-market research, A2A research and research recovery use the configured 0G OpenAI-compatible API directly. Set POLYDESK_0G_API_KEY, POLYDESK_0G_MODEL=glm-5.3, POLYDESK_0G_BASE_URL=https://router-api.0g.ai/v1 and POLYDESK_0G_TRUST_MODE=private.

The existing result schema and evidence.zeroScout compatibility field remain. aiProvider identifies the actual compute provider. No ZeroScout HTTP dependency remains in this research path. Other legacy products are outside this migration.

Only selected market evidence is sent. Unknown result fields, incorrect side, truncated output and tool calls are rejected. There is no automatic model retry or fallback. Missing TEE flags are reported as unverified; Private routing is requested but is not independent attestation. No archive proof or secondary reviewer output is fabricated. VeilDesk's stricter private worker remains disabled and is not included in this deployment.

Independent football news remains. ZeroScout general-web-search retrieval is removed; missing news remains a gap. Direct inference does not provide web retrieval. Research without stored proof cannot authorize automatic trade preparation under the existing policy. Trade execution remains separately authorized.

Validation before release: live synthetic glm-5.3 response passed schema validation; 72 research/A2A/routing tests, adapter tests and server TypeScript passed. The provider returned no tee_verified flag, correctly recorded as false. No payment or trade was performed. Catalog readiness checks do not prove account balance or inference availability.