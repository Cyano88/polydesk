# PolyDesk Deployment Env Checklist

Date: 2026-07-09

## Goal

Deploy PolyDesk as a standalone runtime without copying unrelated Hash PayLink secrets. This checklist is based on the current standalone files in `api/`, `server.ts`, and `src/`.

For the Render-specific source audit from Hash PayLink, see `docs/render-env-audit.md`. That audit confirms `POLYMARKET_MATCH_URLS` already exists as a dashboard-managed Render key in the source deployment, while `POLYMARKET_RELAYER_URL` and a production Polygon RPC URL must be supplied separately for standalone PolyDesk.

## Runtime Commands

Use these commands for a production-style deployment:

```bash
npm install
npm run build
npm run start
```

Render can use the committed `render.yaml` blueprint:

- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Health route: `/api/health`
- Fill every `sync: false` value in Render before live smoke testing.

Expected server:

- `PORT` defaults to `3000`.
- Health route: `/api/health`.
- SPA fallback serves `dist/index.html`.

## P0 Required For App Boot

These are required for a useful production deployment.

```env
PORT=3000
VITE_PRIVY_APP_ID=
VITE_AUTH_BRIDGE=hybrid
PRIVY_APP_ID=
PRIVY_APP_SECRET=
DATABASE_URL=
POLYMARKET_CHAIN_ID=137
POLYMARKET_RPC_URL=
# or POLYGON_RPC_URL=
POLYMARKET_RELAYER_URL=
POLYMARKET_BUILDER_CODE=
POLYMARKET_BUILDER_API_KEY=
POLYMARKET_BUILDER_SECRET=
POLYMARKET_BUILDER_PASSPHRASE=
VITE_PUBLIC_PAYLINK_ORIGIN=https://hashpaylink.com
HASH_PAYLINK_BASE_URL=https://hashpaylink.com
```

Notes:

- `POSTGRES_URL` can be used instead of `DATABASE_URL`, but production should standardize on one.
- `POLYGON_RPC_URL` can be used instead of `POLYMARKET_RPC_URL`; both point the backend to Polygon.
- Use a PolyDesk-owned database, not the Hash PayLink core database, once migration is complete.
- Use a PolyDesk-owned Privy app after cutover. During transition, a shared Privy app is acceptable only if callback domains are explicitly configured.

## P0 World Cup Market Feed

Required for the World Cup tab to avoid stale or single-market behavior.

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

Validation:

- `/api/poly-stream` returns current fixture data.
- `/polydesk?service=worldcup` shows all available live/upcoming fixtures, not just one fallback market.
- `/api/poly-worldcup-news` returns current news or an explicit empty feed, not a server error.

## P0 Trading And Portfolio

Required for portfolio, deposit-wallet activation, funding state, allowance checks, buy, sell, and withdraw support.

```env
POLYMARKET_BUILDER_API_KEY=
POLYMARKET_BUILDER_SECRET=
POLYMARKET_BUILDER_PASSPHRASE=
POLYMARKET_BUILDER_PASS_PHRASE=
POLYMARKET_BUILDER_SIGNER_URL=
POLYMARKET_ORDER_SIGNING_ENABLED=
POLYMARKET_RELAYER_URL=
RELAYER_URL=
POLYMARKET_CHAIN_ID=137
POLYMARKET_RPC_URL=
# or POLYGON_RPC_URL=
POLYMARKET_ALERT_FROM_EMAIL=
POLYMARKET_ALERT_FROM_NAME=
RESEND_API_KEY=
```

Validation:

- `/api/polymarket-portfolio?action=profile` authenticates with Privy and returns a JSON response.
- `/api/polymarket-bridge` returns JSON for supported actions.
- Buy flow reaches wallet signing and CLOB submit without `invalid authorization`.
- Sell flow uses the PolyDesk UI confirmation, not a native browser confirm.
- Allowance errors name the exact spender and approval route.

## P0 Desk Agent And LP Scout

Required for the Desk Agent tab, agent wallet, paid LP Scout, ZeroScout brief, and x402 receipt paths.

```env
DEFAULT_AGENT_SLUG=polydesk-agent
DEFAULT_AGENT_WALLET_ADDRESS=
DEFAULT_AGENT_WALLET_CHAIN=BASE
DEFAULT_AGENT_CHAIN=BASE
AGENT_WALLET_SERVICE_SECRET=
AGENT_WALLET_ALLOWED_SERVICE_URLS=
AGENT_WALLET_MAX_SERVICE_AMOUNT=
AGENT_WALLET_MAX_GATEWAY_DEPOSIT_AMOUNT=
AGENT_WALLET_GATEWAY_BALANCE_CHAIN=MATIC
AGENT_WALLET_GATEWAY_DEPOSIT_CHAIN=BASE
X402_SELLER_ADDRESS=
TREASURY_ADDRESS=
X402_POLYMARKET_SCOUT_PRICE=
X402_POLYMARKET_SCOUT_MAX_AMOUNT=
X402_FACILITATOR_URL=
X402_ACCEPT_NETWORKS=
X402_POLYMARKET_SCOUT_URL=
ZEROSCOUT_API_URL=
ZEROSCOUT_INTELLIGENCE_PATH=
ZEROSCOUT_INTEGRATION_SECRET=
CIRCLE_GATEWAY_API_BASE=
CIRCLE_X402_RECEIPT_API_KEY=
# or CIRCLE_GATEWAY_API_KEY=
# or CIRCLE_API_KEY=
```

