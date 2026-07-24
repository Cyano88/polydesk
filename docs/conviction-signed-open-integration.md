# Conviction signed OPEN integration

PolyDesk can fund a buyer-controlled Polymarket wallet and prepare a safe,
builder-attributed OPEN handoff. It never receives the buyer's private key,
CLOB API secret, or CLOB passphrase, and it never submits the order. The
official serialized order payload does contain the buyer's CLOB API-key
identifier in its `owner` field.

## Boundary

- The buyer agent owns an already-deployed and approved Polymarket signer.
- PolyDesk's funding-link service can create a Base or Arbitrum Hash PayLink
  checkout for that public wallet.
- The buyer creates and signs the Polymarket v2 BUY order locally.
- PolyDesk validates the exact signed-order payload constraints after the OKX
  x402 service payment. Polymarket CLOB remains the final cryptographic
  signature and wallet-authority verifier.
- The buyer creates its own CLOB submission headers locally and submits the
  exact payload directly to `https://clob.polymarket.com/order`.

If the buyer's wallet cannot deploy or approve Polymarket contracts, this
integration does not bypass that limitation.

## Safety contract

- BUY only.
- Immediate `FAK` or `FOK` orders only; no persistent `GTC` or `GTD`.
- Default maximum maker amount: 25 USDC.
- Signature timestamp must be a CLOB V2 millisecond timestamp no more than 15
  minutes old.
- Declared token, signer, side, order type, and exact payload must all match.
- Only the official v2 request and order fields are accepted; embedded secret
  or passphrase fields are rejected.
- The signed builder code must match PolyDesk.
- Builder attribution is bound into the signed CLOB V2 `order.builder` field.
  CLOB V2 does not use separate builder HMAC headers.

## End-to-end flow

1. Optionally fund the public Polymarket wallet:

   `POST /api/a2mcp/polymarket-funding-link`

2. Send only the simple public intent to the free preparation endpoint:

   `POST /api/polymarket-open/prepare`

   PolyDesk resolves the exact token, order book, tick size, negative-risk
   exchange, V2 builder code, public pUSD balance, and public allowance.

3. If `readyForLocalSigning` is true, build and sign the returned
   `signingPlan` locally with `@polymarket/clob-client-v2`. PolyDesk never
   receives the signer or CLOB secrets.
4. Validate the exact signed request for free:

   `POST /api/polymarket-signed-open/validate`

5. Send the same body to the paid endpoint:

   `POST /api/a2mcp/polymarket-signed-open`

6. Complete the returned OKX HTTP 402 payment and replay the exact request.
7. Create the buyer's CLOB submission headers locally.
8. Submit the exact `submission.orderPayload` directly to Polymarket. The CLOB
   performs final cryptographic signature and wallet-authority verification.

## Simple preparation request

```json
{
  "externalOrderId": "conviction:open:001",
  "marketUrl": "https://polymarket.com/event/example-market",
  "outcome": "Yes",
  "maxSpendUsdc": "5",
  "wallet": "0xPUBLIC_DEPOSIT_WALLET",
  "orderType": "FAK"
}
```

That request contains only public information. If an event contains several
markets and the outcome is ambiguous, the endpoint returns the available
market slugs instead of choosing one. Repeat the request with `marketSlug` or
`tokenId`.

The response includes:

- `readyForLocalSigning`
- exact market, condition, outcome token, tick size and negative-risk flag
- current execution boundary from the live order book
- deposit-wallet deployment state
- pUSD balance and allowance to the correct V2 exchange
- official SDK client arguments and `createMarketOrder` arguments
- a 60-second plan expiry and order-book hash
- explicit unresolved checks for buyer-local CLOB credentials and signature

Try it without installing a wallet library:

```powershell
node examples/polymarket-open-prepare.mjs `
  "https://polymarket.com/event/example-market" `
  "Yes" `
  "5" `
  "0xPUBLIC_DEPOSIT_WALLET"
```

## Local signing sketch

The buyer converts the returned strings to the official SDK enums locally:

```js
import {
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
} from '@polymarket/clob-client-v2'

const client = new ClobClient({
  host: plan.signingPlan.client.host,
  chain: plan.signingPlan.client.chain,
  signer: buyerLocalSigner,
  creds: buyerLocalClobCredentials,
  signatureType: SignatureTypeV2.POLY_1271,
  funderAddress: plan.wallet.address,
  builderConfig: plan.signingPlan.client.builderConfig,
})

const signedOrder = await client.createMarketOrder({
  tokenID: plan.market.tokenId,
  amount: Number(plan.wallet.collateral.required),
  price: Number(plan.market.executionPrice),
  side: Side.BUY,
  orderType: plan.signingPlan.submit.orderType === 'FOK'
    ? OrderType.FOK
    : OrderType.FAK,
  userUSDCBalance: Number(plan.wallet.collateral.balance),
}, {
  tickSize: plan.market.tickSize,
  negRisk: plan.market.negRisk,
  version: 2,
})
```

`buyerLocalSigner` and `buyerLocalClobCredentials` stay inside the buyer
agent. They are never sent to PolyDesk.

## Request body

```json
{
  "externalOrderId": "conviction:test:001",
  "marketUrl": "https://polymarket.com/event/example-market",
  "marketTitle": "Example market",
  "outcome": "Yes",
  "tokenId": "123456789",
  "signer": "0xBUYER_POLYMARKET_SIGNER",
  "orderType": "FAK",
  "order": {
    "salt": "...",
    "maker": "...",
    "signer": "0xBUYER_POLYMARKET_SIGNER",
    "tokenId": "123456789",
    "makerAmount": "5000000",
    "takerAmount": "...",
    "side": "BUY",
    "signatureType": "3",
    "timestamp": "MILLISECONDS_SINCE_UNIX_EPOCH",
    "expiration": "0",
    "metadata": "0x...",
    "builder": "0xPOLYDESK_BUILDER_CODE",
    "signature": "0x..."
  },
  "orderPayload": {
    "order": {
      "...": "the exact signed order fields above"
    },
    "owner": "BUYER_CLOB_API_KEY_IDENTIFIER",
    "orderType": "FAK",
    "deferExec": false,
    "postOnly": false
  }
}
```

Never send a private key, seed phrase, CLOB API secret, or CLOB passphrase to
either PolyDesk endpoint.

The free validator and paid handoff validate shape, freshness, caps, and exact
payload binding. They do not claim that a signature will settle; only the
Polymarket CLOB can give that final result.
