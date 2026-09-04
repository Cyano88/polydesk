# PolyDesk OKX Production Acceptance Gate

Last audited: 2026-09-04

This document is the release gate for PolyDesk Agent `#5427`. It separates the three customer products from the six retained A2MCP compatibility capabilities and prevents a marketplace payment before the selected product can deliver its advertised lifecycle.

## Target products

| Product | Type | Current listing | Price | Current readiness |
|---|---|---:|---:|---|
| One-Off Polymarket Trade | A2A | `#38484` | 0.1 USDT per task | Registered; ready for buyer discovery after Agent `#5427` review |
| Managed Polymarket Agent | A2A | `#38496` | 5 USDT per month, 3-day trial | Registered; sandbox lifecycle accepted and legacy jobs preserved |
| Polymarket Integration Audit | A2A | `#40363` | 25 USDT per task | Registered; report contract validated |

The marketplace currently also exposes six paid A2MCP listings. They remain compatibility capabilities during migration and are not additional products.

## Audit findings

1. The public PolyDesk manifest correctly exposes exactly three products under schema `2.0.0`.
2. All three A2A listings use the final customer-facing names and prices.
3. The provider profile now describes one-time trading, managed portfolio and copy-trade monitoring, and external platform audits.
4. The one-off worker implements a bounded BUY mission with grant checking, durable delivery state, action-required handling, and PnL follow-up.
5. The portfolio subsystem implements verified-email enrollment, configurable profit and loss thresholds, new-position, resolution and claimable alerts, daily or weekly digests, and origin-aware destination links.
6. The dedicated subscription adapter binds exact OKX subscription identity, verified email, preferences, and pause/cancel/expiry to the portfolio subsystem. New jobs accept the final Managed Polymarket Agent title while existing jobs using the former title remain reconcilable.
7. The old worker accepted both `#38484` and `#38496`, allowing a subscription event to enter the one-off BUY path. The source now fails closed: only `#38484` is accepted.
8. The private worker host is synchronized with the managed-subscription runtime. The one-off daemon remains active/enabled with no route from `#38496` into the BUY worker. A non-root five-minute managed-subscription reconciliation schedule completed an unattended live cycle successfully.
9. Live marketplace truth shows three active `#38496` jobs: one full-price membership for buyer Agent `#2191` ending 2026-09-13 UTC, plus micro-priced sandbox/DACS checks for Agents `#1791` and `#8178` ending 2026-09-09 and 2026-09-24 UTC. The controlled Agent `#8178` acceptance exercised enrollment, verified email, pause, resume, monitoring, and a daily digest. The full-price buyer has not been migrated; do not silently change that buyer's contract.
10. The provider task directory reports 96 non-terminal tasks: 86 open, 7 accepted, and 3 submitted. Five use a normal 0.1 or 0.3 USDT price; the other 91 are micro-priced checks. The directory response does not identify the selected service, so every normal-priced obligation must be reconciled before a legacy listing is removed.
11. The integration-audit report contract enforces six mandatory controls, evidence-linked pass/fail results, remediation for failures, deterministic report identifiers, safe HTTPS origins, and rejection of credential-bearing fields. It is registered as service `#40363`.

## Gate A: One-Off Polymarket Trade

All checks must pass in order:

- marketplace listing resolves to Agent `#5427`, service `#38484`, type A2A, and 0.1 USDT per task;
- private host runs the reviewed commit and its daemon is active and enabled;
- communication runtime health passes and is bound to Agent `#5427`;
- a dry run rejects service `#38496`, wrong agents, wrong task states, secret-bearing payloads, and missing public mandate fields;
- an accepted task requests one bounded BUY with explicit amount, price, and expiry caps;
- insufficient readiness returns one deterministic funding or collateral action and does not emit a trade signal;
- a ready account receives exactly one buyer-controlled execution handoff;
- replay does not duplicate delivery;
- the receipt and later PnL evidence are public and recomputable.

Only after the host checks pass may one 0.1 USDT acceptance task be purchased. A live trade requires a separate explicit buyer confirmation.

## Gate B: Managed Polymarket Agent

Do not start the trial or subscription until all checks pass:

- service `#38496` routes to a dedicated subscription adapter, never the one-off worker;
- onboarding records the real subscription and buyer-agent identifiers;
- the user provides a public Polymarket address, verified email, integration source, alert thresholds, digest frequency, timezone, and delivery hour;
- email ownership is confirmed before alerts or summaries are sent;
- profit, loss, new-position, resolved, and claimable transitions are deduplicated and independently testable;
- daily and weekly schedules survive restarts and cannot double-send;
- every portfolio link returns to the originating platform when allowlisted;
- pausing or cancelling the subscription stops future monitoring deliveries;
- monitoring grants no trading authority;
- copy trading requires a separate bounded authorization containing amount, maximum price, expiry, and market selection;
- subscription activation, delivery, pause, cancellation, and expiry are covered by integration tests and one controlled live trial.

Implemented and live-verified controls:

- exact intersection of both official OKX active-subscription directories;
- immutable provider `5427`, listing `38496`, and service UUID matching;
- monitoring disabled until email ownership is confirmed;
- one central monitoring switch applied to periodic digests, portfolio reconciliation, live asset events, resolution events, and watched LP lifecycle email recipients;
- restart-safe address selection across watched, deposit, trading, and fallback Polymarket addresses;
- complete-snapshot reconciliation that disables missing or expired jobs but never treats a malformed directory response as an empty list.
- multi-ASP account handling that verifies Agent `5427` through its sole exact subscription listing and each active job's explicit provider/buyer status when the account-level provider directory defaults to another ASP.
- controlled sandbox enrollment, verified-email activation, pause/resume enforcement, daily-digest delivery, and restart-safe reconciliation.
- first-snapshot suppression for existing profit, loss, and claimable states, preventing historical positions from generating alerts when monitoring is initialized.
- Implemented in source, pending deployment and controlled delivery proof: deduplicated lifecycle emails for trial-ending, trial-expired, successful-renewal, and explicitly reported payment-failure events, with bounded retries and origin-aware return links.

## Gate C: Marketplace migration

Listing migration is complete. Remaining release steps:

1. wait for Agent `#5427` marketplace review to reach approved and active;
2. run discovery from a separate buyer session and resolve all three exact listing IDs;
3. complete the controlled buyer acceptance sequence in `docs/POLYDESK_OKX_BUYER_ACCEPTANCE.md`;
4. reconcile every normal-priced non-terminal provider task;
5. roll down the six A2MCP compatibility listings only after their capabilities remain reachable through the production products and no paid obligation depends on them.

## Stop conditions

Stop without payment or trading when any of these is true:

- private worker revision or daemon health is unknown;
- a service routes to the wrong worker;
- verified email or subscription identity is missing;
- required authorization fields are absent;
- a prior delivery has uncertain terminal state;
- the advertised marketplace scope differs from the implementation under test.
