# Dependency Map

This file is the extraction contract. Every PolyDesk dependency from Hash PayLink must be classified before code moves.

## Classification Labels

- `MOVE`: belongs in the PolyDesk repo.
- `KEEP_CORE`: must remain in Hash PayLink.
- `CALL_CORE_API`: PolyDesk should call Hash PayLink through a stable API.
- `DUPLICATE_SAFE`: small pure utility or UI code can be copied.
- `REPLACE`: should be rewritten for the standalone app.
- `DELETE`: not needed in PolyDesk.

## Frontend Candidates

| Source | Classification | Notes |
| --- | --- | --- |
| `src/pages/PolyDesk.tsx` | `MOVE_FIRST` | Best extraction seed. This is already the standalone PolyDesk route and wraps Desk Agent, Portfolio, World Cup, World Cup News/Scores, and LP Scout without the full Telegram product shell. |
| `src/pages/TelegramPaymentLinks.tsx` PolyDesk exported panels | `MOVE` / `REFACTOR` | Extract only exported PolyDesk panels and their direct helpers/types. Do not copy the whole Telegram mega-page blindly. |
| `src/pages/PaymentPage.tsx` Polymarket funding branch | `CALL_CORE_API` | Checkout/payment remains Hash PayLink. PolyDesk should request funding links and observe status. |
| `src/main.tsx` Privy config | `DUPLICATE_SAFE` / `REPLACE` | New repo should define its own Privy config. Consider separate Privy app ID. |
| `src/lib/PrivyLoginProvider.tsx` | `DUPLICATE_SAFE` | Pure login launcher helper if still useful. |
| `src/lib/PrivyConnectButton.tsx` | `DUPLICATE_SAFE` | Reuse if it avoids UX regressions. |
| Hash PayLink layout/navigation | `REPLACE` | PolyDesk should have a focused product shell. |
| Payment/POS/bank UI | `DELETE` | Not part of standalone PolyDesk. |

## Verified Frontend Extraction Ranges

Source: `src/pages/TelegramPaymentLinks.tsx`

| Range | Component / Section | Classification | Notes |
| --- | --- | --- | --- |
| `104-108` | Telegram service IDs for PolyDesk lanes | `REPLACE` | New repo should use its own route IDs instead of Telegram service IDs. |
| `121-123` | `LpScoutMode`, `LpScoutPrefill` | `MOVE` | Required by `PolyDesk.tsx` and LP Scout. |
| `593-616` | PolyDesk submode definitions/inference | `MOVE` / `REPLACE` | Useful for Desk Agent lane selection; may be simplified in new shell. |
| `1176-1228` | Generic Polymarket bridge prep in Telegram request flow | `CALL_CORE_API` | This should become a Hash PayLink funding-link client call. |
| `2529-2904` | Desk Agent PolyDesk conversation helpers | `MOVE` / `REFACTOR` | Contains portfolio/worldcup/LP Scout agent logic and funding draft creation. Must be extracted away from Telegram assumptions. |
| `3586-3605` | `PolyDeskBackButton`, `PolyDeskMenuCard` | `DUPLICATE_SAFE` | Small UI primitives. |
| `3661-3900` | `LpScoutPanel` | `MOVE` | LP Scout UX, x402 wallet manager handoff, daily stream access. Requires x402 billing boundary decision. |
| `3915-4700` | World Cup news/feed types and panels | `MOVE` | Uses `/api/poly-worldcup-news`, LP Scout prefill, scores handoff. |
| `4700-6040` | Poly Stream / World Cup score-market panel | `MOVE` | Uses `/api/poly-stream`; must be verified against live match data. |
| `6059-6105` | `buildPolymarketPayLink` | `REPLACE_WITH_CLIENT` | New PolyDesk should call Hash PayLink funding-link API instead of constructing raw checkout URLs everywhere. |
| `6437-6704` | PolyDesk order/auth/browser-submit helpers | `MOVE` | Critical trading helpers. Must keep debug sanitized and preserve owner/deposit-wallet semantics. |
| `6704-9275` | `PolyPortfolioPanel` | `MOVE` / `SPLIT` | Large component containing profile, deposit wallet activation, funding, withdraw, positions, settings, and sell. Split into smaller modules during extraction. |
| `7423-7708` | `sellPosition` flow | `MOVE_CRITICAL` | Preserve verified neg-risk spender fix: `negRiskAdapter` for neg-risk conditional-token approval. |
| `9290+` | `PolyWorldCupHubPanel` and trailing panels | `MOVE` | Standalone World Cup hub UX. |

