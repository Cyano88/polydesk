# Phase 1 Frontend Shell

Date: 2026-07-08

## Scope

This phase creates a runnable standalone PolyDesk app without moving production trading logic.

Included:

- Vite + React + TypeScript app scaffold.
- `PolyDesk` route at `/` and `/polydesk`.
- Separate pitch/landing route at `/about`.
- Privy provider wiring when `VITE_PRIVY_APP_ID` is present.
- Privy login methods configured with both `email` and `wallet`.
- Standalone shell inspired by the verified Hash PayLink `src/pages/PolyDesk.tsx` lane model.
- Stubbed Desk Agent, Portfolio, World Cup, World Cup News/Scores, and LP Scout surfaces.
- Link back to the current live Hash PayLink PolyDesk build for production behavior.

Excluded:

- Real buy/sell order creation.
- Polymarket browser-submit helpers.
- Deposit-wallet activation.
- Portfolio database reads.
- Funding checkout creation.
- World Cup live data calls.
- LP Scout x402 billing.
- Hash PayLink POS, bank, Circle, paymaster, receipt, treasury, or payout code.

## Verification

Commands run:

```bash
npm run typecheck
npm run build
```

Results:

- TypeScript passed.
- Production build passed.
- Local dev server returned `200` for `/`.
- Local dev server returned `200` for `/polydesk?service=portfolio`.

Browser screenshot verification was attempted through the Codex in-app browser, but no browser backend was available in this session. The dev server remains the verification path for manual UI inspection.

## Dependency Risk

`npm audit --omit=dev` reports vulnerabilities from the Privy wallet stack, primarily transitive `ws`, `uuid`, WalletConnect, MetaMask, wagmi, viem, and x402 packages.

No forced audit fix was applied because npm recommends a breaking downgrade of `@privy-io/react-auth`. Before production deployment, choose one of:

- Wait for upstream Privy/WalletConnect patched releases and upgrade.
- Pin safe transitive overrides after testing wallet connect behavior.
- Delay shipping wallet login in the standalone repo until the dependency tree is cleaner.

This does not affect the current shell behavior because no live wallet trading is enabled in Phase 1.

## Product Shape Decision

The main app must not be a marketing landing page.

Rules:

- `/` and `/polydesk` are the operational PolyDesk app.
- The first screen must be the current PolyDesk Service Hub flow: compact wrapper, Desk Agent card, Portfolio, World Cup, and LP Scout entry points.
- New marketing/pitch invention belongs only on `/about` or a later dedicated landing route.
- `src/pages/PolyDesk.tsx` is copied exactly from the current Hash PayLink app and should stay source-matched until the extraction is complete.
- `src/layouts/PolyDeskLayout.tsx` carries the PolyDesk-only header, desktop nav, mobile nav, history button, theme toggle, main wrapper, and footer extracted from the Hash PayLink `src/Layout.tsx` PolyDesk branch.
- Navigation and footer changes belong in the layout wrapper, not inside the copied `PolyDesk.tsx` page.
- Phase 2 should replace the `TelegramPaymentLinks.tsx` stubs with the extracted production panels instead of redesigning the app shell.

## Phase 2 Extraction Notes

- `PolyPortfolioPanel` now uses the real PolyDesk portfolio API contract for profile loading, deposit-wallet activation, pUSD balance, funding link creation, and positions.
- Live order submission, CLOB approvals, and withdrawal execution remain gated until the standalone repo receives the audited Polymarket SDK and relayer dependencies.
- `VITE_POLYDESK_API_ORIGIN` may point the standalone frontend to a separate API deployment. If omitted, the app calls same-origin `/api/polymarket-portfolio` and `/api/polymarket-bridge`.
- Funding links still target the configured Hash PayLink payment origin through `VITE_PUBLIC_PAYLINK_ORIGIN`, preserving the current funding flow while the portfolio frontend is separated.
- The backend migration surface is documented in `docs/api-surface.md`; it lists the exact source API files, route registrations, environment variables, and verification checklist required before the standalone app can stop proxying to Hash PayLink.

## Source Clone Decision

- PolyDesk internal tab UI must be copied from Hash PayLink instead of recreated.
- `src/pages/TelegramPaymentLinks.tsx`, `src/pages/AgentWorkspace.tsx`, and `src/styles.css` are source clones from Hash PayLink; only `// @ts-nocheck` was added to the cloned page files so the standalone repo can compile the current source snapshot.
- Shared source dependencies such as Privy buttons, `chains.ts`, `authMode.ts`, `unifiedBalance.ts`, and PolyDesk support components should stay source-matched unless a standalone glue change is explicitly documented.
