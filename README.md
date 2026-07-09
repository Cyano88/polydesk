# PolyDesk

Standalone agentic Polymarket desk extracted from Hash PayLink.

PolyDesk is being separated from the core Hash PayLink platform so Polymarket-specific trading, portfolio, and market-intelligence code can evolve independently without risking the payment-link, POS, x402, receipt, and settlement infrastructure that other products depend on.

## Extraction Status

Current phase: Phase 2 - source-cloned frontend plus standalone P0 PolyDesk backend shell.

The operational PolyDesk frontend is source-cloned from Hash PayLink. The standalone Express server now mounts the P0 Polymarket portfolio, bridge, order, builder, relayer-builder, submit-order fallback, World Cup stream, and World Cup news APIs. Desk Agent and LP Scout x402 backend routes remain in the migration queue according to `docs/api-surface.md`.

## Local Development

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5174
```

Standalone production-style server:

```bash
npm run build
npm run start
```

Default server URL:

```text
http://127.0.0.1:3000
```

Verification commands:

```bash
npm run typecheck
npm run typecheck:server
npm run build
```

## Intended Scope

PolyDesk owns:

- Polymarket wallet activation and portfolio UX
- Polymarket buy/sell workflows
- World Cup market discovery
- LP Scout and ZeroScout Polymarket intelligence
- Polymarket funding UX and status tracking
- OKX.AI ASP positioning and agent-service interfaces

Hash PayLink remains the system of record for:

- Core USDC payment links
- Circle/checkout/payment rails
- POS and bank payouts
- Receipts and 0G archive workflows
- Agent wallet and x402 core infrastructure

## Documents

- `docs/extraction-audit.md` - current known-good state and audit checklist
- `docs/dependency-map.md` - file/API/env classification before extraction
- `docs/env-boundary.md` - environment variable ownership and secret boundaries
- `docs/phased-plan.md` - extraction phases and acceptance gates
- `docs/phase1-shell.md` - standalone shell verification notes
- `docs/api-surface.md` - backend route, source file, env, and migration checklist
