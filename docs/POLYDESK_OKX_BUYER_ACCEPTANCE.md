# PolyDesk OKX Buyer Acceptance

This is the controlled release sequence for PolyDesk Agent `#5427`. It begins only after the marketplace reports the agent as approved and active. Code-level checks may run while review is pending, but no payment is required for them.

## Automated contract gate

Run:

```text
npm run test:okx-buyer-acceptance
npm run typecheck
npm run typecheck:server
npm run build
```

The gate verifies the three exact A2A product names, listing IDs, prices, profile links, public manifest, retained capability boundary, and both final-name and legacy-title subscription reconciliation.

## Buyer discovery

Use a separate buyer identity. Confirm discovery returns Agent `#5427` and these exact services:

| Service | Listing | Price |
|---|---:|---:|
| One-Off Polymarket Trade | `#38484` | 0.1 USDT per task |
| Managed Polymarket Agent | `#38496` | 5 USDT per month with a 3-day trial |
| Polymarket Integration Audit | `#40363` | 25 USDT per task |

Stop if the agent is not active, any name, type, price, or listing ID differs, or a service resolves to another provider.

## Controlled paid acceptance

Each purchase requires a separate explicit buyer approval. Do not combine service payment approval with approval to place a Polymarket trade.

1. Purchase One-Off Polymarket Trade for 0.1 USDT.
2. Verify one bounded request reaches the one-off worker exactly once.
3. If the account is not ready, verify it returns one deterministic funding or collateral action without a trade signal.
4. If the account is ready, review the exact market, outcome, side, maximum spend, maximum price, and expiry.
5. Obtain separate approval before submitting the live Polymarket order.
6. Verify the resulting order, public receipt, and PnL evidence bind to the accepted task.
7. Start one controlled Managed Polymarket Agent trial with a verified email and an address owned by the tester.
8. Verify enrollment, portfolio summary, threshold alert, trial-ending, expiry, pause, resume, and cancellation behavior without changing any existing full-price subscriber.
9. Purchase one Polymarket Integration Audit only with a sanitized test integration package.
10. Verify the human report and machine report cover all six controls and bind every pass or fail to evidence.

## Rollback and stop conditions

Stop without another payment when discovery differs from the registry, delivery state is uncertain, a worker or daemon revision is unknown, a task routes to the wrong service, email ownership is unverified, or a requested financial action lacks exact bounded approval.

Do not remove the six A2MCP compatibility listings until all normal-priced open obligations are reconciled and the three A2A acceptance runs are complete.
