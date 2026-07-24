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
- PolyDesk validates the exact signed order after the OKX x402 service payment.
- The buyer creates its own CLOB submission headers locally and submits the
  exact payload directly to `https://clob.polymarket.com/order`.

If the buyer's wallet cannot deploy or approve Polymarket contracts, this
integration does not bypass that limitation.

## Safety contract

- BUY only.
- Immediate `FAK` or `FOK` orders only; no persistent `GTC` or `GTD`.
- Default maximum maker amount: 25 USDC.
- Signature timestamp must be no more than 15 minutes old.
- Declared token, signer, side, order type, and exact payload must all match.
- Only the official v2 request and order fields are accepted; embedded secret
  or passphrase fields are rejected.
- The signed builder code must match PolyDesk.
- Builder-signing sessions are exact-body, single-use, and expire after five
  minutes.

## End-to-end flow

1. Optionally fund the public Polymarket wallet:

   `POST /api/a2mcp/polymarket-funding-link`

2. Build and sign a Polymarket v2 BUY order locally.
3. Validate the exact request for free:

   `POST /api/polymarket-signed-open/validate`

4. Send the same body to the paid endpoint:

   `POST /api/a2mcp/polymarket-signed-open`

5. Complete the returned OKX HTTP 402 payment and replay the exact request.
6. Use `submission.builderSigner` once to obtain PolyDesk builder headers for
   the exact serialized `submission.orderPayload`.
7. Create the buyer's CLOB submission headers locally.
8. Combine the buyer headers and builder headers, then submit the exact body
   directly to Polymarket.

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
    "timestamp": "...",
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
