# Three-service consolidation checkpoint

Scope: existing OKX A2A products only. Base expansion and marketplace writes
remain paused until acceptance. Preserve underlying Smart Market, funding,
research, governed execution, and receipt APIs when retiring legacy listings.

## Verified local baseline (2026-09-09)

- One-Off 38484: worker and mission tests cover grants, readiness, bounded BUY
  signals, replay protection, and public PnL. The production operator currently
  calls copy preparation. A separate authenticated RESEARCH action now reuses
  Smart Market analysis for an accepted task, with exact market/outcome and
  written screening limits. It returns decision support only, with no x402
  approval receipt, extra buyer payment, or automatic execution. The old BUY
  worker is not yet bound to that research result.
- Managed 38496: subscription identity, email confirmation, pause/cancel/expiry,
  preferences and lifecycle gates exist. Monitoring does not grant copy-trade
  authority; AI research and Sibyl recall are not wired in this module.
- Audit 40363: evidence-linked report builder exists. The audit:report operator
  now makes it locally callable. It does not collect or independently verify
  evidence, authenticate an accepted job, persist memory, or deliver a task.

Run npm run test:okx-three-services for the combined component and discovery
regression gate. Passing it is not proof of live marketplace acceptance.

## Next acceptance work, in order

1. Local One-Off research connection implemented behind operator authentication.
   The trusted runtime verifies accepted OKX tasks; the research endpoint does
   not independently query OKX acceptance. Durable task/buyer/input binding
   prevents duplicate computation and cross-buyer replay. Finish the production
   runtime invocation and research-to-execution authorization binding before
   claiming complete One-Off acceptance. No live entitlement or payment test
   has been performed by this patch.
2. Preserve explicit requesting-agent review on unavailable research. Neither
   ESCALATE nor memory recall grants trading authority. Exercise the existing
   independent preparation path with fresh exact limits and buyer authorization.
3. Bind research decisions and verified execution receipts to job/buyer-scoped
   Sibyl recall. Test cross-buyer isolation, retries, and restart recovery.
4. Exercise the managed subscription operator with authoritative directory
   fixtures, monitoring delivery, research failure, and separate copy consent.
5. Run audit evidence collection through report compilation and authorized A2A
   delivery. Test incomplete evidence and nonconformant results, not just passes.
6. Validate the local OKX buyer package against all three task contracts. Only
   then reconcile outstanding legacy obligations and resubmit three listings.

No component test, generated report, or task-delivery acknowledgement is proof
of a filled order. Onchain OS remains the buyer-controlled signing boundary.

## Local audit follow-up

The private RESEARCH_PREPARE action now binds the saved report hash, task,
buyer, owner and exact execution limits through a stable externalOrderId in
the existing owner-signed mandate message. It reuses independent preparation,
checks report expiry before and after provider work, and does not submit an
order. A caller cannot substitute a market or widen limits. One execution
choice is durably locked per task; refreshing it keeps the same identifier.

Verified-fill memory now optionally carries this bounded opaque a2a_ order
identifier. Both the TypeScript projection and strict Python bridge preserve
it, while existing receipt payloads remain accepted. This is a correlation,
not independent proof of marketplace task acceptance or an AI approval.

Deployment gate: ship API changes and scripts/sibyl-receipt-memory.py together,
verify the deployed bridge bytes and update the configured SHA-256 pin to
those exact bytes before enabling new receipt capture. Do not overwrite old
memory payloads. Local bridge hash at this checkpoint:
9081bc79b4ba3334717d5e7e487c4d5a250b134fe209f64adca4c57af266f8f1.

Still unverified: authoritative production task invocation and delivery,
expired/interrupted research recovery, signed live preparation, verified fill
through the new A2A route, and production Sibyl delivery/recall. Managed and
audit product acceptance remain required. Base and listing changes stay paused.

## Operator invocation checkpoint

The existing a2a:worker command now routes RESEARCH and RESEARCH_PREPARE request
files to the private research transport, without invoking the watched-wallet
BUY worker, autotrade grant, task delivery, signer or payment commands. Default
mode remains dry-run. Transport pins the exact HTTPS endpoint, rejects redirects,
bounds response size and timeout, and verifies task/buyer/report correlation.
Input validation is not authoritative task verification: invocation still belongs
inside the official OKX accepted-task script. A timeout requires reconciliation.

The Managed operator now has directly tested directory-to-request wiring:
wrong service or buyer and missing subscriptions are blocked before HTTP, and
the authoritative period end replaces caller-supplied entitlement. Audit remains
local evidence compilation followed by the official task delivery procedure.
These checks do not establish live email delivery or marketplace completion.
