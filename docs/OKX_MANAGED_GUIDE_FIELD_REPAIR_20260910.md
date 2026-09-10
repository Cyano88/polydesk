# OKX managed serviceGuide repair - September 10, 2026

Problem: the official onchainos v4.5.3 AgentService serialization omits serviceGuide, so ordinary updates save serviceDescription but silently discard the onboarding guide. The old guide promises automatic copying and requires trading funds for monitoring.

Implementation: isolated checkout of official okx/onchainos-skills tag v4.5.3, commit 17daea5dd2d4846ed5a812219afec07965c14b80, at C:\Users\USER\onchainos-guide-fix-20260910. ops/onchainos-service-guide-v4.5.3.patch modifies only the update serialization and adds focused tests. Normal parse_services validation remains first. The known serviceGuide field is then forwarded only for A2A create/update entries, only as nonempty text. Unknown fields remain discarded. Identity ownership, session signing and broadcast code are unchanged.

The corrected guide payload is ops/okx-managed-guide-field-update-20260910.json. It explicitly requires the buyer agent to approve each exact trade within its buyer-granted authority; subscription and watched-wallet selection confer no trading authority. No unattended auto-copy. Existing service ID, 5 USDT/month, 72-hour trial, description and avatar are preserved.

The temporary binary is built in Linux with Rust 1.91.0 and the official locked dependencies; it does not replace the installed production CLI. No financial keys or tokens are exported or logged. No trading or buyer task settlement is part of this repair.

Acceptance requires a successful update AND a fresh official service-list read where serviceGuide exactly equals the requested text. A successful transaction alone is insufficient. Listing review submission is a separate action after that verification.

## Verified completion

All three focused regression tests passed and the executable built successfully. Temporary binary SHA256: d975038c0c79daf7105fde5bb1cded9c052dd436be185b01e81617bd38888b97. The provider-host copy matched this hash; existing installed CLI was not replaced.

Guide update succeeded: 0x4c25fe46b93989038185d4791af6f6485a0f45c5f220d15166a006ddcbb9d2c3. Independent read-back through the unmodified official CLI returned guideMatches=true and descriptionMatches=true. Service #38496 still has 5 USDT/month and a 72-hour trial, with the original avatar unchanged. Exact field evidence: ops/okx-managed-guide-field-verification-20260910.json.

The unmodified official provider CLI then submitted the five-service listing for review. Its response contains submitApproval success=true and approvalStatus=2. The activate section includes the previous rejection reason; that is not a new rejection of this submission. Marketplace approval is pending, not guaranteed. No post-submission polling was performed.
