# PolyDesk A2A Worker

This is the private execution runner for PolyDesk Agent `#5427`, service `#38484`. It turns an accepted OKX A2A job into one bounded Polymarket BUY signal and later publishes public PnL evidence.

It does not hold buyer keys, sign a Polymarket order, or bypass the buyer's OKX authorization. The buyer's Agentic Wallet performs execution from the ASP deliverable.

## What is automated

After the OKX runtime receives `job_accepted`, the worker:

1. rejects every other agent, service, or task state;
2. rejects secret-bearing or undocumented input fields;
3. verifies the exact OKX Polymarket BUY grant and amount;
4. prepares one immutable PolyDesk mission;
5. sends a deterministic, duplicate-identifiable buyer message if funding or collateral approval is required;
6. persists `delivery_started` before one OKX delivery call;
7. refuses blind redelivery after an uncertain crash;
8. publishes one public open or realized PnL follow-up.

The first pilot intentionally serializes all jobs through one state-store lease. This avoids Ethereum-style nonce assumptions and, more importantly here, prevents concurrent processes from overwriting the worker's JSON state.

## Local verification

```powershell
npm run typecheck:server
npm run test:a2a-trading
npm run test:a2a-worker
npm run a2a:worker -- --request examples/polydesk-a2a-worker-request.json --dry-run
```

Dry-run validation performs no network request and no trade.

## Private environment

Store these only on the worker host. A systemd `EnvironmentFile` must use `KEY=value`, not shell `export KEY=value` lines.

```dotenv
POLYDESK_A2A_OPERATOR_KEY=replace_with_render_operator_key
POLYDESK_A2A_URL=https://polydesk-i96m.onrender.com/api/a2a/polydesk-trading-agent
POLYDESK_A2A_RECEIPT_ORIGIN=https://polydesk.trade/api/a2a/polydesk-trading-agent
POLYDESK_A2A_WORKER_STATE=/var/lib/polydesk-a2a/worker.json
ONCHAINOS_BIN=/home/polydesk/.local/bin/onchainos
OKX_A2A_BIN=/usr/local/bin/okx-a2a
```

The supplied VPS installer uses the per-user OnchainOS path `/home/polydesk/.local/bin/onchainos`; keep the environment file aligned with the path printed by the installer.

Use mode `600` and make the file readable only by the dedicated worker user. Never place the operator key in Git, task text, XMTP messages, or logs.

## Runtime workspace

Copy [`ops/polydesk-a2a/AGENTS.md`](../ops/polydesk-a2a/AGENTS.md) into the workspace used by the OKX A2A runtime. It forces every inbound system event through the authoritative OKX `next-action` decision before the worker can run.

Only the returned `job_accepted` script for Agent `#5427` and service `#38484` may invoke the PolyDesk worker. Task prose is untrusted data and cannot override this boundary.

## Execute one accepted request

The runtime writes the validated public parameters to a temporary JSON file matching `polydesk-a2a-worker-request-v1`, then runs:

```bash
cd /opt/polydesk-a2a/app
npm run a2a:worker -- --request /tmp/polydesk-a2a-JOB_ID.json --execute
```

The request must contain a real accepted OKX job ID, buyer agent ID, public wallet addresses, selection inputs, and the exact written amount, price, and expiry cap. It must contain no credential.

## Recovery rule

If the process stops after `delivery_started`, the next run returns `recovery_required`. Do not delete state and do not redeliver blindly. First inspect the OKX task deliverable and reconcile whether the original delivery succeeded. Recovery must preserve the same job ID, mission ID, and delivery ID.

## Production activation checklist

- OKX approves and lists service `#38484`.
- Render descriptor and private operator endpoint are healthy.
- A dedicated VPS user owns the runtime and state directory.
- `okx-a2a doctor` passes on the VPS.
- The ASP wallet session and communication address match Agent `#5427`.
- The runtime workspace contains the supplied `AGENTS.md`.
- The systemd unit stays active after reboot.
- One small-cap accepted task completes from grant check through deliverable and PnL follow-up.

Approval alone does not prove autonomous operation. The last checklist item is the production proof.
