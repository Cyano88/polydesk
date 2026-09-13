# ZeroScout pending-state repair and read-only reconciliation

Existing paid report: c8754d17-d1d5-4081-a190-0e347aa17d84. Payment and original research are preserved. No provider POST, new research, payment, or trade was run.

PolyDesk recorded the initial queued event at 2026-09-12T23:54:33.115Z and an aborted request at 23:55:48.821Z. Its previous catch handler mislabeled the ended promise as continuing/queued. Report projection now recognizes that legacy queued+retryable state as needs attention. Future terminal errors record failed/needs_reconciliation with the sanitized error and no automatic retry promise. A completed saved verification still takes precedence.

Provider inspection used the existing ZeroScout checkout at commit 1f9c0ae72d6b8babadd3c13048570522741daf2b, matching the active Railway deployment. The intelligence endpoint returns its generated ID and 0G proof only upon completion; the inspected routes do not provide a lookup by the caller request ID. PolyDesk did not persist that ID for the original request.

Railway application logs at 2026-09-12T23:57:12.295Z report failure to finalize a paid LP Scout result: Claude fable/sonnet requests returned HTTP 400 deprecated_parameter; deepseek-v4-pro and glm-5.2 timed out. This is temporally and workload-correlated evidence, not an exact request-ID match. The HTTP-log query failed with Problem processing request. No completed result/proof was recovered. Do not claim that zero compute credits were consumed or that replay is idempotent.

Next technical repair is the LP-specific provider request schema/model compatibility, plus durable request correlation for future calls. Do not automatically repeat the existing paid compute while its exact upstream outcome lacks a durable lookup. This status repair does not change provider code or install a new worker.

Validation: 17 focused tests passed and server TypeScript passed before deployment. Existing report projection must be checked live for needs_attention and unchanged payment/research fields.
