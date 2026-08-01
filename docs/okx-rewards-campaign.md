# PolyDesk OKX Rewards Campaign

Status: approved pilot; public claims and payouts remain disabled until the funded campaign wallet and public dates are configured.

## Public offer

- Phase 1 duration: three weeks.
- Instant pool: 50 USDT0, paid as 1 USDT0 to the first 50 eligible unique payers.
- Network: X Layer.

The previously proposed 500-USDT0 leaderboard is not part of Phase 1. It remains disabled unless it receives separate funding, published rules and an explicit activation flag.

## Eligible activity

An activity is eligible only when PolyDesk itself observes all of the following:

1. An OKX Agent Payments Protocol settlement succeeds.
2. The paid replay returns a successful response.
3. The service is one of Agent #5427's five registered services.
4. The payer and X Layer transaction hash are present.
5. The payer is not an excluded operator, treasury or test wallet.
6. The settled amount exactly matches the registered service price.
7. The transaction has not already been recorded.

Failed, refunded, test, zero-price and undelivered calls do not count.

## User flow

1. Open `/rewards`.
2. Choose an exact PolyDesk service card on OKX.AI.
3. Complete the paid call.
4. Paste the returned X Layer transaction hash.
5. PolyDesk verifies the internally recorded delivery.
6. Submit the claim for eligibility review.
7. If approved, the reward can only go to the payer recovered from the verified settlement.

PolyDesk does not request a browser-wallet connection or trust an address pasted after payment.

## Review and anti-abuse policy

- One claim is allowed per paying wallet.
- A submitted claim does not reserve campaign funds until an operator approves it.
- At most 100 claims may wait for review at once.
- At most 50 approved, processing or paid claims can consume the instant pool.
- Coordinated multi-wallet farming, operator wallets, test activity, refunded calls, duplicates and undelivered calls are rejected.
- The payout worker can release at most 5 USDT0 per UTC day.
- Rejected claims never enter the payout queue.

## Activation gates

Do not configure these flags until OKX approves the promotion and the dates are public:

```text
POLYDESK_OKX_REWARDS_APPROVED=true
POLYDESK_OKX_REWARDS_RECORDING=true
POLYDESK_OKX_REWARDS_CLAIMS_ENABLED=true
POLYDESK_OKX_REWARDS_PAYOUTS_ENABLED=true
POLYDESK_OKX_REWARDS_LEADERBOARD_ENABLED=false
POLYDESK_OKX_REWARDS_STARTS_AT=<ISO-8601 timestamp>
POLYDESK_OKX_REWARDS_ENDS_AT=<ISO-8601 timestamp>
POLYDESK_OKX_REWARD_EXCLUDED_WALLETS=<comma-separated operator and test addresses>
POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS=<dedicated X Layer campaign wallet>
POLYDESK_OKX_REWARDS_DAILY_PAYOUT_LIMIT_ATOMIC=5000000
POLYDESK_OKX_REWARDS_MIN_CONFIRMATIONS=3
POLYDESK_OKX_REWARDS_OPERATOR_KEY=<random secret of at least 32 characters>
POLYDESK_OKX_REWARDS_XLAYER_RPC_URL=<dedicated or official X Layer RPC>
```

The implementation records and verifies eligible delivery proofs. A public claim enters `submitted` state. An authenticated operator must review it before it can enter `reserved` state and consume campaign funds. Payout work then receives a one-use lease and an exact transfer plan. Processing work is never automatically re-leased because its transaction may already have been broadcast.

The confirmation path marks a claim paid only after X Layer reports a successful, sufficiently confirmed transaction sent by the configured campaign wallet directly to the approved USDT0 contract. The receipt must contain exactly one `Transfer` event from that wallet to the verified payer for exactly `1000000` atomic units. The transaction must be mined after the payout lease begins, and its hash cannot be reused by another claim.

Claims are accepted only inside the published campaign window. The separately controlled payout gate may remain enabled afterward so rewards reserved before the deadline can still settle and be verified.

The repository includes a read-only queue worker:

```text
npm run rewards:proofs:dry-run
npm run rewards:payout:dry-run
```

The proof audit lists only eligible unclaimed receipt references and masked payer addresses. It does not submit claims or reserve funds.

Before asking a rehearsal buyer to pay, run `npm run rewards:wallet:check -- <address>` inside the production environment. It returns only whether that address is excluded and never prints the configured exclusion list.

Before launch, run:

```text
npm run rewards:launch:check
```

It verifies the dates, dedicated payout address, full 50-USDT0 wallet balance, X Layer chain ID, five-USDT0 daily ceiling, database, RPC, exclusions, operator authentication and the default-off leaderboard without printing secrets or moving funds.

It prints the operator queue and totals only. It has no signer and cannot broadcast. Automatic transfers remain deliberately unimplemented until the dedicated payout wallet is selected, approved and tested.

## Payout safety limits

- Per transfer: exactly 1 USDT0 (`1000000` atomic units).
- Instant pool: at most 50 transfers and 50 USDT0 total.
- Daily limit: explicit operator configuration, never above 5 USDT0.
- Destination: the payer recovered from the delivered x402 settlement.
- Token: X Layer USDT0 only.
- Confirmation: three blocks by default.
- Retry rule: never prepare a second transfer for a processing claim. Recover or verify the original transaction first.

## Operator flow

1. Inspect recorded proof references with `npm run rewards:proofs:dry-run`.
2. Before public launch only, submit one genuine external buyer receipt with `npm run rewards:rehearsal:submit -- <transactionHash>`. This operator-only action does not open public claims.
3. Inspect the authenticated queue. Submitted claims are review candidates; reserved claims are payout candidates.
4. Approve a claim with `npm run rewards:review -- <claimId> approve` or reject it with `npm run rewards:review -- <claimId> reject <short reason>`.
5. Run `npm run rewards:payout:dry-run` and compare the exact recipient, token and amount.
6. Send exactly 1 USDT0 from the dedicated campaign wallet to the verified payer.
7. Submit the transaction hash through the authenticated `confirm-payout` action.
8. The server marks the claim paid only after confirming the exact X Layer transfer.

## Approval record

> PolyDesk received permission to proceed with the independently funded campaign. This is not described as an OKX-funded or OKX-administered promotion. Public activation still requires the funded campaign wallet, published dates, exclusions and a successful private payout rehearsal.
