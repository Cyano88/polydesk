# Managed copy approval wording - September 10, 2026

User instruction: make clear that copying a trade requires buyer-agent approval.

The managed service description and provider onboarding instructions now distinguish requested, individually approved copying from unattended auto-copy. Each exact preview requires explicit approval by the buyer agent acting within its buyer-granted authority. Account access, balance, fees, price limits and current execution guards still apply. Following a public wallet or subscribing never grants trading authority. Changed or expired previews need fresh approval. Monitoring-only setup needs no funded trading wallet.

The provider must explicitly correct stale marketplace serviceGuide text in its own buyer conversation. The separate OKX serviceGuide remains unsupported by the official CLI update model; the corrected draft is in ops/okx-managed-approval-copy-20260910.json. Do not claim that field is replaced unless a live service-list read confirms it.

Provider scope now correctly retains three A2A products plus Football Match Live Data #33343 and Polymarket LP Scout #33342. Other four legacy listings stay retired. Original avatar is unchanged.

Validation: listing QA passed with no findings; git diff --check passed. This is a wording and provider-instruction change, not a new copy executor or proof of live end-to-end copying. automaticCopyExecution stays false. Deployment and marketplace results are recorded separately below.

Verified deployment: commit 62eb5f6 is on the provider host; active workspace AGENTS.md exactly matches the tracked version and daemon is active. Marketplace update succeeded: 0xa48dfe9c621ab87e39672c20601a58590ef18da42f36408ba5ee32b97bd3c5e7. A fresh service-list read verified the description exactly, 5 USDT/month and 72-hour trial. The separate serviceGuide does NOT match the correction and still contains automatic-trading wording. Provider conversation correction is deployed, but this does not replace the platform guide.


Superseding result: the actual OKX serviceGuide is now fixed and independently verified. The five-service listing was successfully resubmitted for review (submitApproval success=true, approvalStatus=2). See OKX_MANAGED_GUIDE_FIELD_REPAIR_20260910.md.
