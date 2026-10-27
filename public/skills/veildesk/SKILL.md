---
name: veildesk
description: Discover VeilDesk by PolyDesk capabilities and validate encrypted research envelopes. Use for VeilDesk integrations and private prediction-research setup, not general trading or wallet operations.
---

# VeilDesk by PolyDesk

Use the operator-configured PolyDesk base URL. GET `/api/veildesk` first. Require schema `veildesk.discovery.v1`; treat missing, unknown or unavailable capabilities as unsupported. Do not infer readiness from brand names or this skill.

Current preview supports discovery and encrypted-envelope structure validation only. No research submission, delivery, payments or trades. Do not invent an OKX.AI service ID or forward jobs to PolyDesk's unrelated marketplace services.

For validation, POST the encrypted envelope to `/api/veildesk/validate` with Content-Type application/json. Accept exactly version, id, direction, ephemeralPublicKey, salt, iv and ciphertext. Never send plaintext briefs, credentials, seed phrases or private keys. The API validates structure only; HTTP 200 does not prove authenticity, successful decryption, delivery or payment. `acceptedForResearch` remains false.

The local MCP adapter is `node --import tsx scripts/veildesk-mcp.ts` from an installed PolyDesk checkout. It exposes only `veildesk_capabilities`. Hosted MCP and paid research are not available.

Do not promise anonymity: the intended recipient sees plaintext, network metadata may remain visible and Polymarket trades are public. A future explicit disclosure to PolyDesk does not authorize a trade. ZEC marketplace-payment compatibility has not been verified.

Read `/docs/veildesk` for the full contract and current integration status. If an action is unavailable, report it and stop that action rather than substituting a public request or payment.

## Authenticated previews

The separate `/api/veildesk/previews` API uses a Privy bearer token and accepts a
plaintext preview mandate over HTTPS. PolyDesk encrypts it for the provider; both
PolyDesk and the provider can see the mandate. Use it only with explicit approval
to disclose the mandate to both. Check discovery.previewApi.enabled first. The
skill does not acquire tokens or authorize trades. See the integration guide for
its exact schema and ownership/retry rules. The MCP tool remains discovery-only.
