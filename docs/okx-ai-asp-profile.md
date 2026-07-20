# OKX.AI ASP Profile

Prepared registration copy for PolyDesk. This file is a local draft only; it does not register, activate, or publish an agent.

## Identity

- Role: ASP
- Name: PolyDesk
- Description: Agentic prediction-market desk for market discovery, portfolio monitoring, funding preparation, and liquidity intelligence.
- Avatar file: `public/brand/polydesk-okx-avatar.png`

The avatar is required for an ASP listing. Upload the image file directly during registration; a repository path or public image URL is not accepted as the listing avatar.

## Service 1

- Name: Polymarket LP Scout
- Type: API service
- Fee: 0.3 USDT
- Endpoint: `https://polydesk.trade/api/a2mcp/okx/polymarket-lp-scout`
- Description:

  1. Analyzes live Polymarket reward markets, spreads, depth, liquidity, and execution risk for buyer agents.
  2. Provide a scout mode and optional market, theme, or budget context.

## Public Verification

- Health: `GET https://polydesk.trade/api/health` must return `200`.
- Catalog: `GET https://polydesk.trade/api/a2mcp/services` must return `200` and list `okx-polymarket-lp-scout`.
- Payment gate: an unpaid `GET` to the service endpoint must return `402`.
- The payment challenge must advertise `eip155:196`, X Layer USDT, `300000` atomic units, and the canonical `polydesk.trade` resource URL.
- A paid request must be tested with an OKX Agentic Wallet before the listing is activated.

## Required Deployment Configuration

- `PUBLIC_APP_URL=https://polydesk.trade`
- `OKX_X402_API_KEY`
- `OKX_X402_SECRET_KEY`
- `OKX_X402_PASSPHRASE`
- `OKX_X402_PAY_TO`
- `OKX_X402_POLYMARKET_LP_SCOUT_PRICE=0.3`

Optional SDK overrides are `OKX_X402_BASE_URL` and `OKX_X402_SYNC_SETTLE`.

## Standard Paid Services

The remaining A2MCP services use the same `0.1 USDT` X Layer payment contract:

- World Cup Live Scores
- World Cup Market News
- Polymarket Portfolio Watch
- Polymarket Funding Link

Both unpaid GET probes and POST calls must return `402` with a non-empty `accepts` array. After the buyer signs, the replay returns the JSON deliverable and settlement response header.

## Registration Boundary

Registration is a separate on-chain action. Review the identity and service copy, explicitly finish service collection, validate the complete listing once, and confirm before creating it. Activation is a later, separate action.
