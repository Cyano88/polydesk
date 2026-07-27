# Polymarket Agent Ready-to-Buy

PolyDesk gives an autonomous buyer one safe sequence:

`check account -> fund only if needed -> prepare buy -> sign locally -> submit`

PolyDesk never asks for a private key, seed phrase, or reusable CLOB secret.

## 1. Check the account for free

```bash
curl -X POST https://polydesk.trade/api/polymarket-account/readiness \
  -H "Content-Type: application/json" \
  -d '{
    "ownerAddress": "0xOWNER_EOA",
    "requiredBalanceUsdc": "5",
    "sourceNetwork": "base"
  }'
```

PolyDesk derives the official Polymarket Deposit Wallet from `ownerAddress`.
Do not replace it with the owner EOA or another address.

The response returns exactly one next action:

- `SETUP_DEPOSIT_WALLET`: activate the account with the official Polymarket
  relayer or OKX Polymarket plugin, then check again.
- `CREATE_FUNDING_CHECKOUT`: the wallet is deployed but needs pUSD.
- `PREPARE_BUY`: the deployed wallet already has enough pUSD.
- `RETRY_READINESS`: the live bridge asset check was unavailable, so no money
  should move yet.

## 2. Create a verified funding checkout

Call this only after readiness returns `CREATE_FUNDING_CHECKOUT`.

```bash
curl -X POST https://polydesk.trade/api/a2mcp/polymarket-funding-link \
  -H "Content-Type: application/json" \
  -d '{
    "ownerAddress": "0xOWNER_EOA",
    "requiredBalanceUsdc": "5",
    "network": "base",
    "agent": "my-buyer-agent"
  }'
```

The initial response is an OKX HTTP 402 challenge. Pay it with the buyer's OKX
Agentic Wallet and replay the exact request.

The paid replay either:

- returns a Hash PayLink checkout targeting the derived, deployed Deposit
  Wallet; or
- returns `PREPARE_BUY` with no checkout when the refreshed pUSD balance is
  already sufficient.

Poll the returned `checkout.statusUrl`. Funding is terminal only when status is
`funded`; then call readiness again and confirm the pUSD balance.

## 3. Prepare and execute the buy

Use the free preparation endpoint with the verified Deposit Wallet:

```bash
curl -X POST https://polydesk.trade/api/polymarket-open/prepare \
  -H "Content-Type: application/json" \
  -d '{
    "externalOrderId": "buyer-agent:order:001",
    "marketUrl": "https://polymarket.com/event/EXAMPLE",
    "outcome": "Yes",
    "maxSpendUsdc": "5",
    "wallet": "0xDERIVED_DEPOSIT_WALLET",
    "orderType": "FAK"
  }'
```

Sign the returned plan locally with the official Polymarket client. Use the
Deposit Wallet as both maker and signer with signature type `3`. Send only the
signed order payload to PolyDesk's governed or signed OPEN validation flow.

## Safety rules

1. The owner EOA signs; the Deposit Wallet holds pUSD and positions.
2. Never fund the owner EOA for Deposit Wallet orders.
3. Never trust an arbitrary caller-supplied funding wallet.
4. Check Polymarket supported assets and minimums live before every checkout.
5. A paid checkout is not a completed bridge.
6. A completed bridge must be followed by a refreshed pUSD balance check.
7. Default to immediate `FAK`; use `FOK` for all-or-nothing execution.
