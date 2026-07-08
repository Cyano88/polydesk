# Environment Boundary

PolyDesk must not inherit all Hash PayLink secrets. Each environment variable must have a clear owner.

## PolyDesk-Owned Candidates

These belong in the new PolyDesk repo after the relevant APIs move:

```env
VITE_PRIVY_APP_ID=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
VITE_PUBLIC_PAYLINK_ORIGIN=https://hashpaylink.com
HASH_PAYLINK_BASE_URL=https://hashpaylink.com

DATABASE_URL=
POSTGRES_URL=

POLYMARKET_BUILDER_CODE=
POLYMARKET_BUILDER_API_KEY=
POLYMARKET_BUILDER_SECRET=
POLYMARKET_BUILDER_PASSPHRASE=
POLYMARKET_BUILDER_PASS_PHRASE=
POLYMARKET_BUILDER_SIGNER_URL=
POLYMARKET_ORDER_SIGNING_ENABLED=
POLYMARKET_RELAYER_URL=
POLYMARKET_CHAIN_ID=137
POLYMARKET_RPC_URL=
POLYGON_RPC_URL=

SPORTMONKS_API_KEY=
API_FOOTBALL_KEY=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
ZEROEX_API_KEY=
RESEND_API_KEY=
```

Rules:

- `POLYMARKET_*` secrets must be isolated from Hash PayLink core payment rails.
- `PRIVY_APP_SECRET` is needed only for PolyDesk backend routes that verify Privy sessions. Prefer a separate PolyDesk Privy app after cutover.
- AI keys may be separated further if LP Scout becomes an OKX.AI ASP service.
- Data provider keys should be scoped to PolyDesk only.
- `DATABASE_URL` should point to a PolyDesk database, not the Hash PayLink core database, after migration.

## PolyDesk World Cup / Market Data Env

Verified in `api/poly-stream.ts` and `api/poly-worldcup-news.ts`:

```env
POLY_STREAM_FIXTURE_MODE=
POLY_STREAM_LIMIT=
POLY_STREAM_LEAGUE_ID=
POLY_STREAM_SEASON=
POLY_STREAM_BASE_URL=
POLY_STREAM_INCLUDE=
POLY_STREAM_LIVE_INCLUDE=
POLY_STREAM_DETAIL_INCLUDE=
POLY_STREAM_START_DATE=
POLY_STREAM_DETAIL_LIMIT=

POLYMARKET_MATCH_URLS=
POLYMARKET_ALLOW_GENERIC_URLS=
POLYMARKET_WORLD_CUP_LIMIT=
POLYMARKET_LOOKUP_LIMIT=
POLYMARKET_MARKET_LOOKUP=

POLY_NEWS_QUERY_PARAM=
POLY_NEWS_LIMIT_PARAM=
POLY_NEWS_LIMIT=
POLY_NEWS_API_AUTH_HEADER=
POLY_NEWS_API_KEY_PARAM=
```

These should move with the World Cup market discovery and news APIs.

## PolyDesk LP Scout / x402 Env

Verified in `api/x402-polymarket-scout.ts` and related agent wallet references:

```env
X402_SELLER_ADDRESS=
X402_POLYMARKET_SCOUT_PRICE=
X402_POLYMARKET_SCOUT_MAX_AMOUNT=
X402_FACILITATOR_URL=
X402_ACCEPT_NETWORKS=
X402_POLYMARKET_SCOUT_URL=
```

Decision needed:

- If LP Scout is billed by PolyDesk directly, move these to PolyDesk.
- If LP Scout is billed by Hash PayLink or OKX.AI during transition, keep billing env in the billing owner and expose a service-call API to PolyDesk.

## PolyDesk Alert Email Env

Verified in `api/polymarket-portfolio.ts`:

```env
POLYMARKET_ALERT_FROM_EMAIL=
POLYMARKET_ALERT_FROM_NAME=
ALERT_FROM_EMAIL=
AGENTIC_STREAMING_FROM_EMAIL=
STREAM_INVITE_FROM_EMAIL=
RESEND_API_KEY=
```

Preferred split:

- Move `POLYMARKET_ALERT_FROM_EMAIL`, `POLYMARKET_ALERT_FROM_NAME`, and `RESEND_API_KEY` if PolyDesk sends its own alerts.
- Do not rely on generic Hash PayLink sender fallbacks after extraction.

## Hash PayLink Core Secrets That Should Not Move

These should stay in Hash PayLink unless a later design explicitly requires a narrow proxy:

```env
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
PAYMASTER_PRIVATE_KEYS=
MAIN_PAYMENT_TREASURY_KEYS=
MONNIFY_*
PAYCREST_*
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
ZERO_G_STORAGE_KEYS=
CORE_RECEIPT_SIGNING_KEYS=
CDP_PAYMASTER_URL=
COINBASE_PAYMASTER_URL=
BASE_PAYMASTER_URL=
PAYLINK_FACTORY_V2=
PAYLINK_FACTORY_V2_ARC=
PAYLINK_FACTORY_V2_ARB=
RELAYER_PRIVATE_KEY=
RELAYER_PRIVATE_KEY_ARC=
RELAYER_PRIVATE_KEY_ARB=
RELAYER_PRIVATE_KEY_SOLANA=
SOLANA_TREASURY=
```

Rules:

- PolyDesk should not hold treasury keys.
- PolyDesk should not hold POS/bank payout keys.
- PolyDesk should not directly control generic Hash PayLink receipt/checkout infrastructure.
- If PolyDesk needs payment creation, it calls a Hash PayLink API with a scoped service token.

## Future Service Token

Create a narrowly scoped token for PolyDesk to request Hash PayLink funding checkouts:

```env
HASH_PAYLINK_POLYDESK_SERVICE_TOKEN=
```

Token permissions:

- Create Polymarket funding checkout.
- Query funding/bridge status.
- Post optional funding-complete notice.

Token must not permit:

- Generic payouts.
- POS/bank operations.
- Treasury movement.
- Admin receipt mutation.

## Temporary Shared Env During Migration

During Phase 2 frontend extraction, PolyDesk may only need:

```env
VITE_PRIVY_APP_ID=
VITE_PUBLIC_PAYLINK_ORIGIN=https://hashpaylink.com
HASH_PAYLINK_BASE_URL=https://hashpaylink.com
```

During Phase 3 API extraction, add only the PolyDesk-owned API envs actually moved in that phase.
