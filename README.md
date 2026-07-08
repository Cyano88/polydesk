# PolyDesk

Standalone agentic Polymarket desk extracted from Hash PayLink.

PolyDesk is being separated from the core Hash PayLink platform so Polymarket-specific trading, portfolio, and market-intelligence code can evolve independently without risking the payment-link, POS, x402, receipt, and settlement infrastructure that other products depend on.

## Extraction Status

Current phase: Phase 0 - freeze, audit, and boundary definition.

Do not copy production trading code into this repo until the dependency map in `docs/dependency-map.md` is complete and reviewed.

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
