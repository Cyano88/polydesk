# PolyDesk Smart Trader - OKX AI listing draft

Status: local draft only. Do not publish until the live ZeroScout and PolyDesk deployment checks below pass and the current PolyDesk ASP identity and service list are verified with an updated OKX client.

## Proposed service fields

- Service name: `PolyDesk Smart Trader`
- Service type: API service
- Fee: `0.1` USDT per call
- Endpoint: `https://polydesk.trade/api/a2mcp/polymarket-smart-trader`
- Method: `POST`

## Request description

1. [Service Description] Discovers and ranks active Polymarket outcomes, produces ZeroScout-backed direct-trade intelligence with explicit SUPPORT, OPPOSE, or INSUFFICIENT assessment, and prepares a receipt-bound preview for the official OnchainOS Polymarket integration. It does not provide LP recommendations or submit orders.
2. [Parameter Spec] action (string, required): DISCOVER, ANALYZE, or PREPARE; query (string, optional): discovery search, default empty; category (string, optional): category filter, default empty; marketId (string, optional): URL, slug, or condition ID, required after discovery; outcome (string, optional): exact outcome, required after discovery; side (string, optional): BUY or SELL, required after discovery; decisionId (string, optional): approved analysis receipt, required for PREPARE; amountUsdc (number, optional): BUY size; shares (number, optional): SELL size; orderType (string, optional): FOK, FAK, GTC, or GTD, default FOK; limitPrice (number, optional): bounded price; mandate (object, optional): execution and risk bounds.
3. [Request Method] POST
4. [Request Example] `curl -X POST https://polydesk.trade/api/a2mcp/polymarket-smart-trader -H "Content-Type: application/json" -d '{"action":"DISCOVER","query":"US election","limit":5}'`

## Verified implementation boundaries

- Direct-trade and LP routing markers are mutually exclusive; mixed requests are rejected before model execution.
- `ANALYZE` requires an exact market. It may return exploratory analysis without outcome or side, but an `APPROVE` receipt requires an exact outcome and BUY or SELL side.
- An approved receipt requires an eligible current market and a matching ZeroScout `SUPPORT` assessment with at least medium evidence quality and normalized confidence of at least 50 percent.
- `PREPARE` binds market, outcome token, side, mandate, size, price movement, expiry, and decision hash.
- PolyDesk never receives the buyer private key or submits the order. OnchainOS owns wallet checks, preview, typed live confirmation, signing, and submission.

## Listing gates

1. Deploy ZeroScout direct-trade intelligence and verify an authenticated production request returns `intent=polymarket-direct-trade-intelligence`, a trade assessment, and 0G proof metadata.
2. Deploy PolyDesk and verify the service endpoint returns a non-zero OKX x402 challenge with the declared replay schema.
3. Complete paid replays for DISCOVER and ANALYZE using the PolyDesk Agentic Wallet.
4. Verify the persisted decision receipt and run PREPARE through the official plugin dry-run only.
5. Reconcile the dry-run market, outcome token, side, amount, and price to the saved decision hash.
6. Verify the live PolyDesk ASP identity and current service list; then validate this listing payload before requesting user confirmation for the on-chain update.
