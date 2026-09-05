# PolyDesk on Base Agentic Market

PolyDesk extends Polymarket intelligence into the Base agent ecosystem without moving Polymarket execution away from Polygon.

## Ecosystem roles

- Base Agentic Market discovers the service and collects the 0.30 USDC x402 service payment on Base.
- PolyDesk finds and evaluates Polymarket markets, records a bounded decision, and returns an execution handoff.
- OKX Onchain OS is the reference buyer wallet and signing surface for agents.
- Polygon remains the chain where a user-approved Polymarket order is signed and submitted.
- Sibyl Memory is a later phase. It must change a future decision using recalled history before PolyDesk describes it as integrated.

## Non-negotiable authorization boundary

The Base USDC service payment pays only for intelligence. It never authorizes a Polymarket order. A trade requires a second, explicit Polygon authorization after the user or agent reviews the bounded handoff.

## Seller endpoint

`POST /api/x402/base/polymarket-smart-trader`

An unpaid valid request returns x402 v2 payment requirements for Base mainnet (`eip155:8453`) and USDC. The response includes Bazaar discovery metadata so compatible marketplaces can index the service after a successful verification and settlement.

## Production configuration

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `BASE_X402_PAY_TO`
- Existing Smart Trader and ZeroScout production variables

The receiver is an address, not a private key. PolyDesk does not require or retain a CDP wallet secret for settlement.

## Release gates

1. Typecheck, build, and run the Base, OKX buyer-acceptance, and Smart Trader suites.
2. Configure the three Base seller variables in the existing Render service.
3. Confirm an unpaid request returns a valid 402 challenge with Bazaar metadata.
4. With explicit approval, settle one small Base USDC service payment and verify the durable receipt.
5. Separately approve and submit one Polygon Polymarket trade, then verify the complete receipt chain.

Current status: the Base seller transport is implemented locally. It is not yet deployed, live-settled, indexed, or powered by Sibyl Memory.
