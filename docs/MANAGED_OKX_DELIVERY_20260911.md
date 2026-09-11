# Managed OKX delivery

The existing five-minute cron now runs subscription reconciliation followed by the scoped delivery bridge. It forwards stored portfolio alerts and scheduled summaries to each exact active managed subscription using the official `agent deliver` command. It does not generate trading recommendations, sign trades, change preferences or create subscriptions.

Incomplete enrollment produces a one-time setup request; unverified email produces a one-time verification request. These are explicitly setup notices, not portfolio analysis or trading signals. Paused, cancelled, expired or disabled monitoring produces no portfolio delivery. Buyers must complete onboarding before genuine monitoring results can exist. Previously chosen alert rules and digest timing remain authoritative.

`api/polydesk-managed-delivery.ts` renders timestamped stored monitoring events. The authenticated `delivery_items` action scopes rows by exact subscription and buyer, omits private email and source snapshot data, and only exposes events from the current period and last 24 hours. A backlog of 500 events fails rather than silently truncating. Longer historical recovery remains separate from recurring delivery.

`node --import tsx scripts/polydesk-managed-delivery.ts --once` previews. Adding `--deliver` sends. The program checks official readiness and exact active subscription directories; it rechecks identity and expiry immediately before each outbound call.

State is under /var/lib/polydesk-a2a/managed-delivery (or POLYDESK_MANAGED_DELIVERY_DIR). Exclusive per-job locks and fsynced pending records precede transport. Only explicit delivered=true or alreadyDelivered records success. Timeouts and unknown results retain the pending claim and block later sends for that job. Do not delete a pending record or crashed lock without checking the existing command and buyer-side receipt. Sent is transport acknowledgement, not independent buyer receipt.

Validation: targeted tests cover setup, privacy, paused/expired state, event freshness, explicit success, dry-run, persistent duplicate prevention, timeout retention, recheck-before-send, and payload binding. Integration and live acceptance are recorded separately in OKX_LISTING_REJECTION_AUDIT_20260911.md.

Enable scheduled transport only after preview review by creating /var/lib/polydesk-a2a/managed-delivery.enabled on the provider host. Removing that marker pauses scheduled sends without deleting any receipt or ledger.
