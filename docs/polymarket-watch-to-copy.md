# PolyDesk Watch-to-Copy

PolyDesk can turn either an existing open Polymarket position or an exact public BUY into a bounded order plan for a different buyer account. The watched wallet supplies the signal only. It never signs for the buyer and never controls the buyer's funds.

## Selection modes

- `POSITION`: the caller selects one current open position by `conditionId` and `tokenId`.
- `TRADE`: the caller selects one recent public BUY by transaction hash and token ID.
- `AUTO_BEST_FIT`: PolyDesk ranks current open positions using a strict caller-supplied execution policy, then selects the highest-ranked eligible candidate.

`AUTO_BEST_FIT` is an execution-quality ranking, not a prediction of profit. It checks exact market status, current order-book depth, spread, price, book freshness, time to the stated market end, and the watched position's relative size. The governed mandate remains the final authority.

Set `analysisOnly: true` to rank public positions without providing or inspecting a buyer wallet. The response remains `ESCALATE` and asks for `ownerAddress` before any buyer-bound order can be prepared.

## The flow

1. Pay for `POST /api/a2mcp/polymarket-portfolio-watch` with a public wallet address.
2. Select an item from `topPositions` or `recentBuySignals`, or request deterministic `AUTO_BEST_FIT`.
3. Call the free `POST /api/polymarket-copy/prepare` endpoint with:
   - `watchedWallet`
   - `selectionMode`
   - `conditionId` and `tokenId` for `POSITION`
   - `transactionHash` and `tokenId` for `TRADE`
   - `selectionPolicy` for `AUTO_BEST_FIT`
   - the buyer `ownerAddress`
   - `maxSpendUsdc`
   - `orderType` (`FAK` or `FOK`)
4. PolyDesk refetches the public source, verifies exact market and order-book identity, derives the buyer's official Polymarket Deposit Wallet, rejects wallet mismatch, and resolves a fresh live order book.
5. If pUSD is short, use `/api/polymarket-account/readiness` and `/api/a2mcp/polymarket-funding-link`.
6. Apply the governed OPEN mandate. Without a valid preauthorization, the decision is `ESCALATE`.
7. The buyer signs locally and submits the immediate order. PolyDesk never receives a private key, CLOB secret, or passphrase.

## Copy-paste existing position

```bash
curl -X POST https://polydesk.trade/api/polymarket-copy/prepare \
  -H "Content-Type: application/json" \
  -d '{
    "selectionMode": "POSITION",
    "watchedWallet": "0xWATCHED_POLYMARKET_WALLET",
    "conditionId": "0xPOSITION_CONDITION_ID",
    "tokenId": "POSITION_OUTCOME_TOKEN_ID",
    "ownerAddress": "0xBUYER_OWNER_EOA",
    "maxSpendUsdc": "5",
    "orderType": "FAK"
  }'
```

## Copy-paste deterministic best fit

```bash
curl -X POST https://polydesk.trade/api/polymarket-copy/prepare \
  -H "Content-Type: application/json" \
  -d '{
    "selectionMode": "AUTO_BEST_FIT",
    "watchedWallet": "0xWATCHED_POLYMARKET_WALLET",
    "ownerAddress": "0xBUYER_OWNER_EOA",
    "maxSpendUsdc": "5",
    "orderType": "FAK",
    "selectionPolicy": {
      "maximumPrice": 0.70,
      "maximumSpread": 0.05,
      "minimumDepthUsdc": 10,
      "minimumHoursToResolution": 24,
      "maximumBookAgeSeconds": 30
    }
  }'
```

`maxSpendUsdc` is always chosen by the buyer or its mandate. PolyDesk never copies the source wallet's size blindly. PolyDesk generates the canonical `externalOrderId` from the selection mode, watched wallet, source position or trade, token, and buyer owner. A caller-supplied ID is accepted only when it exactly matches that canonical ID, preventing an unrelated retry key from replacing the source binding.

## Automation boundary

The current public flow supports machine-readable polling and preparation. PolyDesk's existing alerts are email and in-app alerts; they are not outbound agent webhooks. An outbound webhook must not be advertised until URL verification, HMAC signatures, retries, and event deduplication are implemented and tested.
