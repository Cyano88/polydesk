# Polymarket plugin 0.7.1 operator correction

Apply `polymarket-plugin-0.7.1-preflight.patch` to the official 0.7.1 source.
This is a local audited patch, not an upstream release. Keep the original binary.

Changes:
- Show the same V2 collateral reserve in dry-run that live balance validation uses.
- Deposit-wallet buys check pUSD allowance to the selected V2 exchange.
  The observed United market is blocked before signing because CLOB demands
  the deprecated V1 adapter; this conflict is unresolved.
  They never call the legacy proxy factory or automatically grant adapter allowance. RPC errors fail closed; real missing approvals require the
  supported deposit-wallet setup/relayer flow, with its own preview.
- Honor the deposit-wallet mode override.
- Optional POLYMARKET_CONFIG_DIR selects an existing credential directory, so
  the Linux operator build can use the same local account without copying keys.

Build and test with Cargo 1.88 or newer:

    cargo test --lib --locked
    cargo build --bin polymarket-plugin --locked

No test should use live wallet credentials or broadcast a transaction.
The Linux CLI path is a transport fallback for observed Windows BadRecordMac
failures, not a geographic routing workaround. Region checks remain intact.
Never disable TLS verification. Verify the active owner and maker match the
confirmed wallet before using the patched binary. Reconcile state after any
ambiguous write failure; never automatically loop order retries.

PolyDesk preflight: POST /api/polymarket-account/trade-preflight, with
ownerAddress, exact marketSlug, outcome, maxTotalUsdc and limitPrice. Optional
orderType and postOnly preserve buyer policy (GTD is not supported by this
preflight). The response is read-only; publicChecksPassed is not signing or
trading authorization. Use its rounded orderAmount, and refresh before signing.
`setup-deposit-wallet --adapter-allowance 3.751 --dry-run` previews the opt-in bounded local repair. Never remove dry-run without review of this new spending permission. This does not remove the market incident guard or establish that CLOB will accept an order.
