# PolyDesk API Surface Audit

Date: 2026-07-09

## Boundary

The standalone PolyDesk frontend is now source-cloned from Hash PayLink for the operational app surface. Backend extraction must follow the same rule: move only the APIs called by the cloned PolyDesk pages, and do not import unrelated Hash PayLink payment, POS, bank, creator, treasury, or payout services unless a cloned PolyDesk call requires them.

During migration, Vite local development can continue to proxy `/api` to the Hash PayLink backend on `127.0.0.1:3000`. The standalone PolyDesk server now mounts the Polymarket, World Cup, Desk Agent, agent wallet/profile/verify, ZeroScout brief, LP Scout x402, and x402 receipt APIs directly.

## Extracted In Standalone Server

Mounted in `server.ts`:

- `/api/polymarket-bridge`
- `/api/polymarket-builder-handoff`
- `/api/polymarket-builder-signer`
- `/api/polymarket-order`
- `/api/polymarket-portfolio`
- `/api/polymarket-relayer-builder-signer`
- `/api/polymarket-submit-order`
- `/api/poly-worldcup-news`
- `/api/poly-stream`
- `/api/agent-verify`
- `/api/agent-ask`
- `/api/agent-wallet`
- `/api/agent-profile`
- `/api/okx-marketplace-checkout`
- `/api/x402/polymarket-scout`
- `/api/zeroscout/polymarket-brief`
- `/api/x402/receipt`
- `/api/health`

Support files copied:

- `api/rate-limit.ts`
- `api/polymarket-builder-session.ts`
- `api/email-provider.ts`
- `api/agent-activity.ts`
- `api/agent-legal.ts`
- `api/render-durable-store.ts`
- `api/zeroscout-intelligence.ts`
- `api/zeroscout-sponsored-action.ts`
- `api/og-storage.ts`
- `api/polydesk-hashpaystream-context.ts`
- `api/polydesk-streampay-receipts.ts`

Small standalone-only type guards were added in copied backend files so the extracted server can pass `tsconfig.server.json` without changing runtime behavior.

The `polydesk-hashpaystream-context` and `polydesk-streampay-receipts` adapters are intentional boundary files. They keep the PolyDesk agent and x402 receipt routes mounted without importing Hash PayLink's Streampay creator/checkpoint content module.

## Frontend Call Sites

Source-cloned files using backend routes:

- `src/pages/TelegramPaymentLinks.tsx`
- `src/pages/AgentWorkspace.tsx`

Operational areas covered:

- Desk Agent: `/api/agent-ask`, `/api/agent-wallet`, `/api/agent-profile`, `/api/agent-verify`, `/api/zeroscout/polymarket-brief`
- Portfolio: `/api/polymarket-portfolio`, `/api/polymarket-bridge`
- World Cup: `/api/poly-stream`, `/api/poly-worldcup-news`
- Trading execution: `/api/polymarket-order`, `/api/polymarket-builder-handoff`, `/api/polymarket-relayer-builder-signer`, optional `/api/polymarket-submit-order`
- LP Scout: `/api/x402/polymarket-scout`, `/api/x402/receipt`

## Required Routes

| Route | Source file | Priority | Why it is needed |
| --- | --- | --- | --- |
| `/api/polymarket-portfolio` | `api/polymarket-portfolio.ts` | P0 | Loads owner/deposit wallet profile, portfolio value, positions, alert settings, funding logs, disconnect flows, and deposit-wallet verification. |
| `/api/polymarket-bridge` | `api/polymarket-bridge.ts` | P0 | Handles pUSD balance, funding preparation, allowance checks, config reads, and withdraw flow support. |
| `/api/poly-stream` | `api/poly-stream.ts` | P0 | Powers the World Cup match hub and market routing. This is the route that prevents the app from showing only one stale France fixture. |
| `/api/poly-worldcup-news` | `api/poly-worldcup-news.ts` | P0 | Powers World Cup news inside the market hub. |
| `/api/polymarket-order` | `api/polymarket-order.ts` | P0 | Prepares Polymarket order payloads for buy and sell flows. |
| `/api/polymarket-builder-handoff` | `api/polymarket-builder-handoff.ts` | P0 | Creates builder handoff payloads used after wallet signing. |
| `/api/polymarket-builder-signer` | `api/polymarket-builder-signer.ts` | P0 | Builder signing support used by the Polymarket execution stack. |
| `/api/polymarket-relayer-builder-signer` | `api/polymarket-relayer-builder-signer.ts` | P0 | Used by browser-side builder config for approval and relayer-backed signing. |
| `/api/polymarket-submit-order` | `api/polymarket-submit-order.ts` | P1 | Server submit fallback. Keep available until the browser-submit path is fully verified in standalone production. |
| `/api/agent-ask` | `api/agent-ask.ts` | P0 | Desk Agent natural-language workflow and paid helper usage checks. |
| `/api/agent-wallet` | `api/agent-wallet.ts` | P0 | Agent wallet lookup, x402 service wallet details, and agent payment/gateway helpers. |
| `/api/agent-profile` | `api/agent-profile.ts` | P0 | Agent profile metadata used by `AgentWorkspace`. |
| `/api/agent-verify` | `api/agent-verify.ts` | P1 | Verifies paid agent events. Required for complete Desk Agent receipts and payment confirmation. |
| `/api/zeroscout/polymarket-brief` | `api/zeroscout-polymarket-brief.ts` | P1 | Desk Agent/ZeroScout Polymarket brief generation. |
| `/api/x402/polymarket-scout` | `api/x402-polymarket-scout.ts` | P0 | LP Scout x402 service endpoint. |
| `/api/x402/receipt` | `api/x402-receipt.ts` | P1 | x402 receipt lookup and payment verification support. |

