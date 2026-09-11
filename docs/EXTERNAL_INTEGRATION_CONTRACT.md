# PolyDesk external integration contract

Version: 1.0 design baseline, September 11, 2026.
Status: finalized specification. The public read foundation implements /api/v1/capabilities, /api/v1/openapi.json and /api/v1/markets; partner-authenticated free discovery jobs now implement POST /api/v1/jobs, GET /api/v1/jobs/{id} and POST /api/v1/jobs/{id}/resume. The broader paid-job, review and execution operations below remain proposed; see PARTNER_JOBS.md. Existing routes retain their published contracts. Deployment evidence belongs in the release record.

## Purpose and architecture

Let agents and platforms offer PolyDesk services through their own products and marketplaces. Maintain one service core with HTTP, MCP and marketplace adapters. Do not duplicate business logic or run arbitrary caller instructions in the provider's operator environment.

Three core offers remain: One-Off Polymarket Trade, Managed Polymarket Agent, and Polymarket Integration Audit. Market discovery, research, football data, LP Scout, readiness, preview, receipt and memory are reusable capabilities. Marketplace packaging may expose selected capabilities; availability must be explicit, not inferred from the three offers.

External agent -> HTTP or MCP adapter -> scoped identity, payment and authorization gates -> PolyDesk service core -> evidence and next actions.

Onchain OS is the reference buyer-controlled signer. Other compatible signers can be supported through independently verified adapters. Polymarket is the execution venue. Sibyl provides owner-scoped memory, not authorization. Hash PayLink remains the hosted funding checkout and its payment-receipt authority. Base service payments and OKX service payments retain their own settlement authorities; do not send every payment through Hash PayLink or generate substitute settlement receipts.

Marketplace, payment network and execution network are separate fields. An agent originating on Base can purchase supported services on Base while a Polymarket trade settles on Polygon. This does not establish support for arbitrary payment tokens, chains, wallets or marketplaces.

## Audited foundation and gaps

Inspected server.ts, api/a2mcp-services.ts, api/base-agentic-market-smart-trader.ts, api/polydesk-managed-agent-subscription.ts, public/skills/polydesk/SKILL.md and src/pages/docs/DocsPlatforms.tsx in polydesk-memory-release. Read the live discovery manifest on September 11.

- Existing: public manifest, capability schemas, HTTP endpoints, Base x402 research adapter, governed trade preparation and receipt routes, owner-authorized memory reads, OKX task orchestration and managed delivery.
- No MCP transport or OpenAPI document was found in the inspected server, package dependencies and public file inventory. A route named a2mcp is not proof of a standards-compliant MCP server.
- Managed subscription HTTP access currently uses operator authentication. It must not be exposed to partners by sharing an operator secret. Partner scopes and resource ownership need a separate gateway.
- Live manifest still declares Base awaiting-live-settlement and contains legacy marketplace migration text and IDs. Reconcile each claim against exact receipts and current official listing data before publishing a new catalog. Do not upgrade status simply because code is deployed.
- Current public docs describe polling and allowlisted destinations. Arbitrary callbacks remain unsupported.
- This is a targeted integration audit, not a full security audit or a fresh end-to-end test of every retained capability.

## Proposed public surfaces

All paths are under https://polydesk.trade. Publish only after the release gates below pass.

| Surface | Contract |
| --- | --- |
| /.well-known/polydesk.json | Versioned catalog: per-capability lifecycle status, supported adapters, prices/quote links, schemas and evidence coverage |
| /api/v1/openapi.json | Generated OpenAPI contract for the public HTTP surface |
| /api/v1/capabilities | Free discovery; explicit transport, payment, signer and execution compatibility |
| /api/v1/jobs | Create bounded research, audit or trade-preparation work; return durable job and status URL |
| /api/v1/jobs/{id} | Owner/tenant-scoped status, findings, original JSON and artifact links |
| /api/v1/jobs/{id}/review | Separate ACCEPT_DELIVERY or REQUEST_CORRECTION action; adapter declares any settlement consequence |
| /api/v1/trade-previews | Signing-only or research-backed preview with readiness and cost evidence |
| /api/v1/executions | Record an authorized execution handoff; no generic arbitrary transaction relay |
| /api/v1/executions/{id} | Reconcile submission, partial fills and final evidence |
| /api/v1/subscriptions | Scoped enrollment, preferences, pause, resume and cancellation |
| /api/v1/subscriptions/{id}/events | Cursor-based durable event delivery; acknowledgement is separate from trade authorization |
| /mcp | Standards-compliant Streamable HTTP facade over the same operations |
| /docs/platforms | Quickstart and compatibility matrix |
| /docs/api and /docs/mcp | Generated reference, client configuration and recovery examples |
| /docs/signing and /docs/payments | Onchain OS setup, compatible signers, gas, fees and settlement boundaries |
| /docs/partners | Distribution attribution, billing and reporting terms |
| /skills/polydesk/SKILL.md and /llms.txt | Concise agent guidance and links to authoritative contracts |

Existing routes stay available during migration. Add deprecation dates and migration examples before removal. One schema source must generate validation, OpenAPI, MCP tool input/output schemas and documentation.

