# PolyDesk Governed Market OPEN

PolyDesk applies a deterministic spending mandate to one exact buyer-signed Polymarket BUY order. It returns `APPROVE`, `ESCALATE`, or `BLOCK`; no language model decides whether the order is allowed.

PolyDesk never receives a private key, CLOB API secret, or CLOB passphrase. The buyer submits an approved order directly to Polymarket.

## One flow

1. Prepare and sign an immediate BUY locally. `FAK` is the default; use `FOK` only when a partial fill is unacceptable.
2. Ask the free authorization endpoint for the exact mandate message.
3. Sign that message with the authority wallet and add the signature to `mandate`.
4. Run the free preflight.
5. If the decision is `APPROVE`, call the paid endpoint and complete its 0.1-USDT X Layer payment.
6. Submit the returned exact payload directly to Polymarket with buyer-local CLOB headers.
7. Keep `executionId`, `externalOrderId`, and the three hashes with the Polymarket order response.

PolyDesk does not prepare resting `GTC` or `GTD` orders for this flow. The signed price is the maximum execution boundary: `FAK` fills whatever is immediately available within it and cancels the remainder, while `FOK` fills the entire amount or cancels.

## Prepare the authority signature

```http
POST https://polydesk.trade/api/polymarket-governed-open/authorize
Content-Type: application/json
```

Send `externalOrderId` and the unsigned `mandate`. The response returns `canonicalMandate`, `mandateHash`, and the exact `authorizationMessage`. Sign that returned message with `authoritySigner` using `personal_sign`, then place the result in `mandate.authoritySignature`.

Agents do not need to reproduce PolyDesk’s normalization or hashing rules.

## Free preflight

```http
POST https://polydesk.trade/api/polymarket-governed-open/validate
Content-Type: application/json
```

The request uses the normal signed-OPEN fields plus:

```json
{
  "mandate": {
    "maximumAmountUsdc": "5",
    "maximumPrice": "0.55",
    "allowedTokenIds": ["<exact numeric outcome token>"],
    "allowedMarketUrls": ["https://polymarket.com/event/<market>"],
    "allowedSigner": "0x<buyer signer>",
    "authoritySigner": "0x<mandate authority wallet>",
    "authoritySignature": "0x<65-byte personal-sign signature>",
    "validUntil": "<ISO-8601 time no more than 7 days away>",
    "approvalRequiredAboveUsdc": "5"
  }
}
```

`approvalRequiredAboveUsdc` is optional. An otherwise valid order above that threshold returns `ESCALATE` without a submission handoff.

The authority signs the exact UTF-8 message below using normal Ethereum `personal_sign`:

```text
PolyDesk Governed Market OPEN
Policy: polydesk-market-mandate-v1
Network: X Layer (eip155:196)
External order: <externalOrderId>
Mandate SHA-256: <canonical mandate hash>
```

The canonical mandate includes every mandate field except `authoritySignature`, with normalized decimal amounts, lowercase addresses, sorted allowlists, and an ISO-8601 expiry. Integrators should sign the exact `authorizationMessage` returned by the authorization endpoint instead of reconstructing it manually.

## Paid governed handoff

```http
POST https://polydesk.trade/api/a2mcp/polymarket-governed-open
Content-Type: application/json
```

An unpaid request receives a valid OKX Agent Payments Protocol challenge for 0.1 USDT on X Layer. Replay the exact body after payment.

An approved paid response includes:

```json
{
  "decision": "APPROVE",
  "executionId": "pex_<deterministic id>",
  "externalOrderId": "<caller id>",
  "duplicate": false,
  "amountUsdc": "5",
  "effectivePrice": "0.5",
  "reasons": ["Every deterministic mandate check passed."],
  "checks": [
    { "check": "amount", "result": "PASS", "detail": "..." },
    { "check": "price", "result": "PASS", "detail": "..." },
    { "check": "token", "result": "PASS", "detail": "..." },
    { "check": "market", "result": "PASS", "detail": "..." },
    { "check": "signer", "result": "PASS", "detail": "..." },
    { "check": "expiry", "result": "PASS", "detail": "..." }
  ],
  "hashes": {
    "order": "<sha256>",
    "mandate": "<sha256>",
    "decision": "<sha256>"
  },
  "nextAction": {
    "type": "SUBMIT_EXACT_ORDER_LOCALLY",
    "host": "https://clob.polymarket.com",
    "path": "/order",
    "method": "POST",
    "orderPayload": {}
  }
}
```

## Duplicate behavior

The first paid evaluation permanently binds `externalOrderId` to the exact order and mandate fingerprints.

- Exact retry: returns the original decision with `duplicate: true`.
- Same `externalOrderId`, changed order or mandate: returns `BLOCK`.
- No durable database: the endpoint returns `503` before issuing a payment challenge.

## What the policy actually enforces

- The BUY spend is the signed order’s `makerAmount`, interpreted with six decimals.
- Effective price is signed `makerAmount / takerAmount`.
- The token, declared canonical market URL and signer must be allowlisted.
- The mandate must be signed by its declared authority wallet and bound to the external order ID.
- The mandate must be unexpired and no more than seven days long.
- Only immediate BUY orders are accepted.
- `FAK` is the recommended pilot default because it does not leave an unattended order on the book. `FOK` is available when all-or-nothing delivery matters.
- Request a fresh preparation plan immediately before signing; plans expire after 60 seconds and are priced from current asks.
- Polymarket performs final cryptographic signature and order validation.

The market URL is declared metadata; the numeric outcome token is the field cryptographically bound into the signed order. Call PolyDesk’s live OPEN preparation endpoint before signing to resolve the event, outcome token and current order book rather than trusting caller-supplied labels.
