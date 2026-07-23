# PolyDesk API Boundary

Updated: 2026-07-23

## Product boundary

PolyDesk owns portfolio, trading, market intelligence, and LP Scout results.
Hash PayLink owns checkout, wallet funding, payment verification, and receipts.

PolyDesk must not provision or manage an x402 payer wallet, execute a local Circle
CLI payment, or generate a second payment receipt.

## Hash PayLink LP Scout flow

1. The browser requests `GET /api/x402/polymarket-scout` with a unique
   `requestId`.
2. PolyDesk creates or reads the corresponding checkout through Hash PayLink.
3. An unpaid request returns HTTP 402 with the trusted Hash PayLink
   `checkoutUrl`.
4. Hash PayLink hosts wallet access, funding, payment, and payment verification.
5. Hash PayLink returns the browser to PolyDesk with the original request
   correlation.
6. PolyDesk repeats the idempotent request and accepts only Hash PayLink's
   authoritative paid result.
7. PolyDesk stores the LP Scout result and the trusted Hash PayLink receipt URL.

## Relevant mounted routes

| Route | Responsibility |
| --- | --- |
| `GET /api/x402/polymarket-scout` | Idempotent Hash PayLink checkout handoff and LP Scout delivery |
| `GET /api/agent-activity?id=...` | One opaque LP Scout activity bundle; never lists activity by agent slug |
| `GET /api/lp-scout-report?id=...` | Saved LP Scout report |
| `POST /api/zeroscout/polymarket-brief` | ZeroScout verification for a paid, saved scout |
| `POST /api/webhooks/hashpaylink` | Raw-body, signed Hash PayLink webhook receiver |
| `GET /api/health` | Service health |

PolyDesk's portfolio, Polymarket trading, World Cup, and untouched OKX routes
remain separate from this payment refactor.

## Retired PolyDesk routes

These routes are deliberately no longer mounted:

- `/api/agent-wallet`
- `/api/agent-wallet-authorization`
- `/api/agent-service-policy`
- `/api/circle-session-queue`
- `/api/privy-circle-link`
- `/api/x402/receipt`

The corresponding local wallet, Circle session, and receipt UI modules were
removed. Receipt actions must open the trusted HTTPS URL returned by Hash
PayLink.

## Required Hash PayLink environment

```env
HASH_PAYLINK_BASE_URL=https://app.hashpaylink.com
HASH_PAYLINK_AGENTIC_TEST_API_KEY=
HASH_PAYLINK_AGENTIC_LIVE_API_KEY=
HASH_PAYLINK_API_KEY=
HASH_PAYLINK_WEBHOOK_SECRET=
HASH_PAYLINK_WEBHOOK_STORE_KEY=
HASH_PAYLINK_LP_SCOUT_PRICE=$0.01
PUBLIC_APP_URL=https://polydesk.trade
AGENT_ACTIVITY_STORE=
AGENT_ACTIVITY_STORE_KEY=
DEFAULT_AGENT_SLUG=polydesk-agent
```

API keys and webhook secrets are server-only.

## Verification

```bash
npm run typecheck
npm run typecheck:server
npm run test:hashpaylink-agentic
npm run test:hashpaylink-webhook
npm run test:hashpaylink-funding
npm run build
```

After deployment:

- `/api/health` returns 200.
- `/api/agent-wallet` returns 404.
- `/api/x402/receipt` returns 404.
- `/api/agent-activity?agent=polydesk-agent` does not return an activity list.
- `/api/agent-activity?id=<unknown-id>` returns 404.
- A fresh unpaid LP Scout request returns 402 with an
  `https://app.hashpaylink.com/...` checkout URL.
