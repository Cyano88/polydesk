# PolyDesk A2A Trading Agent

This is the overarching A2A service for PolyDesk Agent `#5427`. It combines public wallet watching, deterministic selection, account readiness, verified funding guidance, bounded trade preparation, buyer-controlled execution, and public PnL evidence in one task.

It is not a custodial trading bot. PolyDesk never asks for a private key, seed phrase, wallet authorization key, or reusable Polymarket CLOB secret.

## One-sentence flow

Give PolyDesk a public signal and a written spend/price cap; it prepares one bounded Polymarket BUY, the buyer places it with a compatible EVM signer controlling the verified Deposit Wallet, and PolyDesk returns a recomputable public PnL receipt. Paying for the service through OKX Agentic Wallet does not by itself prove Polymarket approval or order-signing support.

## Why A2A

The existing A2MCP endpoints remain reusable direct services. The A2A agent is the coordinator for a longer trading job:

1. discover or select a public signal;
2. verify that the task is accepted and the buyer wrote an autotrade cap;
3. derive and match the buyer's Polymarket Deposit Wallet;
4. return `FUND` or `APPROVE_COLLATERAL` when the account is not ready;
5. otherwise deliver one short-lived OKX-native autotrade signal;
6. observe public Polymarket state and return an open or realized PnL receipt.

The A2A marketplace task has no public service endpoint. The private operator API documented below is the internal bridge used by the PolyDesk worker after OKX sends `job_accepted`.

## Marketplace services

**Primary membership:** PolyDesk Trading Membership `#38496`

**Type:** A2A subscription

**Subscription:** 5 USDT per month

**Free trial:** 3 days

The original single-purchase PolyDesk Trading Agent `#38484` remains available at 0.1 USDT per task. Both service IDs use the same bounded worker and safety policy; the membership is the campaign and hackathon entry point.

**Description:**

> Give PolyDesk a watched Polymarket wallet or an exact public BUY, your buyer owner EOA, and a written spend, price, and expiry cap. PolyDesk checks the owner-derived Deposit Wallet, returns a verified funding or approval action when required, then delivers one bounded BUY signal. Place it with a compatible EVM signer controlling that Deposit Wallet. The task finishes with a public, recomputable open or realized PnL receipt. No private keys or reusable CLOB credentials are shared. AUTO_BEST_FIT ranks execution quality under explicit rules; it does not predict profit.

## Task parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `watchedWallet` | Yes | Public Polymarket wallet to inspect. |
| `ownerAddress` | Yes | Buyer owner EOA used to derive and verify the matching Polymarket Deposit Wallet. |
| `selectionMode` | Yes | `TRADE`, `POSITION`, or `AUTO_BEST_FIT`. |
| `transactionHash` | TRADE only | Exact public source BUY transaction. |
| `tokenId` | When ambiguous | Exact Polymarket outcome token. |
| `conditionId` | POSITION when needed | Exact Polymarket condition. |
| `maxSpendUsdc` | Yes | Maximum quote amount for this one BUY. |
| `maximumPrice` | Yes | Maximum share price from greater than `0` through `1`. |
| `expiresAt` | Yes | Expiry for this authorization and signal. |
| `selectionPolicy` | AUTO_BEST_FIT | Explicit spread, depth, book-age, and resolution-time rules. |

Never include wallet keys, seed phrases, passwords, CLOB secrets, or reusable authorization material.

## Copy-paste buyer task

```text
Watch public Polymarket wallet 0xPUBLIC_WALLET and prepare one BUY for my owner EOA 0xBUYER_OWNER_EOA.

Selection mode: AUTO_BEST_FIT
Maximum spend: 5 USDC
Maximum share price: 0.63
Minimum depth: 10 USDC
Maximum spread: 0.05
Minimum time to resolution: 24 hours
Expiry: 2026-08-02T18:00:00Z

Do not request or receive wallet secrets. If my derived Deposit Wallet needs funds or collateral approval, return that single next action before proposing a trade. Execute only through my OKX autotrade grant. Return the selected condition, outcome, price ceiling, execution evidence, and a public PnL receipt.
```

## Worker lifecycle

The production runner is `scripts/polydesk-a2a-worker.ts`. It is deliberately separate from the public Render API: Render prepares immutable missions, while an always-on A2A runtime receives accepted jobs and invokes the runner.

### 1. Wait for acceptance

Applying is not acceptance. The worker must not prepare or deliver paid work until OKX reports `job_accepted`.

### 2. Validate the written buyer cap

Before asking PolyDesk to prepare a signal, the ASP worker checks the buyer's grant:

