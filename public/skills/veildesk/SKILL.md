---
name: veildesk
description: Discover VeilDesk by PolyDesk capabilities and validate encrypted research envelopes. Use for VeilDesk integrations and private prediction-research setup, not general trading or wallet operations.
---

# VeilDesk by PolyDesk

Use the operator-configured PolyDesk base URL. GET `/api/veildesk` first. Require schema `veildesk.discovery.v1`; treat missing, unknown or unavailable capabilities as unsupported. Do not infer readiness from brand names or this skill.

This public discovery surface supports discovery and encrypted-envelope structure validation only. It cannot submit research, deliver reports, accept payment or trade. The separately enrolled paid SDK pilot is described below; it does not extend this skill authority. Do not invent an OKX.AI service ID or forward jobs to PolyDesk's unrelated marketplace services.

For validation, POST the encrypted envelope to `/api/veildesk/validate` with Content-Type application/json. Accept exactly version, id, direction, ephemeralPublicKey, salt, iv and ciphertext. Never send plaintext briefs, credentials, seed phrases or private keys. The API validates structure only; HTTP 200 does not prove authenticity, successful decryption, delivery or payment. `acceptedForResearch` remains false.

The local MCP adapter is `node --import tsx scripts/veildesk-mcp.ts` from an installed PolyDesk checkout. It exposes only `veildesk_capabilities`. Hosted MCP is not available. Paid research is not exposed by this PolyDesk MCP adapter.

Do not promise anonymity: the intended recipient sees plaintext, network metadata may remain visible and Polymarket trades are public. Explicit disclosure to PolyDesk does not authorize a trade. ZEC marketplace-payment compatibility has not been verified.

Read `/docs/veildesk` for the full contract and current integration status. If an action is unavailable, report it and stop that action rather than substituting a public request or payment.

## Authenticated previews

The separate `/api/veildesk/previews` API uses a Privy bearer token and accepts a
plaintext preview mandate over HTTPS. PolyDesk encrypts it for the provider; both
PolyDesk and the provider can see the mandate. Use it only with explicit approval
to disclose the mandate to both. Check discovery.previewApi.enabled first. The
skill does not acquire tokens or authorize trades. See the integration guide for
its exact schema and ownership/retry rules. The MCP tool remains discovery-only.


## Separate paid SDK pilot and standalone MCP

A controlled mainnet PolyDesk research purchase completed on 28 October 2026.
The standalone VeilDesk paid SDK requires operator enrollment, pinned provider
keys, persistent buyer state, an explicit payment ceiling and separate wallet
authorization. This skill does not enroll buyers, supply wallet authority or
expose a paid HTTP endpoint. `submitPaymentHint` references an existing transaction;
it does not send ZEC. Read the integration guide and stop if enrollment is absent.

VeilDesk's own `scripts/mcp-server.mjs` is a different adapter from PolyDesk's
MCP: it exposes capabilities, submit preview and get preview. It refuses paid
capabilities and has no payment tools. Never invent paid tools on either adapter.

PolyDesk owns research and its retrieval/inference configuration. VeilDesk handles
private coordination, authenticated invoice binding, settlement verification and
encrypted delivery. OKX AI listing and external ZEC marketplace eligibility remain
unverified. Do not present the recorded pilot as public access or audited production.
