# PolyDesk OKX Production Acceptance Gate

Last audited: 2026-09-04

This document is the release gate for PolyDesk Agent `#5427`. It separates the three customer products from the six retained A2MCP compatibility capabilities and prevents a marketplace payment before the selected product can deliver its advertised lifecycle.

## Target products

| Product | Type | Current listing | Price | Current readiness |
|---|---|---:|---:|---|
| One-Off Trade Mission | A2A | `#38484` PolyDesk Trading Agent | 0.1 USDT per task | Ready for host verification, then one controlled paid acceptance task |
| Manage My Polymarket Agent | A2A | `#38496` PolyDesk Trading Membership | 5 USDT per month, 3-day trial | Blocked until the subscription adapter binds the OKX lifecycle to verified monitoring preferences |
| Polymarket Integration Conformance Audit | A2A | Not listed | Quote | Planned |

The marketplace currently also exposes six paid A2MCP listings. They remain compatibility capabilities during migration and are not additional products.

## Audit findings

1. The public PolyDesk manifest correctly exposes exactly three products under schema `2.0.0`.
2. The two existing A2A listings still use their legacy names and descriptions.
3. The provider profile still describes the old football, LP, funding, and governed-trading capability mix.
4. The one-off worker implements a bounded BUY mission with grant checking, durable delivery state, action-required handling, and PnL follow-up.
5. The portfolio subsystem implements verified-email enrollment, configurable profit and loss thresholds, new-position, resolution and claimable alerts, daily or weekly digests, and origin-aware destination links.
6. The subscription listing is not yet connected to that portfolio subsystem. It currently describes recurring signals and copy trading.
7. The old worker accepted both `#38484` and `#38496`, allowing a subscription event to enter the one-off BUY path. The source now fails closed: only `#38484` is accepted.
8. The private worker host could not be inspected from the current workstation because `pocket-nft-signer-1` did not resolve. Its deployed revision and daemon health remain unverified.

## Gate A: One-Off Trade Mission

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

## Gate B: Manage My Polymarket Agent

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

## Gate C: Marketplace migration

After Gates A and B pass:

1. rename `#38484` to One-Off Trade Mission and replace its description with the bounded mission contract;
2. rename `#38496` to Manage My Polymarket Agent and replace its description with the monitoring contract;
3. update the Agent `#5427` profile to the three-product positioning;
4. verify approval and active status after the edits;
5. run discovery from a separate buyer session;
6. roll down the six A2MCP compatibility listings only after their capabilities are reachable through the two production products;
7. build and list Polymarket Integration Conformance Audit last.

## Stop conditions

Stop without payment or trading when any of these is true:

- private worker revision or daemon health is unknown;
- a service routes to the wrong worker;
- verified email or subscription identity is missing;
- required authorization fields are absent;
- a prior delivery has uncertain terminal state;
- the advertised marketplace scope differs from the implementation under test.
