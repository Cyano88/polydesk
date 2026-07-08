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

- Which Polymarket APIs move into this repo.
- Which Hash PayLink payment APIs remain remote dependencies.
- Which database tables migrate.
- Which env vars are required by PolyDesk only.
- Which env vars must stay private to Hash PayLink core.