MCP launch tools: list_capabilities, discover_markets, create_job, get_job, review_delivery, prepare_trade, get_execution, manage_subscription and get_subscription_events. Execution submission is enabled only for adapters with verified buyer authorization. Descriptions and tool annotations aid clients but never replace server-side enforcement. Pin a tested MCP protocol/SDK version and publish compatibility results. MCP does not automatically give a client x402 payment support: unsupported clients receive structured PAYMENT_REQUIRED with an approved payment handoff and resume token; never embed payment signing secrets in MCP arguments.

## Identity, privacy and permissions

Anonymous callers may read public docs, catalog and bounded public market data. Public paid stateless research may use verified payment proof without requiring OKX login. Private jobs, subscriptions and memory require authenticated resource ownership as well as any payment entitlement.

Partner access uses revocable, scoped credentials bound to tenant and application. HTTP partner keys stay server-side. Protected remote MCP uses standards-based OAuth with resource audience validation and protected-resource metadata; machine clients use a supported machine authorization flow, not a shared operator account. API authentication does not confer wallet authority.

Keep caller, end owner, service payer, trade signer and beneficiary distinct. Derive authenticated identity server-side. Caller-supplied owner/agent/partner IDs alone prove nothing. Enforce tenant ownership on every result, cursor, artifact, subscription and execution lookup. Opaque IDs are not access control. Public receipts must be deliberately redacted; private findings and wallet histories are not public by default.

Never accept wallet passwords, seeds, private keys, reusable CLOB secrets, wallet sessions or shell commands. Signed bounded payloads are accepted only by their specific validated operation. Partners retain their own user experience and signer environment. Onchain OS authentication happens there, not in PolyDesk's provider wallet.

## Request, response and retry semantics

Mutations require Idempotency-Key, scoped to authenticated tenant, operation and canonical business input hash. Same key and identical body returns the same durable operation; changed body returns 409 IDEMPOTENCY_CONFLICT. Payment proof retries bind to the same operation. Retain deduplication records throughout the payment dispute/recovery window; publish the exact retention policy before launch.

Common response fields: schemaVersion, requestId, jobId or executionId, status, observedAt, expiresAt where relevant, result, evidence, costs, payment, authorization, nextActions and links. Unknown values are null with an explicit reason, never zero or success. Amounts use decimal strings plus asset identifier, decimals and chain ID; do not add unlike assets into a misleading total.

Job states: AWAITING_INPUT, AWAITING_PAYMENT, QUEUED, RUNNING, AWAITING_REVIEW, CORRECTION_REQUESTED, COMPLETED, FAILED, CANCELLED. HTTP 202 means accepted for processing, not delivered. Paid-HTTP work may complete without escrow review; record its settlement model explicitly. On-chain marketplace jobs follow the platform's authoritative state, not an invented local deadline.

Execution states: AWAITING_APPROVAL, READY_TO_SIGN, SIGNED, SUBMITTING, SUBMITTED, PARTIALLY_FILLED, FILLED, CANCELLED, EXPIRED, REJECTED, UNKNOWN. Terminal order status and position state are separate. UNKNOWN blocks resubmission until reconciliation; cancellation does not undo fills.

Standard errors include AUTH_REQUIRED, FORBIDDEN, UNSUPPORTED_CAPABILITY, INPUT_AMBIGUOUS, PAYMENT_REQUIRED, PAYMENT_UNCERTAIN, INSUFFICIENT_FUNDS, SPONSORSHIP_UNAVAILABLE, PREVIEW_EXPIRED, AUTHORIZATION_MISMATCH, UPSTREAM_UNAVAILABLE and RATE_LIMITED. Include retryable, retryAfter, existing operation ID and safe next action. Never prompt a second payment to repair an unresolved first payment.

## Gas, fees and signing-only execution

Signing an off-chain order has no blockchain gas cost. Wallet deployment, collateral approvals, transfers, bridge operations and redemption may require on-chain gas. Sponsorship must be verified for the exact account and operation; Onchain OS login is not proof of sponsorship. Gasless does not mean zero trade, service, bridge or builder fees.

Every executable preview must contain:

- Exact market, outcome token, BUY/SELL, quantity or maximum spend, order type, limit price, expiry, signer, trading account, beneficiary and execution network.
- signing.blockchainGasRequired=false for off-chain signing; any separately charged signing-service fee must still be disclosed.
- Cost lines for service fee, trading fee, builder fee, funding/bridge fee, setup/approval gas and execution gas. Each line specifies asset/network, payer, amount or conservative maximum, source, observation time and whether it is already included in another line.
- networkGas.mode as SPONSORED, BUYER_PAID, NOT_APPLICABLE or UNKNOWN. Sponsored lines include sponsor, covered operation, eligibility evidence and expiry. Unknown gas or fees block an executable preview.
- Required and available balances by account, chain and asset; reservations for concurrent accepted operations; fee-inclusive spend bounds; SELL inventory and approval checks; shortfalls and the exact approved funding route when needed.

