# Lolah and PolyDesk Prediction Market Context

Status: read-only and unlisted. Production access remains private and bearer-authenticated during the Lolah pilot.

## Product boundary

PolyDesk owns Prediction Market Context. Lolah consumes that context and combines it with verified news and Hyperliquid market state. PolyDesk does not trade perps, and Lolah does not inherit PolyDesk wallets, service IDs, workers, or production state.

The planned commercial terms are a three-day free trial followed by 1 USDT per 30 days. These terms are not active until the endpoint passes live integration, subscription, abuse-control, and Lolah end-to-end tests.

## Current local endpoint

POST /api/agent/polymarket-context

The route is absent unless POLYDESK_MARKET_CONTEXT_ENABLED is exactly true. When enabled, it also requires a dedicated POLYDESK_MARKET_CONTEXT_TOKEN of at least 32 characters. The token is only for this read-only machine-to-machine route; it is not a wallet, signing credential, subscription entitlement, or permission to trade.

The request carries:

- event: a lolah-news-event-v1 object
- minimumMatchConfidence: optional number from 0.5 through 0.9

The response carries a polydesk-market-context-v1 result with one of three terminal match states:

- matched: one market clearly outranks alternatives
- ambiguous: similarly relevant markets exist, so automated trading is blocked
- no_relevant_market: no market passed entity, event, horizon, tradability, and confidence checks

The endpoint is intentionally pull-only. It has no notification, subscription, payment, marketplace-registration, or trade-execution side effect. The private pilot must not be described as the public paid service.

## Loopback staging

The isolated staging process is separate from the production server and binds only to 127.0.0.1. It exposes /health and the context POST route; no other PolyDesk routes are mounted.

PowerShell:

    $env:POLYDESK_MARKET_CONTEXT_STAGING_ENABLED='true'
    $env:POLYDESK_MARKET_CONTEXT_STAGING_PORT='4317'
    node --import tsx scripts/polydesk-context-staging.ts

The process refuses to start without the exact staging gate. Stop it after the Lolah shadow run. Do not add these staging variables to render.yaml. Loopback staging explicitly disables bearer authentication because it cannot accept non-loopback clients.

## Trust rules

- Reject unknown fields and secret-shaped input.
- Require an explicit project, token, person, or protocol entity.
- Ignore inactive, closed, expired, non-orderbook, and non-accepting markets.
- Do not equate token-name overlap with event relevance.
- Do not select an arbitrary winner when the top candidates are too close.
- Treat comments as unverified commentary if they are added later.
- Treat price and order-book state as capital-backed consensus, not human commentary.
- Omit unavailable historical movement instead of inventing it.
- Never turn a context response into permission to trade.

## Pull and push products

Prediction Market Context is a pull subscription. A subscribed agent calls it when context is needed.

Lolah Instant Scan is also pull-based. It responds to one request and has no continuing watch obligation.

Lolah Market Watch is a later push subscription. A watch must be pinned to a subscriber agent ID, subscription job ID, filters, delivery policy, and explicit expiry. Closing a chat does not stop an active subscription watch. Trial expiry, subscription expiry, cancellation, or watch expiry does.

Every pushed alert must carry a unique alert ID, observed time, validity deadline, source evidence, PolyDesk match state, Hyperliquid context, and a non-executing thesis. Delivery does not authorize a trade.

## Build gates before listing

1. Deterministic fixture tests pass.
2. Current Polymarket search, book, and history responses pass live read-only probes.
3. Lolah consumes matched, ambiguous, and no-market responses correctly.
4. Hyperliquid context is read-only and rejects unavailable or stale markets.
5. Replay demonstrations cover rumours, false matches, ambiguous matches, stale news, illiquid markets, and already-priced moves.
6. Three-day trial, 30-day renewal, rate limits, entitlement checks, cancellation, and expiry pass.
7. Private agent-to-agent delivery passes duplicate, offline, expired-alert, and wrong-recipient tests.
8. Testnet execution passes only after the read-only and notification gates.
9. Human review approves the PolyDesk eighth-service listing and the separate Lolah listing.

The private bearer-authenticated Lolah pilot may run before the commercial and listing gates pass. Public access, billing, marketplace registration, and OKX.AI listing must remain disabled until every applicable gate passes.