## Server Registration From Source

Hash PayLink currently registers the required routes in `server.ts`:

```ts
app.all('/api/polymarket-bridge', strictLimiter, polymarketBridgeHandler)
app.post('/api/polymarket-builder-handoff', strictLimiter, polymarketBuilderHandoffHandler)
app.post('/api/polymarket-builder-signer', strictLimiter, polymarketBuilderSignerHandler)
app.post('/api/polymarket-order', strictLimiter, polymarketOrderHandler)
app.all('/api/polymarket-portfolio', readLimiter, polymarketPortfolioHandler)
app.post('/api/polymarket-relayer-builder-signer', strictLimiter, polymarketRelayerBuilderSignerHandler)
app.post('/api/polymarket-submit-order', strictLimiter, polymarketSubmitOrderHandler)
app.all('/api/agent-verify', strictLimiter, agentVerifyHandler)
app.post('/api/agent-ask', strictLimiter, agentAskHandler)
app.all('/api/agent-wallet', strictLimiter, agentWalletHandler)
app.all('/api/agent-profile', strictLimiter, agentProfileHandler)
app.get('/api/poly-worldcup-news', readLimiter, polyWorldcupNewsHandler)
app.get('/api/poly-stream', readLimiter, polyStreamHandler)
app.get('/api/x402/polymarket-scout', strictLimiter, x402PolymarketScoutHandler)
app.post('/api/zeroscout/polymarket-brief', strictLimiter, zeroScoutPolymarketBriefHandler)
app.get('/api/x402/receipt', readLimiter, x402ReceiptHandler)
```

## Environment Variables To Carry Forward

### Polymarket Portfolio And Trading

