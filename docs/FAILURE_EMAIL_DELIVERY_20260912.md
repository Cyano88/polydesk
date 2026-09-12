# Operator failure email delivery

The existing Resend transport now sends OPEN research-delivery incidents to the operator destination configured in Render. Recipient addresses are kept out of the public repository. Enable with POLYDESK_FAILURE_ALERT_EMAIL_ENABLED=true and POLYDESK_FAILURE_ALERT_TO_EMAIL; the existing RESEND_API_KEY and POLYMARKET_ALERT_FROM_EMAIL supply delivery credentials and sender.

The monitor records a durable notification per incident episode, version and recipient. Concurrent scans and restarts reuse that record. Up to three attempts, separated by five minutes, use an identical saved payload and idempotency key. Retries stop before Resend's 24-hour idempotency expiry; uncertain or exhausted delivery requires operator review. Resolved and acknowledged incidents do not send. Existing OPEN incidents receive an initial alert when the feature is enabled.

Messages contain incident reference, failure reason, opening time and an explicit review follow-up prompt. They omit buyer addresses, settlement transaction, report content and credentials. Sending an alert never authorizes research, payment, refund, acceptance or trade.

The authenticated operator incident response exposes emailNotification.state, attempts and acceptedAt. PROVIDER_ACCEPTED confirms provider acceptance, not inbox delivery. Email-provider outages are retained as RETRY_PENDING or REVIEW_REQUIRED. If the app or database is unavailable, this in-process notifier cannot send: an independent uptime monitor remains separate.

Validation: 11 isolated notification and monitor tests passed, plus server type-check. No real email is sent by tests.

References: [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Render environment-variable API](https://api-docs.render.com/reference/update-env-var).
