# PolyDesk Smart Trader - OKX AI listing draft

Status: local draft only. Do not publish until the live ZeroScout and PolyDesk deployment checks below pass and the current PolyDesk ASP identity and service list are verified with an updated OKX client.

## Proposed service fields

- Service name: `PolyDesk Smart Trader`
- Service type: API service
- Fee: `0.3` USDT for the complete ANALYZE workflow; its receipt includes PREPARE
- Endpoint: `https://polydesk.trade/api/a2mcp/polymarket-smart-trader`
- Method: `POST`

## Request description

1. [Service Description] Runs one paid workflow that can discover and rank active Polymarket outcomes, produces ZeroScout-backed direct-trade intelligence with explicit SUPPORT, OPPOSE, or INSUFFICIENT assessment, and includes a receipt-bound preview for the official OnchainOS Polymarket integration. It does not provide LP recommendations or submit orders.
2. [Parameter Spec] action (string, required): ANALYZE or PREPARE; query (string, optional): discovery search inside ANALYZE; category (string, optional): category filter inside ANALYZE; marketId (string, optional): URL, slug, or condition ID; ANALYZE requires query, category, or marketId; outcome (string, optional): exact outcome required for approval; side (string, optional): BUY or SELL required for approval; decisionId (string, optional): paid approved analysis receipt required for PREPARE; amountUsdc (number, optional): BUY size; shares (number, optional): SELL size; orderType (string, optional): FOK, FAK, GTC, or GTD, default FOK; limitPrice (number, optional): bounded price; mandate (object, optional): execution and risk bounds.
3. [Request Method] POST
4. [Request Example] `curl -X POST https://polydesk.trade/api/a2mcp/polymarket-smart-trader -H "Content-Type: application/json" -d '{"action":"ANALYZE","query":"US election","outcome":"Yes","side":"BUY","limit":5}'`

## Verified implementation boundaries

- Direct-trade and LP routing markers are mutually exclusive; mixed requests are rejected before model execution.
- `ANALYZE` is the only payment gate and costs 0.3 USDT. It can begin from a query/category or an exact market, but an `APPROVE` receipt requires an exact outcome and BUY or SELL side.
- An approved receipt requires an eligible current market and a matching ZeroScout `SUPPORT` assessment with at least medium evidence quality and normalized confidence of at least 50 percent.
- The paid receipt binds the settled payment to the analysis. `PREPARE` binds market, outcome token, side, mandate, size, price movement, expiry, and decision hash and does not issue a second payment challenge.
- PolyDesk never receives the buyer private key or submits the order. OnchainOS owns wallet checks, preview, typed live confirmation, signing, and submission.

## Listing gates

1. Deploy ZeroScout direct-trade intelligence and verify an authenticated production request returns `intent=polymarket-direct-trade-intelligence`, a trade assessment, and 0G proof metadata.
2. Deploy PolyDesk and verify the service endpoint returns a non-zero OKX x402 challenge with the declared replay schema.
3. Complete one paid ANALYZE replay using the PolyDesk Agentic Wallet and verify the receipt records the settled 0.3 USDT payment.
4. Verify the persisted decision receipt and confirm PREPARE returns the official plugin dry-run without a second settlement.
5. Reconcile the dry-run market, outcome token, side, amount, and price to the saved decision hash.
6. Verify the live PolyDesk ASP identity and current service list; then validate this listing payload before requesting user confirmation for the on-chain update.
