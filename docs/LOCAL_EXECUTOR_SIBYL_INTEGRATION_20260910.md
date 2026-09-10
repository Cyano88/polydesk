# Local executor to Sibyl integration

The working WSL launcher now captures eligible finalized fills after guarded submission and after successful interrupted-order recovery. A separate explicit capture command can retry memory only. Original submission stdout and its exit code are preserved; memory failures are reported separately and never invoke the executor again.

## Evidence boundary

The local verifier checks current owner-bound local credentials, exact saved V2 order hash, authenticated order/trade history, full fill accounting, allowed exchange, exact token/side/price/size, Polygon chain ID, canonical transaction membership, log identity and finalized block evidence. Only full terminal fills are accepted initially. Open/partial/canceled trades remain outside this initial capture contract.

Records use polydesk-local-finalized-fill-v1 in the distinct polydesk_local_finalized_fill_v1 Sibyl category. governedAuthorityVerified, signingAuthorized, paymentAuthorized and currentPositionVerified are false. This does not retrofit the hosted governed-mandate model, prove an old signature, or migrate historical trades.

## Persistence and recall

The existing execution record and public pre-submit binding remain authoritative local evidence. A create-exclusive immutable .memory.json sidecar records the projection and digest before the SDK call. Failure retains that inventory, preventing a missing SDK row from masquerading as empty history. Conflicting recapture cannot overwrite it. SDK capture is tenant-scoped, locked and read back through a reopened connection. Fresh recall must exactly match the inventory and binding; known submitted executions without a manifest block review.

The native bridge uses existing Sibyl 0.8.0 and a separate private local root. Launcher defaults are the already-installed /root/polydesk-buyer-candidate.hXrameVt/runtime/bin/python and /root/.local/share/polydesk-local-finalized-memory. POLYDESK_LOCAL_MEMORY_PYTHON and POLYDESK_LOCAL_MEMORY_ROOT permit explicit operator configuration. Missing runtime/private-directory checks fail. No installation, real execution, production capture or historical-store adoption was performed during testing.

Use scripts/polymarket-wsl.ps1 -CaptureMemory -MemoryExecutionId <existing-id> for capture only. Use -ReviewMemory -MemoryOwner <local-owner> -MemoryToken <exact-token> in a new session. These are local operator commands using the local credential/OS boundary; they are not remote APIs or a replacement for owner-signed hosted recall. The provider must ask the buyer host to run them rather than importing buyer secrets.

A matching token returns LOCAL_MEMORY_RECONCILIATION_REQUIRED and asks to review prior buys/sells and refresh positions. Recall alone never permits signing. The launcher automatically attempts capture; the conversation must invoke the explicit review command before using memory to guide a new preview. This release does not enforce a memory acknowledgement in every possible direct executor invocation.

## Validation and remaining proof

19 fixture/recovery/guard tests passed initially; the real-SDK adapter run passed all six tests, including a separate Node process reading data captured by the native Python SDK. Fixtures provide synthetic authenticated-provider and chain evidence. No wallet, payment or order submission was made. Missing canonical proof, wrong chain, nonterminal state, memory outage, changed binding, cross-owner leakage and conflicting repetition are covered.

The earlier buy/sell lack saved pre-submit bindings and remain ineligible. The September 10 buyer-authorized 10-share BUY and SELL through the guarded launcher now prove live local capture and separate-process recall. See demo/manchester-united-live-fill-20260910.json and demo/manchester-united-live-sell-20260910.json. The position was independently verified closed. Hosted governed receipt-memory acceptance remains separate and unproven; the earlier empty-store audit was a point-in-time observation.