```powershell
onchainos agent autotrade-grant-check --job-id JOB_ID --venue polymarket --action buy --amount 5 --format json
```

Continue only when the top-level result is `{"ok":true}`.

### 3. Prepare the internal mission

The private worker calls:

```http
POST /api/a2a/polydesk-trading-agent
Authorization: Bearer <POLYDESK_A2A_OPERATOR_KEY>
Content-Type: application/json
```

```json
{
  "action": "PREPARE_SIGNAL",
  "jobId": "JOB_ID",
  "taskStatus": "job_accepted",
  "watchedWallet": "0xPUBLIC_WALLET",
  "ownerAddress": "0xBUYER_OWNER_EOA",
  "selectionMode": "AUTO_BEST_FIT",
  "maxSpendUsdc": "5",
  "maximumPrice": 0.63,
  "expiresAt": "2026-08-02T18:00:00Z",
  "grantCheck": {
    "ok": true,
    "venue": "polymarket",
    "action": "buy",
    "amountUsdc": "5"
  },
  "selectionPolicy": {
    "maximumSpread": 0.05,
    "minimumDepthUsdc": 10,
    "minimumHoursToResolution": 24,
    "maximumBookAgeSeconds": 30
  }
}
```

The result is exactly one of:

- `requires_action` with `FUND`;
- `requires_action` with `APPROVE_COLLATERAL`;
- `signal_ready` with one `autoTrade` payload.

The same `jobId` and inputs return the same mission. Reusing the job ID with different inputs is rejected.

### 4. Deliver through OKX

The `autoTrade` object intentionally omits `signalTime`; the current OKX CLI stamps it and validates the structure before delivery.

```powershell
onchainos agent deliver JOB_ID --agent-id 5427 --message "Bounded Polymarket BUY prepared" --autotrade '<SINGLE_LINE_AUTOTRADE_JSON>'
```

The first release supports one immediate BUY per task. It does not silently add a sell, stop, or exit. A later sell needs its own explicit authorization.

### 5. Snapshot public PnL

After the public Polymarket position appears, the worker calls the same private endpoint with:

```json
{
  "action": "PNL_SNAPSHOT",
  "missionId": "pda2a_..."
}
```

The public receipt is then available at:

```text
GET /api/a2a/polydesk-trading-agent/receipt/{missionId}
```

The receipt binds the job, buyer Deposit Wallet, condition, token, outcome, current or realized PnL fields, observation time, source URLs, and a deterministic SHA-256 proof hash.

## OKX autotrade payload

```json
{
  "schemaVersion": 1,
  "deliveryId": "pd_...",
  "signalType": "polymarket",
  "ttlSec": 600,
  "params": {
    "conditionId": "0x...",
    "outcome": "Yes",
    "side": "buy",
    "amount": "5",
    "amountUnit": "quote",
    "maxPriceCents": 63
  }
}
```

The price ceiling is rounded down to whole cents so the signal never exceeds the written decimal maximum.

## Safety guarantees in the implementation

- no work before `job_accepted`;
- private operator authentication on mission mutations;
- durable, atomic mission storage;
- one mission per job ID;
- input-drift rejection;
- a matching successful OKX Polymarket BUY grant check for the exact amount;
- secret-field rejection;
- exact owner-to-Deposit-Wallet match inherited from PolyDesk preparation;
- funding and approval returned before a signal is emitted;
- one BUY, quote-denominated amount, and bounded price;
- expiry from 30 seconds through the OKX maximum of 86,400 seconds;
- no `signalTime` supplied by the ASP;
- public PnL evidence from the official Polymarket Data API;
- no claim that selection quality predicts profit.

## Current limitations

- A2A registration and a live accepted buyer task are still required before calling this marketplace-live.
- Current OKX command-safe outcome encoding accepts only alphanumeric, underscore, and hyphen characters. PolyDesk blocks unsupported multiword outcomes instead of rewriting them incorrectly.
- PnL is public market-account evidence, not a guarantee that one task alone caused every position change in the same wallet. The receipt therefore binds the exact condition and token whenever available.
- This release does not automatically close a position.

## Verification

```powershell
npm run typecheck:server
npm run test:a2a-trading
npm run test:a2a-worker
npm run a2a:worker -- --request examples/polydesk-a2a-worker-request.json --dry-run
```

All four commands must pass before deployment. The dry-run never calls OKX, PolyDesk, or Polymarket and never submits a trade. After deployment, verify the public descriptor, then run one explicitly approved small-cap accepted task before describing the service as production-autonomous.

VPS deployment and recovery instructions are in [`POLYDESK_A2A_WORKER.md`](./POLYDESK_A2A_WORKER.md).
