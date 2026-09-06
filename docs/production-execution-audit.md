# Execution launch gates

Audit checkpoint: 2026-09-06. Scope: independent BUY handoff and receipt recovery.

## Verified locally

- Official installed `@polymarket/clob-client-v2` 1.1.0 OrderBuilder creates synthetic POLY_1271 orders accepted by the exact signed-order and independent-mandate validators. FAK/FOK and both neg-risk settings are covered. Payload drift is rejected.
- These are offline tests of the official signing/serialization path, not live CLOB acceptance, wallet ownership, funded readiness, or the complete ClobClient fee/market lookup path.
- Execution-key mutations preserve the first verified receipt. Handoff replay cannot erase it or offer another submit instruction after completion. Conflicting completion IDs return 409.
- Completion replays repair the secondary receipt index. Receipt reads prefer the canonical execution record, including after an interrupted index write.

## Required before unrestricted production claims

1. Verify the actual buyer wallet integration can sign the plan and mandate and submit the exact serialized order. An official plugin BUY command is not proof that it consumes PolyDesk's governed payload.
2. Exercise concurrent requests and process interruption against an isolated Postgres test store. Pure merge tests do not substitute for database fault-injection tests.
3. Strengthen fill proof: the current verifier searches serialized chain-receipt content for a buyer-supplied order ID and matches public trades by transaction/token/side. It does not yet decode exchange fill logs and cryptographically bind the CLOB order ID to the stored signed order. Do not describe this as exact-order settlement proof.
4. Preview an explicitly selected live market with current price, wallet readiness, fees and limits. Live submission needs fresh explicit authorization; no test key or fixture may be used.
5. After an ambiguous submission response, reconcile the existing order before any new order or salt is generated. A durable handoff ID does not itself provide buyer-side exactly-once submission.

## Regression command

```powershell
node --import tsx --test scripts/polymarket-sdk-handoff.test.ts scripts/polymarket-governed-open.test.ts scripts/polymarket-signed-open.test.ts scripts/polymarket-open-prepare.test.ts scripts/polymarket-independent-prepare.test.ts scripts/independent-entry-routing.test.ts
npm.cmd run typecheck:server
npm.cmd run build
```

No live payments, approvals or trades are part of this audit checkpoint.