Revalidate immediately before signing/submission. Any mutation outside the approved envelope, expired quote, changed signer or funding destination requires a fresh preview and authorization. A sponsor failure must not silently switch to buyer-paid gas. If native gas is required, identify the actual token/network and estimated maximum. Do not prescribe generic gas top-ups when sponsorship may apply.

Signing-only flow: exact caller-selected market -> free/public evidence and readiness -> full cost preview -> buyer authorization -> buyer's Onchain OS or verified alternate signer -> supported submission adapter -> authoritative execution receipt. Paid AI research is optional. Record decision provenance as caller-provided when research was skipped; never invent an AI endorsement.

The trade authorization binds the preview hash, domain, tenant, owner, signer, trading account, network, exact order bounds, fee ceilings, nonce and expiry. A chat yes, API token, research purchase or delivery acceptance alone is insufficient. Use the supported cryptographic wallet/session authority and verify it in the appropriate execution adapter.

## Buyer prompts and settlement

Return nextActions as structured entries containing action, label, requiredInputs, authorizationRequired and expiry. Hosting agents must present relevant choices and preserve the authorization boundaries, rather than silently consuming a result.

| Stage | Required continuation |
| --- | --- |
| Ambiguous market | Select the intended market/outcome or refine the request |
| Research delivered | Show results and original JSON before review |
| Buyer review | Accept delivery or request a specific correction; explain settlement consequence |
| Delivery accepted | Take this trade, decline, or analyze more markets |
| Trade preview | Approve this exact preview or cancel; expose total costs and gas payer |
| Execution uncertain | Check existing execution; do not place another order |
| Execution verified | Show receipt, check position, or request a sell quote |
| Monitoring setup incomplete | Supply preferences; never fabricate a signal |
| Monitoring event | Read findings, request a preview, change preferences, or pause |

Research acceptance and trade approval stay separate. x402 immediate payment is not marketplace escrow: document failed-delivery recovery/refund policy for each adapter. Do not promise escrow auto-release, dispute deadlines or OKX dispute email behavior on other marketplaces. Subscription approval grants monitoring only; copy execution requires explicit bounded buyer authority.

Polling with durable cursors is the initial external delivery contract. Optional webhooks are a later capability requiring registered verified HTTPS destinations, signed timestamped events, replay defense, SSRF controls and polling fallback. Do not accept arbitrary callback URLs. Email is optional notification, not the authoritative machine receipt.

## Distribution and commercial attribution

Partners may build and list their own applications subject to applicable marketplace and upstream terms. They own their branding, support and end-user relationship; identify PolyDesk as the underlying service provider where agreed. Do not imply OKX, Base or Polymarket endorsement.

Keep separate identifiers for partner, originating marketplace, authenticated application, payment adapter, signer provider and execution venue. Assign partner attribution at authenticated ingress and bind it to the operation; never let callers rewrite it at receipt time. Self-reported referrer data is diagnostic only.

PolyDesk service revenue, partner markup, marketplace charges, Polymarket trading fees and builder revenue are different accounting entries. Disclose each fee and who receives it. No automatic claim that OKX earns from signing or that a builder code creates an entitlement to revenue sharing. Default: no unimplemented partner payout promise. Define a separate commercial agreement and reconciled ledger before offering revenue share. Preserve applicable Polymarket builder attribution rules; no artificial volume or overlapping builder credit.

## Release gates and rollout

1. Reconcile the live manifest and publish this design as a proposal. Generate one typed capability registry and OpenAPI schemas with exact verified support states.
2. Release public HTTP discovery, bounded research and signing-only previews with authenticated result recovery. Prove fresh-client onboarding, no-spend examples, real authorized delivery and failure recovery.
3. Add MCP over those same services. Verify initialize, tools/list and tools/call with two independent clients, OAuth boundaries and unsupported-payment-client recovery.
4. Add external managed subscriptions and audit jobs only after tenant isolation, payment lifecycle and end-to-end notification/correction paths pass. Existing OKX worker controls remain private.
5. Pilot partner distribution, then publish public URLs and register only verified capabilities in relevant catalogs. An endpoint advertising Bazaar metadata is not proof it is indexed or discoverable.

Required tests: cross-tenant reads denied; payer cannot impersonate owner; duplicate/concurrent requests do not double-charge or trade; crash after settlement recovers without repaying; fee/price changes require reapproval; sponsorship failure blocks fallback; stale preview and replayed authorization rejected; partial fills and uncertain submissions reconciled; paused monitoring stays paused; original JSON and findings agree; memory failure never authorizes a trade; credentials and private findings excluded from logs and metrics.

## Standards references

- MCP HTTP transport: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Bazaar discovery: https://docs.cdp.coinbase.com/x402/buyer/discover-services
- Onchain OS authentication: https://web3.okx.com/id/onchainos/dev-docs/home/api-access-and-usage
- Polymarket workflow: https://docs.polymarket.com/trading/overview
- Polymarket gasless integration: https://github.com/Polymarket/agent-skills/blob/main/gasless.md
- Builder conduct: https://builders.polymarket.com/code-of-conduct

These are the references inspected for the design, not a guarantee of perpetual compatibility. Pin implementation versions and reverify before launch. Older gasless examples may use legacy collateral names; use current execution adapter data.
