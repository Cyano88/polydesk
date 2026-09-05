# PolyDesk API Boundary

Updated: 2026-09-05

## Product boundary

PolyDesk owns portfolio, trading, market intelligence, and LP Scout results.
Hash PayLink owns checkout, wallet funding, payment verification, and receipts.

PolyDesk must not provision or manage an x402 payer wallet, execute a local Circle
CLI payment, or generate a second payment receipt.

## Public integration entry

- `https://polydesk.trade/integrations` explains the agent and platform integration surfaces.
- `https://polydesk.trade/docs/okx-ai` documents the governed OKX.AI flows.
- `GET https://polydesk.trade/.well-known/polydesk.json` is the stable discovery entry.
- `GET https://polydesk.trade/api/a2mcp/services` is its versioned machine-readable product manifest.

PolyDesk does not market a standalone consumer application. Agents and
platforms integrate through typed A2A or HTTP contracts and retain their own
identity, user experience, and allowlisted return destination. The retained
operator console is an operational approval, monitoring, and evidence surface,
not a public product or discovery entry.
Manifest version 2 declares exactly three customer-facing products: One-Off
Polymarket Trade, Managed Polymarket Agent, and Polymarket Integration Audit.
They are registered as A2A listings `#38484`, `#38496`, and `#40363`. The manifest separately declares retained implementation capabilities,
their payment headers, X Layer USDT contract, request schemas, marketplace IDs,
polling/receipt delivery, and custody rules. Compatibility routes must not be
presented as additional PolyDesk products.
Arbitrary callback and return URLs are intentionally unsupported; a new platform
must receive an allowlisted integration key and server-side destination mapping.

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
| `POST /api/polymarket-account/readiness` | Free owner-EOA to Deposit Wallet derivation, deployment, pUSD balance, and live bridge-route check |
| `POST /api/a2mcp/polymarket-funding-link` | OKX-paid verified handoff to a Hash PayLink Base/Arbitrum checkout; refuses arbitrary or undeployed wallet targets |
| `GET /api/a2mcp/football-live-data` | OKX-paid provider-truth football match data with verified Polymarket trade metadata when matched |
| `POST /api/a2mcp/football-news-brief` | OKX-paid provider-sourced football brief with canonical source and matched Polymarket event links |
| `POST /api/a2mcp/polymarket-agent-flow` | Consolidated OKX-paid governed watch, pick, or copy handoff for an exact buyer-signed BUY |
| `GET /api/polymarket-agent-flow` | Free machine-readable governed trader lifecycle |
| `POST /api/polymarket-open/prepare` | Free intent-to-sign plan with live market resolution and public deposit-wallet readiness checks |
| `POST /api/polymarket-copy/prepare` | Free exact-BUY verification, buyer Deposit Wallet derivation/match, and governed copy-order preparation |
| `POST /api/polymarket-signed-open/validate` | Free validation of the exact signed OPEN body before the buyer pays |
| `POST /api/polymarket-agent-flow/complete` | Authority-signed verification of the submitted order and public fill |
| `GET /api/polymarket-agent-flow/receipt/:executionId` | Public machine-readable terminal trade receipt |
| `GET /api/health` | Service health |

The OKX service fee is settled on X Layer. For funding-link delivery, PolyDesk
then calls the server-only Hash PayLink API to create the Base/Arbitrum hosted
funding checkout. The governed trader does not use Hash PayLink or accept a
private key, CLOB API secret, or CLOB passphrase. The official order payload
does include the buyer API-key identifier as `owner`; PolyDesk validates the
exact payload constraints and returns the direct-submit body. After submission,
PolyDesk verifies the Polygon receipt and exact public Polymarket BUY before
publishing a terminal receipt. Builder
attribution is already bound into the CLOB V2 signed order, and the buyer
submits directly to Polymarket for final cryptographic verification.

## Portfolio email return routing

Portfolio alerts return users to the platform that originated the managed-agent
relationship. OKX.AI resolves to Agent #5427 by default. Circle uses
`POLYDESK_CIRCLE_MARKETPLACE_RETURN_URL` when configured. Direct or unknown
channels link to `https://polydesk.trade/integrations`; the retired PolyDesk
consumer application is not used as a portfolio destination.

The legacy browser routes `/polydesk` and `/rewards` redirect to
`/integrations`. The narrow `/continue/lp-scout` callback exists only to
verify a completed Hash PayLink checkout and open its immutable report.

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

The copy-paste external-agent sequence is documented in
`docs/polymarket-agent-ready-buy.md`.
