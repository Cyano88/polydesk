# PolyDesk

Standalone agentic Polymarket desk extracted from Hash PayLink.

PolyDesk is being separated from the core Hash PayLink platform so Polymarket-specific trading, portfolio, and market-intelligence code can evolve independently without risking the payment-link, POS, x402, receipt, and settlement infrastructure that other products depend on.

## Extraction Status

Current phase: Phase 1 - standalone frontend shell.

Production trading code has not been copied into this repo yet. The current app is a runnable shell with stubbed Desk Agent, Portfolio, World Cup, World Cup News/Scores, and LP Scout lanes. Real trading, funding, portfolio, and market modules move in later phases according to `docs/dependency-map.md`.

## Local Development

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5174
```

Verification commands:

```bash
npm run typecheck
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
