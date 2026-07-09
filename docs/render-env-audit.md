# Render Env Audit For PolyDesk

Date: 2026-07-09

## Source Audited

Audited local Hash PayLink Render config:

- `C:\Users\USER\Desktop\polymarket-lp-sentinel\hashkey-paylink\render.yaml`

This audit only records env names and ownership. Secret values are not copied or printed.

## Render Already Has PolyDesk-Relevant Keys

These appear in the Hash PayLink `render.yaml` and should be recreated in the standalone PolyDesk Render service or env group as appropriate.

| Key | Render status in Hash PayLink | PolyDesk use |
| --- | --- | --- |
| `VITE_AUTH_BRIDGE` | fixed value `hybrid` | Enables Privy-backed public sessions. |
| `VITE_PRIVY_APP_ID` | `sync: false` | Browser Privy app id. |
| `PRIVY_APP_ID` | `sync: false` | Server Privy app id for authenticated APIs. |
| `PRIVY_APP_SECRET` | `sync: false` | Server Privy verification secret. |
| `DATABASE_URL` | `sync: false` | Durable portfolio/profile/agent state. Use a PolyDesk-owned DB for standalone production. |
| `HASH_PAYLINK_BASE_URL` | fixed `https://hashpaylink.com` | Temporary funding/agent service origin during bridge phase. |
| `ZEROSCOUT_API_URL` | fixed `https://zeroscout.app` | ZeroScout intelligence endpoint. |
| `ZEROSCOUT_INTEGRATION_SECRET` | `sync: false` | Server-only ZeroScout secret. |
| `ZEROSCOUT_HASHWATCH_MEDIA_MODEL` | fixed | Optional copied agent helper behavior. |
| `ZEROSCOUT_HASHWATCH_MEDIA_MODEL_CANDIDATES` | fixed | Optional copied agent helper behavior. |
| `ZEROSCOUT_HASHWATCH_MEDIA_PROVIDER` | fixed | Optional copied agent helper behavior. |
| `ZEROSCOUT_HASHWATCH_MEDIA_GUIDANCE_TIMEOUT_MS` | fixed | Optional copied agent helper behavior. |
| `OG_RPC_URL` | `sync: false` | Optional 0G archive RPC. |
| `OG_INDEXER_RPC_URL` | `sync: false` | Optional 0G storage indexer. |
| `POLYMARKET_BUILDER_CODE` | `sync: false` | Polymarket builder attribution/bridge calls. |
| `POLYMARKET_BUILDER_API_KEY` | `sync: false` | Polymarket builder credential. |
| `POLYMARKET_BUILDER_SECRET` | `sync: false` | Polymarket builder credential. |
| `POLYMARKET_BUILDER_PASSPHRASE` | `sync: false` | Polymarket builder credential. |
| `POLY_STREAM_PROVIDER` | fixed `sportmonks` | Source deployment setting; current extracted code uses the concrete stream envs below. |
| `POLY_STREAM_API_KEY` | `sync: false` | Sports provider API key if the feed needs it. |
| `POLY_STREAM_LEAGUE_ID` | fixed `732` | World Cup feed. |
| `POLY_STREAM_SEASON` | fixed `2026` | World Cup feed. |
| `POLY_STREAM_FIXTURE_MODE` | fixed `auto` | World Cup feed mode. |
| `POLY_STREAM_LIMIT` | fixed `64` | World Cup feed limit. |
| `POLYMARKET_MATCH_URLS` | `sync: false` | Exact fixture/team-to-Polymarket URL map. This is likely the "Polymarket URL on Render" the user referenced. |

## Important Missing Keys For Standalone PolyDesk

These are required or strongly recommended by the standalone PolyDesk backend but were not found in the audited Hash PayLink `render.yaml`.

| Key | Priority | Why |
| --- | --- | --- |
| `POLYMARKET_RELAYER_URL` or `RELAYER_URL` | Required | Deposit wallet derivation, bridge config, and builder/relayer-backed flows need the relayer endpoint. |
| `POLYMARKET_RPC_URL` or `POLYGON_RPC_URL` | Recommended | Stable Polygon RPC for portfolio/bridge calls. Code can fall back to viem default when blank, but production should not rely on that. |
| `VITE_PUBLIC_PAYLINK_ORIGIN` | Required | Frontend funding links and Hash PayLink bridge origin. Set to `https://hashpaylink.com` during transition. |
| `DEFAULT_AGENT_WALLET_ADDRESS` | Recommended | Agent wallet identity shown by Desk Agent. |
| `AGENT_WALLET_SERVICE_SECRET` | Recommended | Protects agent wallet service operations. |
| `X402_SELLER_ADDRESS` or `TREASURY_ADDRESS` | Required for LP Scout x402 | Seller address for x402 paid LP Scout. |
| `X402_POLYMARKET_SCOUT_PRICE` | Required for LP Scout x402 | Paid scout price, for example `$0.01`. |
| `X402_FACILITATOR_URL` | Recommended/required for selected x402 network | Circle facilitator endpoint. |
| `X402_ACCEPT_NETWORKS` | Recommended | Network allowlist for x402 payments. |
| `X402_POLYMARKET_SCOUT_URL` | Recommended | Exact x402 LP Scout service URL for agent allowlists. |
| `CIRCLE_GATEWAY_API_BASE` | Recommended | x402 receipt verification endpoint base. |
| `CIRCLE_X402_RECEIPT_API_KEY` or `CIRCLE_GATEWAY_API_KEY` or `CIRCLE_API_KEY` | Recommended | x402 receipt verification. Existing Hash PayLink Render has `CIRCLE_API_KEY`, but standalone PolyDesk should prefer a narrower key if available. |
| `POLY_STREAM_BASE_URL` | Recommended | Current validator warns on it; copied feed can still use configured/default source paths, but production should explicitly set feed origin if required. |

