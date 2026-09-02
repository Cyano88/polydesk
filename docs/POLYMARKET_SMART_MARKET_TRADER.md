# PolyDesk Smart Market Trader

PolyDesk Smart Market Trader is an OKX AI ASP service for active Polymarket markets. It is not a separate public-facing `polydesk.trade` product. It is separate from LP Scout and does not recommend supplying liquidity or optimize LP rewards.

## Product boundary

PolyDesk owns market discovery, evidence collection, smart-money provenance, transparent ranking, risk flags, and the structured execution handoff. The official OKX OnchainOS Polymarket plugin owns wallet access, regional checks, balance checks, previews, authorization, signing, and order submission.

The ranking label is `risk-adjusted-opportunity-screening-not-profit-forecast`. It is not expected profit and is never a guarantee.

## Endpoint

`POST /api/a2mcp/polymarket-smart-trader` is the OKX Agent Payments Protocol service and accepts two actions:

- `ANALYZE`: the single 0.3 USDT payment gate. Search by query/category or resolve an exact market URL/ID, rank the candidates, bind a BUY or SELL side, add research evidence, and persist a 15-minute `APPROVE` or `ESCALATE` decision receipt containing the settled payment proof.
- `PREPARE`: require that paid decision ID, re-resolve current market state, enforce the stored market/outcome/side/mandate/size/price-drift bounds, and return a preview-only OnchainOS plugin invocation. For BUY, the handoff first runs the free owner/deposit-wallet readiness check and routes a verified pUSD shortfall to `/api/a2mcp/polymarket-funding-link`; it resumes only after funding is terminal and a refreshed readiness check returns `PREPARE_BUY`. PREPARE is included in the workflow and does not settle a second analysis payment.

`GET /api/a2mcp/polymarket-smart-trader/decision/:decisionId` verifies a persisted service decision receipt and current expiry state.

Before issuing the `ANALYZE` payment challenge, the service resolves an active market, verifies ZeroScout access, and requires at least one current item from the market's sports or general-news evidence lane. Missing evidence now fails before settlement instead of charging for an analysis that cannot satisfy the approval contract.

The x402 replay contract declares the selected action and its inputs. `ANALYZE` requires at least one of `query`, `category`, or `marketId`; exact `outcome` and `side` are required for an `APPROVE` receipt. `PREPARE` additionally requires the prior paid `decisionId` and bounded order parameters. Public `DISCOVER` requests are rejected before payment because discovery is part of ANALYZE. The service advertises readiness only when durable storage and ZeroScout are configured, and checks ZeroScout, Polymarket Gamma, and CLOB availability before payment processing.

The `smart-money-observed` tag is emitted only when recent public activity from the PolyDesk-curated wallet registry matches the exact condition and outcome token. A request-supplied wallet can emit only `public-wallet-signal-observed`; callers cannot self-assign the trusted label. No wallet set or no matching evidence means no signal tag.

Sports analysis may include Sportmonks-backed news from the existing PolyDesk provider layer. Politics, economics, crypto, and other categories use the configured general-news provider. ZeroScout receives a sanitized, timestamped evidence packet and is asked for a thesis, counter-thesis, risk flags, confidence, and data gaps. If research or stored ZeroScout proof is unavailable, PolyDesk withholds a directional opinion instead of inventing one.

`PREPARE` does not trade. It returns structured `previewInvocation` and `invocation` arrays for `polymarket-plugin`, a `fundingFlow` for BUY shortfalls, and the mandatory OnchainOS gates. The funding branch uses the same owner-derived Deposit Wallet contract as Governed Polymarket Trader: it never trusts an arbitrary destination, never treats checkout creation as settlement, and refreshes pUSD before continuing. Funding readiness cannot convert an `ESCALATE` analysis into an approval. The caller must run the preview and satisfy the plugin typed live-mode confirmation or exact autotrade execution-card rules before a live write.

## Remaining production work

- Expand and measure category-specific source coverage beyond the configured general-news provider.
- Calibrate and govern the public smart-money wallet registry instead of relying only on environment configuration.
- Track order, fill, position, and redemption receipts back to the research decision.
- Register the paid route in the external OKX marketplace after production deployment and confirm its assigned marketplace metadata without inventing an ID locally.