- `DATABASE_URL`
- `POSTGRES_URL`
- `PRIVY_APP_ID`
- `VITE_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `POLYMARKET_CHAIN_ID`
- `POLYMARKET_RPC_URL`
- `POLYGON_RPC_URL`
- `POLYMARKET_RELAYER_URL`
- `RELAYER_URL`
- `POLYMARKET_BUILDER_CODE`
- `POLYMARKET_BUILDER_API_KEY`
- `BUILDER_API_KEY`
- `POLYMARKET_BUILDER_SECRET`
- `BUILDER_SECRET`
- `POLYMARKET_BUILDER_PASS_PHRASE`
- `POLYMARKET_BUILDER_PASSPHRASE`
- `BUILDER_PASS_PHRASE`
- `BUILDER_PASSPHRASE`
- `POLYMARKET_ORDER_SIGNING_ENABLED`

### Portfolio Alerts

- `POLYMARKET_ALERT_FROM_EMAIL`
- `ALERT_FROM_EMAIL`
- `AGENTIC_STREAMING_FROM_EMAIL`
- `STREAM_INVITE_FROM_EMAIL`
- `POLYMARKET_ALERT_FROM_NAME`

### World Cup Data

- `POLY_STREAM_FIXTURE_MODE`
- `POLY_STREAM_LIMIT`
- `POLYMARKET_MATCH_URLS`
- `POLYMARKET_ALLOW_GENERIC_URLS`
- `POLY_STREAM_LEAGUE_ID`
- `POLY_STREAM_SEASON`
- `POLY_STREAM_BASE_URL`
- `POLY_STREAM_LIVE_INCLUDE`
- `POLY_STREAM_INCLUDE`
- `POLY_STREAM_START_DATE`
- `POLY_STREAM_DETAIL_INCLUDE`
- `POLY_STREAM_DETAIL_LIMIT`
- `POLYMARKET_WORLD_CUP_LIMIT`
- `POLYMARKET_LOOKUP_LIMIT`
- `POLYMARKET_MARKET_LOOKUP`
- `POLY_NEWS_QUERY_PARAM`
- `POLY_NEWS_LIMIT_PARAM`
- `POLY_NEWS_LIMIT`
- `POLY_NEWS_API_AUTH_HEADER`
- `POLY_NEWS_API_KEY_PARAM`

### Desk Agent And Agent Wallet

- `DATA_PATH`
- `AGENT_WALLET_PROVISION_STORE`
- `AGENT_WALLET_CIRCLE_SESSION_PATH`
- `CIRCLE_CLI_ENABLED`
- `AGENT_WALLET_SERVICE_SECRET`
- `DEFAULT_AGENT_SLUG`
- `DEFAULT_AGENT_WALLET_ADDRESS`
- `DEFAULT_AGENT_WALLET_CHAIN`
- `DEFAULT_AGENT_CHAIN`
- `HASH_PAYLINK_BASE_URL`
- `AGENT_WALLET_ALLOWED_SERVICE_URLS`
- `AGENT_WALLET_MAX_SERVICE_AMOUNT`
- `AGENT_WALLET_MAX_GATEWAY_DEPOSIT_AMOUNT`
- `AGENT_WALLET_GATEWAY_BALANCE_CHAIN`
- `AGENT_WALLET_GATEWAY_DEPOSIT_CHAIN`
- `AGENT_WALLET_GATEWAY_DEPOSIT_VERIFY_ATTEMPTS`
- `AGENT_WALLET_GATEWAY_DEPOSIT_VERIFY_DELAY_MS`
- `AGENT_WALLET_REGISTRY`
- `AGENT_PROFILE_STORE`
- `AGENT_PROFILE_STORE_KEY`
- `HELPER_SIMPLE_DAILY_PROMPT_LIMIT`
- `HELPER_DAILY_PROMPT_LIMIT`
- `HELPER_DEEP_DAILY_PROMPT_LIMIT`
- `HELPER_USAGE_STORE`
- `HELPER_USAGE_STORE_KEY`
- `HELPER_VERIFY_TIMEOUT_MS`
- `AGENT_HASH_PRO_TREASURY`
- `TREASURY_ADDRESS`
- `OG_RPC_URL`
- `OG_EVM_RPC_URL`
- `ZG_RPC_URL`
- `OG_FROM_BLOCK`

### LP Scout And x402

- `X402_SELLER_ADDRESS`
- `TREASURY_ADDRESS`
- `X402_POLYMARKET_SCOUT_PRICE`
- `X402_POLYMARKET_SCOUT_URL`
- `X402_POLYMARKET_SCOUT_MAX_AMOUNT`
- `X402_FACILITATOR_URL`
- `X402_ACCEPT_NETWORKS`
- `CIRCLE_GATEWAY_API_BASE`
- `CIRCLE_X402_RECEIPT_API_KEY`
- `CIRCLE_GATEWAY_API_KEY`
- `CIRCLE_API_KEY`

## Migration Phases

1. **Backend shell and route registration**
   - Add the standalone server entry.
   - Register the exact routes above with equivalent limiter semantics.
   - Keep `/api` paths stable so the cloned frontend does not change.

2. **P0 read and account APIs**
   - Move `polymarket-portfolio`, `polymarket-bridge`, `poly-stream`, and `poly-worldcup-news`.
   - Verify portfolio profile, pUSD balance, positions, World Cup markets, match hub, and news before moving execution routes.

3. **P0 trading execution APIs**
   - Move `polymarket-order`, `polymarket-builder-handoff`, `polymarket-builder-signer`, and `polymarket-relayer-builder-signer`.
   - Preserve the exact CLOB auth, builder, relayer, allowance, and POLY_1271 behavior already debugged in Hash PayLink.
   - Keep `/api/polymarket-submit-order` as a fallback until browser submit is proven in standalone production.

4. **Desk Agent and LP Scout APIs**
   - Move `agent-ask`, `agent-wallet`, `agent-profile`, `agent-verify`, `zeroscout-polymarket-brief`, `x402-polymarket-scout`, and `x402-receipt`.
   - Verify paid x402 calls and agent wallet service URL allowlists after the standalone domain is known.

5. **Funding success routing**
   - If funding starts from Desk Agent, success should return to the last/current agent session and preserve task context.
   - If funding starts from the Portfolio menu, success should return to the Portfolio view after transaction confirmation.
   - If Hash PayLink remains the funding checkout host during transition, the success page must consume the existing intent flags and redirect back to the standalone PolyDesk origin.

## Verification Checklist

- `/polydesk?service=portfolio` loads owner wallet, deposit wallet, pUSD balance, and positions.
- Funding from Portfolio returns to Portfolio after confirmation.
- Funding from Desk Agent returns to the active agent session after confirmation.
- `/polydesk?service=worldcup` shows live match feed data and more than a single stale France market when the upstream data contains more matches.
- Buy flow reaches wallet signature, submits order, and updates positions.
- Sell flow uses custom PolyDesk confirmation UI, not a native browser `confirm()` popup.
- Sell flow approves conditional tokens only through the verified POLY_1271/builder route.
- LP Scout x402 payment and receipt work from the standalone domain.
- Privy modal still shows both email and wallet login methods.