## Deploy Env Set

For standalone PolyDesk, configure this minimal env group first:

The repo also contains `render.yaml` with these same deployment boundaries. Fixed non-secret defaults are committed there; every secret, dashboard-managed URL, and account-specific value is marked `sync: false`.

```env
PORT=3000
VITE_AUTH_BRIDGE=hybrid
VITE_PRIVY_APP_ID=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
DATABASE_URL=
VITE_PUBLIC_PAYLINK_ORIGIN=https://hashpaylink.com
HASH_PAYLINK_BASE_URL=https://hashpaylink.com

POLYMARKET_CHAIN_ID=137
POLYMARKET_RELAYER_URL=
POLYMARKET_RPC_URL=
POLYMARKET_BUILDER_CODE=
POLYMARKET_BUILDER_API_KEY=
POLYMARKET_BUILDER_SECRET=
POLYMARKET_BUILDER_PASSPHRASE=
POLYMARKET_ORDER_SIGNING_ENABLED=

POLY_STREAM_FIXTURE_MODE=auto
POLY_STREAM_LIMIT=64
POLY_STREAM_LEAGUE_ID=732
POLY_STREAM_SEASON=2026
POLYMARKET_MARKET_LOOKUP=1
POLYMARKET_LOOKUP_LIMIT=20
POLYMARKET_WORLD_CUP_LIMIT=100
POLYMARKET_MATCH_URLS={}

ZEROSCOUT_API_URL=https://zeroscout.app
ZEROSCOUT_INTEGRATION_SECRET=

DEFAULT_AGENT_SLUG=polydesk-agent
DEFAULT_AGENT_WALLET_CHAIN=BASE
DEFAULT_AGENT_CHAIN=BASE
DEFAULT_AGENT_WALLET_ADDRESS=
AGENT_WALLET_SERVICE_SECRET=
AGENT_WALLET_ALLOWED_SERVICE_URLS=

X402_SELLER_ADDRESS=
X402_POLYMARKET_SCOUT_PRICE=$0.01
X402_FACILITATOR_URL=
X402_ACCEPT_NETWORKS=
X402_POLYMARKET_SCOUT_URL=

CIRCLE_GATEWAY_API_BASE=
CIRCLE_X402_RECEIPT_API_KEY=
```

Optional after the first live smoke:

```env
POLY_STREAM_API_KEY=
POLY_STREAM_BASE_URL=
POLYMARKET_ALLOW_GENERIC_URLS=
POLY_NEWS_QUERY_PARAM=
POLY_NEWS_LIMIT_PARAM=
POLY_NEWS_LIMIT=
POLY_NEWS_API_AUTH_HEADER=
POLY_NEWS_API_KEY_PARAM=
POLYMARKET_ALERT_FROM_EMAIL=
POLYMARKET_ALERT_FROM_NAME=
RESEND_API_KEY=
OG_RPC_URL=
OG_INDEXER_RPC_URL=
OG_STORAGE_KEY=
OG_ARCHIVE_ADDRESS=
AGENT_LEGAL_TERMS_URL=
AGENT_LEGAL_ENTITY_NAME=
AGENT_LEGAL_ENTITY_TYPE=
AGENT_LEGAL_JURISDICTION=
AGENT_OPERATOR_ROLE=
AGENT_GOVERNANCE_VERSION=
AGENT_MODEL_ID=
AGENT_PROMPT_HASH=
AGENT_CONFIG_HASH=
AGENT_OPERATING_AGREEMENT_HASH=
AGENT_GOVERNANCE_UPDATED_AT=
```

## Testing After Render Env Is Set

After deploy:

```bash
POLYDESK_SMOKE_URL=https://<polydesk-render-domain> npm run smoke
```

Then manually test:

- Privy email and wallet login.
- Portfolio profile.
- Deposit wallet status.
- pUSD balance.
- World Cup full market list.
- Funding from Portfolio and Desk Agent.
- Buy/sell wallet signing.
- LP Scout unpaid 402 response and paid x402 flow.