Optional operational limits:

```env
HELPER_SIMPLE_DAILY_PROMPT_LIMIT=
HELPER_DAILY_PROMPT_LIMIT=
HELPER_DEEP_DAILY_PROMPT_LIMIT=
HELPER_VERIFY_TIMEOUT_MS=
ZEROSCOUT_REQUEST_TIMEOUT_MS=
ZEROSCOUT_RETRY_ATTEMPTS=
ZEROSCOUT_RETRY_DELAY_MS=
ZEROSCOUT_SPONSOR_TIMEOUT_MS=
ZEROSCOUT_FAST_SPONSOR_TIMEOUT_MS=
ZEROSCOUT_HELPER_GUIDANCE_TIMEOUT_MS=
```

Validation:

- `/api/agent-wallet?agent=polydesk-agent` returns configured wallet metadata.
- `/api/x402/polymarket-scout` returns a payment-required response when unpaid and a scout result when paid.
- `/api/zeroscout/polymarket-brief` accepts a saved scout activity and returns a ZeroScout proof.
- `/api/x402/receipt?id=...` returns agent activity receipts.

Notes:

- `X402_FACILITATOR_URL` is optional unless the selected x402 network/provider gives a required facilitator endpoint.
- `CIRCLE_GATEWAY_API_BASE` is optional for the first testnet smoke; the receipt route defaults to Circle's testnet gateway when blank.

## P1 0G Archive

Required only if PolyDesk should archive agent/x402 receipts to 0G.

```env
OG_RPC_URL=
OG_EVM_RPC_URL=
ZG_RPC_URL=
OG_FROM_BLOCK=
OG_INDEXER_RPC_URL=
ZG_INDEXER_RPC_URL=
OG_STORAGE_KEY=
OG_ARCHIVE_ADDRESS=
```

Do not use a broad Hash PayLink relayer key unless it is explicitly scoped for PolyDesk. `RELAYER_PRIVATE_KEY` is supported by copied code as a fallback, but it should not be used for PolyDesk production if it controls unrelated infrastructure.

## P1 Legal And Governance Metadata

Useful for OKX.AI ASP positioning and x402 receipts.

```env
AGENT_LEGAL_TERMS_URL=
AGENT_LEGAL_ENTITY_NAME=
AGENT_LEGAL_ENTITY_TYPE=
AGENT_LEGAL_JURISDICTION=
AGENT_LEGAL_ENTITY_ID=
AGENT_LEGAL_EIN_LAST4=
AGENT_REGISTERED_AGENT=
AGENT_REGISTERED_AGENT_ADDRESS=
AGENT_OPERATOR_ROLE=
AGENT_GOVERNANCE_VERSION=
AGENT_MODEL_ID=
AGENT_PROMPT_HASH=
AGENT_CONFIG_HASH=
AGENT_OPERATING_AGREEMENT_HASH=
AGENT_GOVERNANCE_UPDATED_AT=
```

## Temporary Hash PayLink Dependency

Funding checkout may still depend on Hash PayLink during transition:

```env
VITE_PUBLIC_PAYLINK_ORIGIN=https://hashpaylink.com
HASH_PAYLINK_BASE_URL=https://hashpaylink.com
HASH_PAYLINK_POLYDESK_SERVICE_TOKEN=
```

Rules:

- The service token must only create Polymarket funding checkout links and query funding status.
- It must not allow POS, bank payout, generic payment-link, treasury, or admin receipt actions.
- Funding from Desk Agent must return to the active agent session.
- Funding from Portfolio must return to Portfolio.

## Do Not Move

These stay out of PolyDesk unless a later design creates a narrow service proxy:

- POS/bank payout secrets.
- Generic Hash PayLink payment-link treasury keys.
- Generic receipt signing/admin mutation keys.
- Creator/Streampay content module secrets.
- Circle wallet-set/entity secrets not required by x402 receipt lookup.
- Broad relayer private keys.

## Predeploy Verification

Run locally with production-like env:

```bash
npm run typecheck
npm run typecheck:server
npm run env:check
npm run build
npm run start
```

After the server is running:

```bash
npm run smoke
```

For a non-default local port or deployed URL:

```bash
npm run smoke -- http://127.0.0.1:3012
POLYDESK_SMOKE_URL=https://your-polydesk-domain.example npm run smoke
```

Smoke routes:

- `GET /api/health`
- `GET /polydesk?service=portfolio`
- `GET /polydesk?service=worldcup`
- `GET /api/poly-stream`
- `GET /api/poly-worldcup-news`
- `GET /api/agent-wallet?agent=polydesk-agent`
- `GET /api/x402/polymarket-scout`

Manual product checks:

- Privy modal shows both email and wallet login.
- Portfolio shows owner wallet, Polymarket wallet, pUSD cash, and positions.
- Funding success routes back to the originating surface.
- Buy and sell use PolyDesk confirmation UI.
- World Cup tab shows all available live/upcoming markets.
