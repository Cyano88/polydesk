# Environment Boundary

PolyDesk must not inherit all Hash PayLink secrets. Each environment variable must have a clear owner.

## PolyDesk-Owned Candidates

These likely belong in the new PolyDesk repo after API extraction:

```env
VITE_PRIVY_APP_ID=
VITE_PUBLIC_PAYLINK_ORIGIN=https://hashpaylink.com
HASH_PAYLINK_BASE_URL=https://hashpaylink.com

DATABASE_URL=

POLYMARKET_BUILDER_API_KEY=
POLYMARKET_BUILDER_SECRET=
POLYMARKET_BUILDER_PASSPHRASE=
POLYMARKET_BUILDER_PRIVATE_KEY=
POLYMARKET_BUILDER_FUNDER=
POLYMARKET_RELAYER_URL=

SPORTMONKS_API_KEY=
API_FOOTBALL_KEY=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
ZEROEX_API_KEY=
RESEND_API_KEY=
```

Rules:

- `POLYMARKET_*` secrets must be isolated from Hash PayLink core payment rails.
- AI keys may be separated further if LP Scout becomes an OKX.AI ASP service.
- Data provider keys should be scoped to PolyDesk only.
- `DATABASE_URL` should point to a PolyDesk database, not the Hash PayLink core database, after migration.

## Hash PayLink Core Secrets That Should Not Move

These should stay in Hash PayLink unless a later design explicitly requires a narrow proxy:

```env
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
PAYMASTER_PRIVATE_KEYS=
MAIN_PAYMENT_TREASURY_KEYS=
MONNIFY_*
PAYCREST_*
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
ZERO_G_STORAGE_KEYS=
CORE_RECEIPT_SIGNING_KEYS=
```

Rules:

- PolyDesk should not hold treasury keys.
- PolyDesk should not hold POS/bank payout keys.
- PolyDesk should not directly control generic Hash PayLink receipt/checkout infrastructure.
- If PolyDesk needs payment creation, it calls a Hash PayLink API with a scoped service token.

## Future Service Token

Create a narrowly scoped token for PolyDesk to request Hash PayLink funding checkouts:

```env
HASH_PAYLINK_POLYDESK_SERVICE_TOKEN=
```

Token permissions:

- Create Polymarket funding checkout.
- Query funding/bridge status.
- Post optional funding-complete notice.

Token must not permit:

- Generic payouts.
- POS/bank operations.
- Treasury movement.
- Admin receipt mutation.
