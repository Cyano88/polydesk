# Base research replay audit - 2026-09-08

## Verified cause

Installed OnchainOS: 4.5.2. Official tagged source:

- https://github.com/okx/onchainos-skills/blob/v4.5.2/cli/src/commands/payment/payment_flow.rs
- https://github.com/okx/onchainos-skills/blob/v4.5.2/cli/src/commands/payment/http_carrier.rs

`fetch_pay` parses only submission `param` arguments into `biz_params`.
The REST branch passes these to `replay_merchant` and `http_carrier::build_request`
without merging `st.known_params`. With no submission parameters, the POST has no
business body even when the quote reports known values and correct carriers.
The MCP branch does merge persisted arguments; this request uses REST.
The inspected v4.5.3 source retains the same REST behavior.

The operator omitted explicit submission parameters. Server fix 1c2e8bd adds
carrier declarations but cannot supply missing client values. Quote success was
incorrectly treated as proof of replay.

## Correct invocation contract

Pass the same exact caller-supplied fields to BOTH quote and pay:

```text
onchainos payment quote https://polydesk.trade/api/x402/base/polymarket-smart-trader --method POST --chain base --param action=ANALYZE --param marketId=<exact-condition-id> --param outcome=<exact-outcome> --param side=BUY
```

Only after verifying terms and obtaining explicit approval:

```text
onchainos payment pay --payment-id <fresh-approved-payment-id> --selected-index <approved-accepts-index> --yes --param action=ANALYZE --param marketId=<same-exact-condition-id> --param outcome=<same-exact-outcome> --param side=BUY
```

This document is not payment permission. Never reuse failed payment IDs, change
the approved request, guess values on the server, or retry payment automatically.
Research payment never authorizes a trade.

## Verification boundary

Lifecycle tests use the real request validator and preflight with all payment
and provider dependencies mocked. Empty replay input reproduces the live 400
before verification or settlement. Explicit fields pass validation and reach
the mocked unpaid 402 with no settlement, delivery, or durable writes.
These are server-input tests, not execution of the upstream Rust binary's
post-signing branch. Rust tooling is unavailable locally.

Tests generate no signatures or payments. A separately approved paid canary is
still required to verify settlement, research delivery, and receipt persistence.
Earlier failed attempts reported no settlement transaction; this is not an
independent on-chain balance or nonce reconciliation.
