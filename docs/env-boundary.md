# Environment Boundary

PolyDesk must not inherit all Hash PayLink secrets. Each environment variable must have a clear owner.

## Current Deployment Checklist

Use `docs/deployment-env-checklist.md` as the live deployment checklist. This file remains the ownership boundary: what PolyDesk may own, what Hash PayLink must keep, and what can only be bridged by a scoped service token.

## PolyDesk-Owned Candidates

These belong in the new PolyDesk repo after the relevant APIs move:

```env
VITE_PRIVY_APP_ID=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
VITE_PUBLIC_PAYLINK_ORIGIN=https://hashpaylink.com
HASH_PAYLINK_BASE_URL=https://app.hashpaylink.com

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

## PolyDesk LP Scout / Hash PayLink Env

PolyDesk delegates checkout, wallet access, payment verification, and the canonical receipt to Hash PayLink:

```env
HASH_PAYLINK_BASE_URL=https://app.hashpaylink.com
HASH_PAYLINK_AGENTIC_TEST_API_KEY=
HASH_PAYLINK_AGENTIC_LIVE_API_KEY=
HASH_PAYLINK_LP_SCOUT_PRICE=$0.01
```

The older direct facilitator, seller-address, Gateway receipt, and agent-wallet service envs are not part of the Hash PayLink LP Scout checkout.

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
- `RELAYER_PRIVATE_KEY` is supported by copied 0G archive code as a fallback, but must not be used in PolyDesk production if it controls unrelated Hash PayLink infrastructure. Prefer a PolyDesk-specific `OG_STORAGE_KEY`.

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
HASH_PAYLINK_BASE_URL=https://app.hashpaylink.com
```

During Phase 3 API extraction, add only the PolyDesk-owned API envs actually moved in that phase.
