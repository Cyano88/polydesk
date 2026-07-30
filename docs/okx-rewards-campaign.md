# PolyDesk OKX Rewards Campaign

Status: preview only. Reward recording and payouts are disabled until OKX confirms the campaign.

## Public offer

- Duration: three weeks.
- Instant pool: 50 USDT0, paid as 1 USDT0 to the first 50 eligible unique payers.
- Leaderboard pool: 500 USDT0.
- Prizes: 200, 150, 100 and 50 USDT0.
- Network: X Layer.

## Eligible activity

An activity is eligible only when PolyDesk itself observes all of the following:

1. An OKX Agent Payments Protocol settlement succeeds.
2. The paid replay returns a successful response.
3. The service is one of Agent #5427's five registered services.
4. The payer and X Layer transaction hash are present.
5. The payer is not an excluded operator, treasury or test wallet.
6. The transaction has not already been recorded.

Failed, refunded, test, zero-price and undelivered calls do not count.

## User flow

1. Open `/rewards`.
2. Choose an exact PolyDesk service card on OKX.AI.
3. Complete the paid call.
4. Paste the returned X Layer transaction hash.
5. PolyDesk verifies the internally recorded delivery.
6. When claims are activated, the reward can only go to the payer recovered from the verified settlement.

PolyDesk does not request a browser-wallet connection or trust an address pasted after payment.

## Leaderboard scoring

- One point per service, per payer, per UTC day.
- At least two distinct services are required to qualify.
- Duplicate transaction hashes do not create additional points.
- The public leaderboard shows masked payer addresses only.

## Activation gates

Do not configure these flags until OKX approves the promotion and the dates are public:

```text
POLYDESK_OKX_REWARDS_APPROVED=true
POLYDESK_OKX_REWARDS_RECORDING=true
POLYDESK_OKX_REWARDS_CLAIMS_ENABLED=true
POLYDESK_OKX_REWARDS_STARTS_AT=<ISO-8601 timestamp>
POLYDESK_OKX_REWARDS_ENDS_AT=<ISO-8601 timestamp>
POLYDESK_OKX_REWARD_EXCLUDED_WALLETS=<comma-separated operator and test addresses>
```

The present implementation records and verifies eligible delivery proofs and can atomically reserve the first 50 one-per-payer instant claims. An operator-authenticated queue exposes only reserved payouts. It does not transfer rewards or mark them paid. A separate payout worker with on-chain transfer verification must be implemented, funded, rate-limited and tested before claims are activated.

## Approval message

> We plan to run a transparent three-week PolyDesk usage campaign rewarding unique users for successfully delivered paid A2MCP calls. Claims will not require a browser-wallet connection: PolyDesk will recover the payer from the verified x402 settlement, reject duplicate, failed, refunded, test and undelivered calls, and send any reward only to that payer. Scoring is capped at one point per service per wallet per day. Could you confirm this campaign is permitted before we activate recording or payouts?
