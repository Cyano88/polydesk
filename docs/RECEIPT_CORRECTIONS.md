# Receipt-linked Base corrections

GET /api/a2mcp/polymarket-smart-trader/payment/{transaction}/correction returns correction status/addendum. POST on the same route requires the existing POLYDESK_A2A_OPERATOR_KEY bearer credential. Never expose that key to a buyer. REQUEST accepts only action and issue. PUBLISH accepts only action, originalAnalysisHash and addendum (summary, corrections, sources with HTTPS URL/observedAt/finding, remainingGaps, disposition ESCALATE, authorship OPERATOR_REVIEWED).

The server requires a completed persisted CDP x402 Base receipt for 300000 atomic USDC, snapshots the original report and hash, and atomically stores one correction per receipt. Repeating identical requests/publications returns the original record; changed issues/revisions conflict. Publication refuses a changed original report. The paid report is never overwritten. No payment, inference call, refund or order is executed by this route. AdditionalPaymentRequired is false. Current release supports manual operator addenda only; it does not claim authenticated buyer self-service or automatic AI reruns. Public read access matches existing public delivery URLs.

Review corrected findings and original JSON before acceptance. A correction can retain ESCALATE and does not renew a trade decision. Broader new research is a separate scope, not a correction fee.
