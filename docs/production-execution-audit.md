# Execution launch gates

Audit checkpoint: 2026-09-06. Scope: independent BUY handoff and receipt recovery.

## Verified locally

- Official installed `@polymarket/clob-client-v2` 1.1.0 OrderBuilder creates synthetic POLY_1271 orders accepted by the exact signed-order and independent-mandate validators. FAK/FOK and both neg-risk settings are covered. Payload drift is rejected.
- These are offline tests of the official signing/serialization path, not live CLOB acceptance, wallet ownership, funded readiness, or the complete ClobClient fee/market lookup path.
- Execution-key mutations preserve the first verified receipt. Handoff replay cannot erase it or offer another submit instruction after completion. Conflicting completion IDs return 409.
- Completion replays repair the secondary receipt index. Receipt reads prefer the canonical execution record, including after an interrupted index write.
- Exact-order settlement binding is now implemented: V2 EIP-712 hashes are derived from the submitted signed order for both allowlisted exchange domains and persisted with the execution. SDK POLY_1271 signatures independently confirm the same hashes in tests.
- Completion decodes OrderFilled logs from the allowlisted emitting contract, matches the exact derived hash, maker, BUY side, token, builder and metadata, and uses integer arithmetic for signed price/spend limits. Receipt amounts come from these exact-order logs; public trade data is corroboration only.
- Wrong transaction IDs, incidental hash text, malformed/removed/duplicate logs, unrelated orders and excessive fills are rejected. New receipts expose exactSignedOrderVerified=true. Legacy executions without a stored binding fail closed; existing receipts are not silently upgraded.

## Required before unrestricted production claims

1. Verify the actual buyer wallet integration can sign the plan and mandate and submit the exact serialized order. An official plugin BUY command is not proof that it consumes PolyDesk's governed payload.
2. Exercise concurrent requests and process interruption against an isolated Postgres test store. Pure merge tests do not substitute for database fault-injection tests.
3. Validate the new exact-order log verifier against an explicitly authorized live fill. Local encoded-event and official-SDK tests pass, but live wallet submission, indexing latency and chain finality/reorganization handling remain separate launch gates. Fees are not included in the reported order notional.
4. Preview an explicitly selected live market with current price, wallet readiness, fees and limits. Live submission needs fresh explicit authorization; no test key or fixture may be used.
5. After an ambiguous submission response, reconcile the existing order before any new order or salt is generated. A durable handoff ID does not itself provide buyer-side exactly-once submission.

## Regression command

```powershell
node --import tsx --test scripts/polymarket-order-proof.test.ts scripts/polymarket-sdk-handoff.test.ts scripts/polymarket-governed-open.test.ts scripts/polymarket-signed-open.test.ts scripts/polymarket-open-prepare.test.ts scripts/polymarket-independent-prepare.test.ts scripts/independent-entry-routing.test.ts
npm.cmd run typecheck:server
npm.cmd run build
```

No live payments, approvals or trades are part of this audit checkpoint.
