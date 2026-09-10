# PolyDesk

PolyDesk is a non-custodial control layer for Polymarket agents and integration platforms.

It exposes versioned, machine-readable services for bounded trading, managed portfolio operations, and external integration audits. PolyDesk does not operate a standalone consumer trading application.

## Products

1. **One-Off Polymarket Trade** - one bounded mission from request and intelligence through buyer approval, execution handoff, and verified receipt.
2. **Managed Polymarket Agent** - continuous portfolio and configured-address monitoring, verified email alerts, scheduled summaries, and optional separately authorized copy trading.
3. **Polymarket Integration Audit** - an evidence-backed review of an external platform's wallet, payment, authorization, execution, recovery, and receipt controls.

The direct A2MCP routes are implementation capabilities supporting these products, not additional product lines.

## Integration entry points

- Public site: <https://polydesk.trade>
- Integration overview: <https://polydesk.trade/integrations>
- Platform quickstart: <https://polydesk.trade/docs/platforms>
- OKX.AI guide: <https://polydesk.trade/docs/okx-ai>
- Versioned manifest: <https://polydesk.trade/.well-known/polydesk.json>
- Machine catalog: <https://polydesk.trade/api/a2mcp/services>

Start by reading the manifest at runtime. It declares the current products, compatibility capabilities, request schemas, payment contract, and safety boundaries.

## Responsibility boundary

PolyDesk:

- validates typed requests, market state, wallet readiness, and buyer-defined limits;
- returns bounded decisions and explicit next actions;
- monitors configured public addresses and portfolio state;
- publishes machine-readable status and terminal evidence.

The originating platform:

- owns its interface, user identity, consent, and signer access;
- presents every payment or financial authorization;
- preserves request identifiers and follows declared status or receipt URLs;
- uses an operator-approved return destination.

Hash PayLink remains the funding checkout, payment verification, settlement-status, and payment-receipt boundary. Polymarket remains the market, order-book, position, and public execution boundary.

PolyDesk never accepts private keys, seed phrases, or reusable Polymarket CLOB credentials. Paying for a service does not authorize a trade.

## Local development

```bash
npm install
npm run dev
```

Production-style verification:

```bash
npm run typecheck
npm run typecheck:server
npm run test:polydesk-shell
npm run build
npm run start
```

The local production server listens on `http://127.0.0.1:3000` by default.

## Deployment

`render.yaml` defines the production web service. Safe defaults are committed; secrets and deployment-specific values remain server-side. Use `docs/render-env-audit.md` and `docs/deployment-env-checklist.md` for environment and release verification.

The public browser surface is intentionally limited to the foundation site, integration catalog, technical documentation, narrow payment continuation, and verifiable report pages. Legacy `/polydesk` and `/rewards` URLs redirect to `/integrations`.

## Core documents

- `docs/api-surface.md` - public routes, machine contracts, return routing, and service boundaries.
- `docs/POLYDESK_A2A_TRADING_AGENT.md` - bounded A2A mission and worker lifecycle.
- `docs/POLYDESK_A2A_WORKER.md` - production worker operation.
- `docs/POLYDESK_INTEGRATION_CONFORMANCE_AUDIT.md` - external platform audit contract.
- `docs/polymarket-agent-ready-buy.md` - funding, readiness, authorization, and completion sequence.

## Sibyl integration and verified local demo

PolyDesk's research, payment and Polymarket service flows existed before this memory integration. The added work binds finalized local BUY/SELL receipts to owner-scoped Sibyl memory and recalls that history in a fresh process before reconciling positions. It does not turn research payment or memory recall into trading authority.

- Memory verification and write entry: [scripts/polymarket-local-memory.mjs](scripts/polymarket-local-memory.mjs), `captureLocalExecution`.
- Native Sibyl SDK bridge: [scripts/sibyl-local-execution-memory.py](scripts/sibyl-local-execution-memory.py).
- Memory read entry: `reviewLocalMemory` in the same adapter; buyer commands and provenance are described in [the integration guide](docs/LOCAL_EXECUTOR_SIBYL_INTEGRATION_20260910.md).
- Live September 10 BUY and SELL receipts, fresh-process recall, closed position and recording sequence: [demo runbook](docs/demo/SIBYL_DEMO_RUNBOOK_20260910.md).
- Repeatable no-spend regression rehearsal: `node scripts/sibyl-demo-rehearsal.mjs`. Synthetic trade fixtures use the real SDK in isolated storage; they are labelled separately from the live receipts.

The live buyer-local route is verified. Hosted governed receipt-memory acceptance and the continuous video recording remain separate work. No open-source license file is currently tracked; licensing must be settled before claiming a licensed hackathon submission.

The supported buyer launcher now requires [memory-dependent position reconciliation](docs/MEMORY_DEPENDENT_BUYER_FLOW_20260910.md) before every live order. Remembered BUY/SELL quantities determine whether continuation is possible; missing memory or a live-position mismatch blocks it. Extra buys into existing exposure need exact review. This is the claimed memory-dependent function; raw Polymarket trading remains independently possible outside this orchestration path.

## Reproduce the memory demo
Follow [the judge quickstart](docs/JUDGE_QUICKSTART.md) from a fresh Linux/WSL clone. It builds a pinned Sibyl runtime and runs the real-SDK memory flow with synthetic providers, without wallet credentials or spending. The standalone command is `node scripts/judge-reproduce.mjs` after setup; its JSON result records the commit, timestamps and deletion/restoration evidence.
