# Mandatory buyer memory continuation

The supported PolyDesk Polymarket skill launcher now runs scripts/polymarket-memory-continuation.mjs before claiming or submitting every live BUY/SELL. There is no skip-memory switch. The gate is read-only and separate from payment, signing authority, region checks and market preflight. Direct upstream binaries are outside this supported orchestration boundary; this is not a wallet-level spending policy.

## What memory changes

Owner-scoped Sibyl recall verifies every expected local fill against the immutable inventory and binding. The recalled BUY quantity minus SELL quantity is compared with a fresh Polygon conditional-token balance for the exact market outcome and local owner-bound deposit wallet. A missing SELL changes a closed-position decision into a blocking mismatch. Missing or corrupt expected SDK rows cannot be replaced with receipt-file fallback. An unavailable SDK or RPC blocks continuation.

- Matching zero balance: MEMORY_RECONCILED_CLOSED, continue only to normal preview and buyer approval checks.
- Matching nonzero balance on SELL: verify requested quantity fits that reconciled position.
- Matching nonzero balance on BUY: EXISTING_EXPOSURE_REVIEW_REQUIRED. Show the existing exposure and proposed additional buy. After buyer approval, pass -MemoryReviewDigest with the displayed digest and unchanged exact arguments. The gate rereads memory and position and rejects a stale digest. This digest acknowledges review only; it is not payment or trading authority.
- Mismatch: reconcile missing fills or external position activity before trading. No automatic memory rewrite, historical backfill, baseline adoption or order retry is provided.
- First use with no ledger: SDK availability is still required; only a zero live position passes. The response keeps historyComplete false.

This conservative initial contract supports exact FOK BUY/SELL arguments: market-id, outcome, amount/shares, price, order-type. Additional flags fail closed. Unattended copy execution is not introduced.

## Read-only demonstration

Use scripts/polymarket-wsl.ps1 -CheckMemoryContinuation -PluginArgs @('buy','--market-id','epl-mun-mac-2026-09-13-mun','--outcome','Yes','--amount','3.1','--price','0.31','--order-type','FOK'). This checks the continuation but never invokes the executor. A gate pass does not mean there is a currently executable market quote.

On September 10 the live read-only check recalled the authorized BUY and SELL, returned rememberedNetRaw 0 and positionRaw 0, and produced MEMORY_RECONCILED_CLOSED with signingAuthorized false and orderSubmitted false. No new trade was authorized or made during this change.

## Tests and scope

The rehearsal includes continuation tests plus real-SDK capture and separate-process recall. Missing-memory and restored-memory runs use isolated test storage only. Production memory is never deleted for demonstration. Removing or bypassing the returned memory result prevents this continuation from succeeding; raw Polymarket trading itself is not claimed to depend on Sibyl. Remaining gaps include fresh-clone runtime setup, license choice, video/public posts and registered-team submission. Hosted governed receipt memory remains separate.
