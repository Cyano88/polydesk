# Independent Polymarket decisions

The free `GET /api/polymarket-independent/prepare` describes an explicit
alternative to ZeroScout research approval. Its `POST` reuses the existing
market preparation and governed-order flows. It supports immediate BUY orders
only (FAK/FOK). It does not call ZeroScout, require an ANALYZE payment, or convert
an ESCALATE research receipt into an APPROVE receipt.

Required POST fields: `acknowledgeIndependentDecision: true`, `externalOrderId`,
`ownerAddress`, `marketUrl`, `outcome`, `side: "BUY"`, `maxSpendUsdc`, and
`maximumPrice`. Use decimal strings with at most six decimal places for amounts
and price. Optional fields are `wallet`, `orderType`, `marketSlug`, and `tokenId`.
The optional wallet must match the owner-derived Deposit Wallet. Unknown fields,
including credentials, are rejected.

Preparation checks the deployed owner-derived wallet, exact active market,
current asks and order size, pUSD balance and allowance, maximum price, and a
book timestamp no older than 30 seconds. Blocked requests return no signing
plan. Resolve funding through `/api/polymarket-account/readiness` and the existing
funding service, then request a fresh plan.

The successful response includes an independent-decision disclaimer and a
canonical mandate containing `researchPolicy: "agent-independent-v1"`, exact
market and token, price/spend limits, signer, owner authority, and a one-minute
expiry. Review the disclaimer and limits, then sign the returned
`authorizationMessage` with the owner EOA. Preserve the canonical mandate and add
`authoritySignature`. Prepare the exact order locally using the returned
official SDK plan; never send private keys or reusable CLOB credentials.

Submit the existing governed request shape (market metadata, signed order,
exact `orderPayload`, and signed mandate) to
`/api/polymarket-governed-open/validate`. Only APPROVE continues through
`/api/a2mcp/polymarket-agent-flow`. Its separately disclosed service-access terms
remain in force. The buyer refreshes access and execution checks and submits
locally. Preparation neither signs nor submits orders. Terminal receipts still
require existing Polygon and public-fill verification.

Smart Trader provider failures and ESCALATE responses expose an
`independentExecution` descriptor. Following it is an explicit new buyer
decision; ZeroScout approval is never implied.
