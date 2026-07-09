# Phased Extraction Plan

## Phase 0: Freeze And Audit

Goal: protect the known-working Hash PayLink PolyDesk implementation before extraction.

Tasks:

- Confirm buy flow.
- Confirm sell flow.
- Confirm funding from portfolio.
- Confirm funding from agent.
- Confirm World Cup market coverage.
- Confirm Privy modal behavior.
- Record current known-good commits.
- Complete dependency map.

Acceptance gate:

- No code copied into PolyDesk except docs.
- Known-good source commits documented.
- All product-critical flows listed with pass/fail state.

## Phase 1: Frontend Shell

Goal: create a standalone PolyDesk app shell without moving trading logic yet.

Tasks:

- Scaffold Vite + React + TypeScript.
- Add PolyDesk product shell and routing from `src/pages/PolyDesk.tsx`.
- Add Privy config.
- Add API client pointed at Hash PayLink staging/production.
- Add placeholder pages: Desk Agent, Portfolio, World Cup, LP Scout.
- Keep `TelegramPaymentLinks.tsx` panel extraction out of this phase unless required for compile-time stubs.

Acceptance gate:

- App runs locally. Status: passed on `http://127.0.0.1:5174`.
- No Hash PayLink core UI copied. Status: passed.
- No trading/order code copied yet. Status: passed.
- Required env is limited to `VITE_PRIVY_APP_ID`, `VITE_PUBLIC_PAYLINK_ORIGIN`, and `HASH_PAYLINK_BASE_URL`. Status: passed.

## Phase 2: Frontend Extraction

Goal: move only PolyDesk frontend behavior.

Tasks:

- Extract portfolio UI.
- Extract buy/sell modals.
- Extract World Cup UI.
- Extract LP Scout UI.
- Replace Hash PayLink-specific layout/state with PolyDesk local state.
- Keep backend calls pointed at existing Hash PayLink APIs.
- Preserve verified sell spender behavior for neg-risk positions.
- Replace native browser confirmations with first-class PolyDesk confirmation UI.

Acceptance gate:

- Portfolio loads through existing APIs.
- Buy/sell UI reaches existing backend.
- Funding opens Hash PayLink checkout.
- No POS/bank/payment core UI included.

## Phase 3: API Extraction

Goal: move Polymarket-specific backend code into PolyDesk.

Tasks:

- Move portfolio API.
- Move order preparation and builder handoff APIs.
- Move relayer builder signer.
- Move World Cup/PolyStream APIs.
- Move LP Scout/ZeroScout APIs.
- Add Hash PayLink funding-link client.
- Keep hosted checkout creation in Hash PayLink behind a scoped service token.
- Do not move POS, bank, Circle, paymaster, generic receipt, or treasury secrets.

Acceptance gate:

- PolyDesk backend can run without Hash PayLink source code. Status: passed for extracted Polymarket, World Cup, Desk Agent, LP Scout, x402, and receipt routes.
- Hash PayLink dependency is only through stable HTTP APIs. Status: pending for funding checkout until the scoped service-token bridge is verified.
- No Circle/POS/bank secrets in PolyDesk. Status: passed for POS/bank; x402 receipt lookup may use Circle Gateway API keys only.

## Phase 4: Database Split

Goal: remove PolyDesk data from Hash PayLink DB.

Tasks:

- Create PolyDesk DB schema.
- Backfill Polymarket profile/watchlist/alert/funding data.
- Switch PolyDesk API to new DB.
- Leave Hash PayLink old tables read-only during migration.

Acceptance gate:

- Existing PolyDesk users retain profile and wallet state.
- Hash PayLink core DB no longer needs PolyDesk writes.

## Phase 5: Deployment Split

Goal: isolate runtime risk.

Tasks:

- Complete `docs/deployment-env-checklist.md`.
- Deploy PolyDesk separately.
- Use separate env group.
- Use separate DB.
- Use separate domain/subdomain.
- Add health checks.
- Add smoke tests for buy/sell/fund/portfolio.

Acceptance gate:

- PolyDesk failure does not affect Hash PayLink checkout/POS/x402.
- Hash PayLink failure mode is graceful in PolyDesk funding UI.

## Phase 6: OKX.AI And Polymarket Pitch

Goal: package PolyDesk as a credible standalone product.

Tasks:

- Prepare OKX.AI ASP profile.
- Prepare Polymarket pitch summary.
- Add 90-second demo script.
- Add ASP service menu:
  - Portfolio monitor
  - World Cup market scout
  - LP reward scout
  - Funding assistant
  - Trade preparation assistant

Acceptance gate:

- Product story is clear.
- Demo path does not depend on Hash PayLink admin surfaces.
- Trade actions remain user-confirmed.
