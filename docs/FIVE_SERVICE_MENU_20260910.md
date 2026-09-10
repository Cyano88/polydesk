# PolyDesk five-service menu

Scope approved September 10, 2026: retain three A2A services plus the existing Football Match Live Data and Polymarket LP Scout API services. Do not retire #33343 or #33342. Four other legacy marketplace records remain removed.

| Service | Plain-language explanation | Price |
|---|---|---|
| Football Match Live Data | Get football scores, match times and match events for a team or date. The service tells you when its data provider has no information. | 0.1 USDT/request |
| Polymarket LP Scout | Compare markets that may reward people for keeping buy and sell offers available. See rewards, price gaps, available orders and risks before deciding what to research further. It does not place orders or promise earnings. | 0.3 USDT/request |
| One-Off Polymarket Trade | Get research on one market, read the findings and original JSON, then review the delivery. Any supported trade needs a separate exact preview and your approval. | 0.1 USDT/task; trading funds and costs are separate |
| Managed Polymarket Agent | Monitor a portfolio or public wallet and choose alerts and email summaries. Monitoring needs no trading permission. Unattended copying is unavailable. | 5 USDT/month; 3-day trial |
| Polymarket Integration Audit | Check how a platform connects to Polymarket. Receive a report explaining what was checked, what is still unverified and what should be fixed first. | 25 USDT/task |

## Verified marketplace changes

Both retained API descriptions now use plain-language introductions plus OKX-required parameter descriptions, GET method and copyable HTTPS curl examples. Existing prices, service IDs and endpoint URLs are unchanged. Each endpoint returned HTTP 402 on an unpaid request; no paid test was performed. Listing validation passed with no findings. Official service-list confirmed exactly five records and exact description/price matches for #33343 and #33342.

Update transaction: 0x034d3cd373e0da9a8008c3aeeda719b7b9befe59c062a26480f349ed3606075d.
Original avatar preserved. No new avatar uploaded.

The managed serviceGuide is still stale and must be corrected through a supported editing route. The earlier support draft's retirement requests are superseded by the decision to retain those two services; do not send those retirement requests. Existing task obligations continue normally.

Suggested buyer follow-ups: Show football data; Explain this LP report; Show research results; Check monitoring status; Show audit findings. Research/service acceptance and trading authorization remain separate.

Review submission result: see ops/okx-five-service-review-result-20260910.json. Saved descriptions do not prove review approval, paid end-to-end acceptance or guaranteed service outcomes.
Final review state: the two native review attempts returned connection errors (profile lookup reset, then TLS BadRecordMac at agent-status). A fresh official get-my-agents read confirms statusLabel=not listed and approvalLabel=Listing rejected. The updated five-service descriptions are saved, but resubmission did not complete. No claim of marketplace approval.


Superseding result: the actual OKX serviceGuide is now fixed and independently verified. The five-service listing was successfully resubmitted for review (submitApproval success=true, approvalStatus=2). See OKX_MANAGED_GUIDE_FIELD_REPAIR_20260910.md.
