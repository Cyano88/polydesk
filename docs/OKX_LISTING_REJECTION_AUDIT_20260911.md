# OKX listing rejection audit - September 11, 2026

## Runtime repair verified

Provider host: pocket-nft-signer-1. The owner upgraded root-owned @okxweb3/a2a-node from 0.2.13 to 0.2.14 and restarted polydesk-a2a-daemon. Official doctor --fix --json returned ok=true, ready=true, eight passes and zero failures at 10:22 UTC. Daemon activation: 10:22:04 UTC; NRestarts=0. Onchain OS preflight separately confirmed version 4.5.3 and integrity=ok.

The first automated upgrade failed with EACCES because the polydesk service account cannot modify /usr/local/lib/node_modules. Root SSH was denied; owner used the VPS root console. No broad npm script approvals were applied.

## One-off and audit response failure

The reviewer probes reached the worker normally. One-off peer inquiry arrived at 08:49:23 UTC; its worker completed at 08:49:57. Audit peer inquiry arrived at 09:16:22; worker completed at 09:16:54. Both checked official context and found created/awaiting acceptance. Both wrote local AI final messages rather than sending buyer-facing chat replies. No transport timeout was needed to cause this silence.

The one-off job later received job_accepted at 09:57:27; outbound transport accepted a reply at 09:57:59, followed by several further replies. This does not negate the initial review failure or prove successful delivery of research.

Targeted correction: ops/polydesk-a2a/AGENTS.md now separates pre-acceptance buyer acknowledgement/negotiation from prohibited paid work. A verified inbound buyer inquiry requires an actual same-task reply result or a recorded transport blocker, with explicit identity binding, duplicate handling, and preservation of all acceptance/trading gates.

The corrected instructions were copied to both the provider checkout and active workspace. SHA256 for both: 7d97321b986e08bdd9eb20c931f2860dc485686108f83e362dca7b1f3015c323. Previous active file preserved as AGENTS.before-reply-fix-20260911.md. Local diff whitespace check passed. Changes remain uncommitted; preserve them during later deployments. New inbound behavior has not yet been tested end to end.

## Subscription delivery gap

subscribe-active --agent-id 5427 returned three active subscriptions. Individual official status queries bound them to ASP 5427, including the reviewer Agent 1791. The wallet-wide my-subscriptions provider view returned another provider identity and is not sufficient alone; the existing exact-directory fallback is necessary.

The five-minute cron executes reconcile-once.sh -> managed-agent:operator --once. Its response active=3, stopped=0, notified=0 counts active directory rows and lifecycle email notifications. It does not prove monitoring enrollment or OKX subscription signal delivery. The inspected reconciler does not publish recurring OKX deliverables. trade-signal-outbox still labels its OKX live signal integration pending-schema; do not describe that as delivered.

Required next work: implement the scoped recurring OKX delivery bridge using the official subscription guide, real monitoring/research output, exact active subscription binding, durable duplicate protection, delivery evidence and buyer follow-up prompts. Keep trade execution separate and buyer-authorized. Do not fabricate a trade recommendation, change buyer preferences or send placeholder signals merely to pass patrol.

## Remaining acceptance

- New inquiry -> actual outbound acknowledgement for one-off and audit, with buyer receipt evidence.
- Genuine scheduled managed result -> OKX subscription delivery -> buyer receipt.
- Only after those checks: listing resubmission. No resubmission or new outbound test message was sent during this audit.

Reference: https://web3.okx.com/onchainos/dev-docs/okxai/a2a-subscription
