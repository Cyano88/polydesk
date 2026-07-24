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
| `POST /api/a2mcp/polymarket-funding-link` | OKX-paid handoff to a Hash PayLink Base/Arbitrum Polymarket funding checkout |
| `POST /api/a2mcp/polymarket-signed-open` | OKX-paid constraint validation and direct-submit handoff for a buyer-signed, capped BUY order |
| `POST /api/polymarket-open/prepare` | Free intent-to-sign plan with live market resolution and public deposit-wallet readiness checks |
| `POST /api/polymarket-signed-open/validate` | Free validation of the exact signed OPEN body before the buyer pays |
| `GET /api/health` | Service health |

The OKX service fee is settled on X Layer. For funding-link delivery, PolyDesk
then calls the server-only Hash PayLink API to create the Base/Arbitrum hosted
funding checkout. The signed OPEN service does not use Hash PayLink or accept a
private key, CLOB API secret, or CLOB passphrase. The official order payload
does include the buyer API-key identifier as `owner`; PolyDesk validates the
exact payload constraints and returns the direct-submit body. Builder
attribution is already bound into the CLOB V2 signed order, and the buyer
submits directly to Polymarket for final cryptographic verification.

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
HASH_PAYLINK_API_KEY=
HASH_PAYLINK_WEBHOOK_SECRET=
HASH_PAYLINK_WEBHOOK_STORE_KEY=
HASH_PAYLINK_LP_SCOUT_PRICE=$0.01
POLYDESK_EXTERNAL_OPEN_MAX_USDC=25
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
npm run test:signed-open
npm run test:open-prepare
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
- An unpaid signed OPEN request returns an OKX HTTP 402 challenge.
- A preparation request resolves a unique active market and returns public
  wallet readiness plus official local-signing arguments; ambiguous events
  return choices instead of guessing.
- A paid valid signed OPEN replay returns the exact CLOB payload; invalid,
  stale, SELL, GTC/GTD, oversized, or mutated orders are rejected. Polymarket
  CLOB remains the final cryptographic signature and wallet-authority verifier.
