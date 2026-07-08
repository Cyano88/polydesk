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
- Add PolyDesk product shell and routing.
- Add Privy config.
- Add API client pointed at Hash PayLink staging/production.
- Add placeholder pages: Desk Agent, Portfolio, World Cup, LP Scout.

Acceptance gate:

- App runs locally.
- No Hash PayLink core UI copied.
- No trading/order code copied yet.

## Phase 2: Frontend Extraction

Goal: move only PolyDesk frontend behavior.

Tasks:

- Extract portfolio UI.
- Extract buy/sell modals.
- Extract World Cup UI.
- Extract LP Scout UI.
- Replace Hash PayLink-specific layout/state with PolyDesk local state.
- Keep backend calls pointed at existing Hash PayLink APIs.

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

Acceptance gate:

- PolyDesk backend can run without Hash PayLink source code.
- Hash PayLink dependency is only through stable HTTP APIs.
- No Circle/POS/bank secrets in PolyDesk.

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