Source: `src/pages/PolyDesk.tsx`

| Section | Classification | Notes |
| --- | --- | --- |
| Entire file | `MOVE_FIRST` | This should be copied before individual panels. It provides the minimal standalone PolyDesk shell and route/view state. |
| Imports from `./TelegramPaymentLinks` | `TEMPORARY` | In new repo, replace with local extracted modules under `src/features/*`. |
| `PolymarketMark`, `PolyDeskLiveAgentIcon`, `ServiceHubIcon` | `DUPLICATE_SAFE` | Inline visual components can move as-is initially. |
| Route query handling | `MOVE` / `SIMPLIFY` | Keep `service`, `lane`, `agent`; remove legacy Hash PayLink assumptions once standalone routes exist. |

## API Candidates

| Source | Classification | Notes |
| --- | --- | --- |
| `api/polymarket-portfolio.ts` | `MOVE` | Profile, deposit wallet, watchlist, alerts, funding log should live with PolyDesk. |
| `api/polymarket-bridge.ts` | `SPLIT` | Polymarket bridge/status can move, but payment checkout creation should call Hash PayLink. |
| `api/polymarket-order.ts` | `MOVE` | Trade preparation belongs to PolyDesk. |
| `api/polymarket-builder-handoff.ts` | `MOVE` | Polymarket-specific order handoff belongs to PolyDesk. |
| `api/polymarket-relayer-builder-signer.ts` | `MOVE` | Polymarket relayer signer is trade infrastructure. |
| `api/polymarket-submit-order.ts` | `MOVE` | If retained, belongs to PolyDesk trading backend. |
| `api/poly-stream.ts` | `MOVE` | World Cup/upcoming match and Polymarket matching belongs to PolyDesk. |
| `api/poly-worldcup-news.ts` | `MOVE` | Polymarket/World Cup content belongs to PolyDesk. |
| `api/x402-polymarket-scout.ts` | `MOVE` | Polymarket scout service belongs to PolyDesk, while x402 billing may call Hash PayLink/OKX.AI later. |
| `api/zeroscout-polymarket-brief.ts` | `MOVE` | Polymarket intelligence service belongs to PolyDesk. |
| `api/agent-wallet.ts` | `RETIRED_IN_POLYDESK` | Hash PayLink checkout owns wallet access and funding; PolyDesk receives only checkout status and trusted receipt links. |
| `api/receipt.ts` | `KEEP_CORE` / `CALL_CORE_API` | Core receipt system should remain in Hash PayLink. |
| POS, Monnify, Paycrest, bank APIs | `KEEP_CORE` | Never copy into PolyDesk. |

## Verified API Responsibilities

