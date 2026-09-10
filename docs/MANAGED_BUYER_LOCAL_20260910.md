# Managed buyer-local execution adapter — 2026-09-10

The managed conversation supports PREPARE_LOCAL_TRADE. It returns an exact, owner-bound FOK BUY artifact and signing message after the existing native fee-inclusive preflight. Buyer-local execution checks the owner signature, current exact managed subscription, active Polygon wallet, unchanged market identity, rounded size, price, fee-inclusive balance, and short-lived readiness.

Commands on the buyer's reviewed Windows/WSL runtime:

- `npm run managed-agent:local -- --request ORDER_FILE`: show the signing message without querying the wallet or submitting.
- `npm run managed-agent:local -- --request ORDER_FILE --execute`: execute only a separately approved signed exact order.
- `npm run managed-agent:local -- --request ORDER_FILE --receipt`: verify its exact native order and finalized receipt; never submit.

ORDER_FILE contains only `order` from the managed response and the owner's `signature` over its authorizationMessage. Never include wallet keys, seed phrases, or CLOB credentials. Current owner and existing CLOB credentials remain local. The adapter cannot run on the provider VPS as a substitute for the buyer's wallet.

The new native binary is separate from the existing One-Off binary. The launcher pins its SHA256 and will fail if it is missing or changed. Its additional constraints are checked before signing and after signing before POST: owner, deposit wallet, token, condition, execution ID, FOK policy, actual order amount, price, fee-inclusive reserve and expiration. It also refuses automatic collateral wrapping. The existing verified zero-builder-fee gate and recovery binding remain in force. The source delta is recorded in ops/patches/polymarket-plugin-0.7.1-managed-local.patch and applies after the previous three reviewed patches.

The shared local guard binds the order before submission and prevents replay of an execution ID. Unknown outcomes retain reconciliation requirements. Native receipt checks reuse the existing authenticated order lookup and canonical finalized fill-log verifier, report actual fees and total debit, and reject a debit above the buyer cap. Native receipt results are not inserted into governed receipt storage and are not yet synchronized to Sibyl.

Validation uses ephemeral test owners and synthetic orders only. No signing with a real wallet, funding, approval, paid research, or live submission is authorized by this implementation work.

Remaining acceptance: actual owner-approved exact trade on the buyer runtime; native SELL orchestration; native receipt-to-Sibyl ingestion; unattended copy source observation and policy-controlled scheduling. This work does not establish production readiness for unattended copying.
## Local validation and installed artifact

- Full three-service regression suite: 168 passed before the final two additional CLI/conversation tests; those targeted checks also passed.
- Shared execution guard, recovery and new local handoff/receipt tests: 22 passed.
- Final local CLI and managed conversation checks: 25 passed, including the real CLI dry-run.
- Server typecheck and PowerShell parser validation passed.
- Native library suite passed all 32 tests; native compilation succeeded with existing unused-code warnings.
- Separate installed managed binary SHA256: 3ae311482ea308fbcdac0098b379f3c5d4b9253bd212ff95ceb1c80e40054e24.
- Original One-Off binary SHA256 remains 0bf1726d2a42142a4455ae712f4d6dd161738ac81ef419dd9d781521673fbbf5.
- Hash-pinned managed launcher successfully executed `buy --help`; no wallet or order was used.

The native guard requires the actual rounded order amount to equal the approved amount; any sizing change requires a new preview. The patch application check passed with `git apply --check --ignore-space-change` because the preserved source contains mixed Windows/Linux line endings. Apply using `git apply --ignore-space-change` after the existing patches.