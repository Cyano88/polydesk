# PolyDesk Extraction Audit

Date: 2026-07-08

Source repo: `C:\Users\USER\Desktop\polymarket-lp-sentinel\hashkey-paylink`

Target repo: `C:\Users\USER\Desktop\polydesk`

## Known-Good Source Commits

- `c8de9139e Fix PolyDesk sell neg-risk approval spender`
  - Verified sell fix for neg-risk positions.
  - Root cause: sell approval used `negRiskExchangeV2` while CLOB required allowance for `negRiskAdapter`.
  - Current sell flow approves the same spender CLOB checks.

- `a4b73337f Polish PolyDesk funding return and agent login`
  - Agent-initiated funding returns after confirmed bridge state instead of waiting for receipt proof.
  - Agent workspace Privy launcher allows `email` and `wallet`.

## Production State To Verify Before Extraction

- Hash PayLink health endpoint returns `200 OK`.
- `/polydesk` serves the latest committed bundle for the working PolyDesk state.
- Buy flow works from connected Privy owner wallet and Polymarket deposit wallet.
- Sell flow works for the France position and no longer fails on conditional-token allowance.
- Funding initiated from the agent returns to the agent context after funding confirmation.
- Funding initiated from portfolio returns to portfolio trading wallet.
- Privy modal behavior:
  - Global config supports `email` and `wallet`.
  - Agent workspace no longer forces email-only.
  - Bank/POS-specific flows may remain email-only where the product requires email records.
- World Cup markets show the live/upcoming match set, not only the France market.

## Current Verified Fixes

### Sell Approval Spender

Source file:

- `src/pages/TelegramPaymentLinks.tsx`

Current rule:

```ts
const sellExchangeAddress = negRisk === true ? contractConfig.negRiskAdapter : contractConfig.exchangeV2
```

Reason:

- CLOB returned allowance error for spender `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`.
- `@polymarket/clob-client-v2` identifies this address as `negRiskAdapter`.
- Sell approval must target the CLOB spender, not `negRiskExchangeV2`.

### Funding Return

Source file:

- `src/pages/PaymentPage.tsx`

Current rule:

- Agent-initiated Polymarket funding should return after payment is confirmed and bridge status is not `idle` or `checking`.
- Receipt proof/0G archival should continue in background and must not block returning to the agent session.

### Privy Login

Source file:

- `src/pages/AgentWorkspace.tsx`

Current rule:

```tsx
loginOptions={{ loginMethods: ['email', 'wallet'] }}
```

Reason:

- PolyDesk/agent flows may require wallet ownership continuity.
- Email-only overrides are acceptable only in product surfaces that truly require an email account, such as bank/POS history.

## Do Not Extract Yet

The following must be mapped before code is copied:

- Which Polymarket APIs move into this repo. Status: mapped in `docs/dependency-map.md`.
- Which Hash PayLink payment APIs remain remote dependencies. Status: mapped as the funding-link boundary.
- Which database tables migrate. Status: mapped in `docs/dependency-map.md`.
- Which env vars are required by PolyDesk only. Status: mapped in `docs/env-boundary.md` and `.env.example`.
- Which env vars must stay private to Hash PayLink core. Status: mapped in `docs/env-boundary.md`.

## Phase 1 Audit Findings

### Best Frontend Seed

Use `src/pages/PolyDesk.tsx` from Hash PayLink as the first frontend extraction file.

Reason:

- It already renders a focused PolyDesk shell.
- It includes Desk Agent, Portfolio, World Cup, World Cup News/Scores, and LP Scout lane routing.
- It imports PolyDesk panels from `TelegramPaymentLinks.tsx` without requiring the whole Hash PayLink payment product shell.

Do not start extraction by copying all of `TelegramPaymentLinks.tsx`. That file is still useful as a source for exported PolyDesk panels and helpers, but it also contains unrelated Telegram/payment surface code.

### Critical Frontend Ranges

Verified source ranges are recorded in `docs/dependency-map.md`.

Highest-risk ranges:

- `6437-6704`: browser-side Polymarket order/auth/submit helpers.
- `6704-9275`: `PolyPortfolioPanel`, including profile, funding, withdrawal, position, and sell behavior.
- `7423-7708`: sell flow. Preserve the verified neg-risk approval spender fix.

### API Ownership

PolyDesk should own:

- Portfolio/profile/watchlist/alert APIs.
- Polymarket bridge status, pUSD balance, and deposit-wallet readiness APIs.
- Polymarket order preparation, builder handoff, builder signer, relayer builder signer, and session APIs.
- World Cup market stream and news APIs.
- LP Scout and ZeroScout Polymarket intelligence APIs.

Hash PayLink should keep:

- Hosted checkout/payment collection.
- Generic receipts.
- POS, bank, Monnify, Paycrest, Circle, treasury, paymaster, and payout infrastructure.

### Funding Boundary

PolyDesk should request funding through a stable Hash PayLink API, not by inheriting Hash PayLink checkout internals.

Required boundary:

- `POST /api/polydesk/funding-link`
- `GET /api/polydesk/funding-status`
- optional `POST /api/agent-session/notice`

Agent-initiated funding must return to the active agent task/session. Portfolio-initiated funding must return to the portfolio trading wallet surface.

### Env Boundary

`.env.example` now lists only PolyDesk candidates and the future scoped Hash PayLink service token. It intentionally excludes Hash PayLink core payment secrets.

The first frontend-only phase should use only:

- `VITE_PRIVY_APP_ID`
- `VITE_PUBLIC_PAYLINK_ORIGIN`
- `HASH_PAYLINK_BASE_URL`

Add backend secrets only as APIs move in Phase 3.