| API | Env / Dependencies | Classification | Notes |
| --- | --- | --- | --- |
| `api/polymarket-bridge.ts` | `POLYMARKET_BUILDER_CODE`, `POLYMARKET_RELAYER_URL`, `POLYMARKET_RPC_URL`, `POLYGON_RPC_URL`, `viem`, `@solana/web3.js` | `SPLIT` | Deposit/withdraw/status and pUSD balance are PolyDesk concerns. Hosted payment checkout remains Hash PayLink. |
| `api/polymarket-order.ts` | `POLYMARKET_BUILDER_CODE`, `POLYMARKET_BUILDER_SIGNER_URL`, `POLYMARKET_BUILDER_API_KEY`, `POLYMARKET_BUILDER_SECRET`, `POLYMARKET_BUILDER_PASSPHRASE`, `POLYMARKET_ORDER_SIGNING_ENABLED` | `MOVE` | Prepares builder metadata and validates order readiness. |
| `api/polymarket-builder-handoff.ts` | `POLYMARKET_BUILDER_CODE`, builder creds, `polymarket-builder-session` | `MOVE` | Validates signed order body and creates one-time browser submission handoff. |
| `api/polymarket-relayer-builder-signer.ts` | `POLYMARKET_BUILDER_API_KEY`, `POLYMARKET_BUILDER_SECRET`, `POLYMARKET_BUILDER_PASSPHRASE` | `MOVE_CRITICAL` | Generates builder headers for deposit-wallet `/submit`; validation now allows deadlines up to 1800s. |
| `api/polymarket-builder-signer.ts` | builder session + builder creds | `MOVE` | One-time builder header generation for CLOB `/order`. |
| `api/polymarket-builder-session.ts` | in-memory/session store | `MOVE` | Handoff session storage. Review expiry and deploy scaling before production split. |
| `api/polymarket-submit-order.ts` | Polymarket CLOB | `MOVE_OR_DELETE` | Browser submit is current preferred path; keep only if still used after extraction. |
| `api/polymarket-portfolio.ts` | `DATABASE_URL`, Privy app secret, Polymarket builder/relayer/RPC, email | `MOVE` | Owns PolyDesk profile, alerts, watchlist, funding attempts, deposit wallet verification. |
| `api/poly-stream.ts` | `POLY_STREAM_*`, `POLYMARKET_*`, Gamma/CLOB APIs | `MOVE` | World Cup live fixture and market matching. |
| `api/poly-worldcup-news.ts` | `POLY_NEWS_*` | `MOVE` | News feed for World Cup market context. |
| `api/x402-polymarket-scout.ts` | `X402_*`, Polymarket Gamma/CLOB APIs | `MOVE_WITH_BILLING_DECISION` | Product logic belongs to PolyDesk; billing may remain Hash PayLink/OKX.AI during transition. |
| `api/zeroscout-polymarket-brief.ts` | ZeroScout/intelligence dependencies | `MOVE` | Polymarket operator signal generation. |

## Database Tables

| Table | Classification | Notes |
| --- | --- | --- |
| `polymarket_profiles` | `MOVE` | PolyDesk account state. |
| `polymarket_alert_settings` | `MOVE` | PolyDesk alert preferences. |
| `polymarket_watchlist` | `MOVE` | PolyDesk watchlist. |
| `polymarket_funding_attempts` | `MOVE` | PolyDesk should track funding attempts and call Hash PayLink for checkout. |
| `polymarket_alert_history` | `MOVE` | PolyDesk alert history. |
| payment/receipt/POS/bank tables | `KEEP_CORE` | Core platform tables stay in Hash PayLink. |

## Stable Hash PayLink API Boundary

PolyDesk should integrate with Hash PayLink through these future stable endpoints:

- `POST /api/polydesk/funding-link`
  - Input: amount, network, deposit wallet, Polymarket wallet, return target, request ID.
  - Output: hosted Hash PayLink checkout URL.

- `GET /api/polydesk/funding-status?requestId=...`
  - Input: request ID or deposit address.
  - Output: payment status, bridge status, transaction hash.

- `GET /api/receipt/:id`
  - Existing receipt lookup if needed.

- `POST /api/agent-session/notice`
  - Optional future endpoint to post funding-complete messages back into an agent session.

## Open Questions

- Should PolyDesk use its own Privy app ID or reuse Hash PayLink during migration?
- Should the first standalone deployment be `polydesk.hashpaylink.com` or a separate domain?
- Does PolyDesk own x402 billing for LP Scout, or does OKX.AI own billing once ASP registration is live?
- Which World Cup data provider is authoritative for hackathon demo reliability?
