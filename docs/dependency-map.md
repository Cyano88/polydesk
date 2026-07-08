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
| `src/pages/TelegramPaymentLinks.tsx` PolyDesk sections | `MOVE` / `REPLACE` | Extract only PolyDesk, World Cup, LP Scout, portfolio, and agent surfaces. Do not copy the whole Telegram mega-page blindly. |
| `src/pages/PaymentPage.tsx` Polymarket funding branch | `CALL_CORE_API` | Checkout/payment remains Hash PayLink. PolyDesk should request funding links and observe status. |
| `src/main.tsx` Privy config | `DUPLICATE_SAFE` / `REPLACE` | New repo should define its own Privy config. Consider separate Privy app ID. |
| `src/lib/PrivyLoginProvider.tsx` | `DUPLICATE_SAFE` | Pure login launcher helper if still useful. |
| `src/lib/PrivyConnectButton.tsx` | `DUPLICATE_SAFE` | Reuse if it avoids UX regressions. |
| Hash PayLink layout/navigation | `REPLACE` | PolyDesk should have a focused product shell. |
| Payment/POS/bank UI | `DELETE` | Not part of standalone PolyDesk. |

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
| `api/agent-wallet.ts` | `KEEP_CORE` / `CALL_CORE_API` | Core x402 wallet infrastructure should not move. PolyDesk may call it through stable APIs. |
| `api/receipt.ts` | `KEEP_CORE` / `CALL_CORE_API` | Core receipt system should remain in Hash PayLink. |
| POS, Monnify, Paycrest, bank APIs | `KEEP_CORE` | Never copy into PolyDesk. |

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
