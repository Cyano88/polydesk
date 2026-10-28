# PolyDesk and VeilDesk integration

PolyDesk uses VeilDesk's server-side SDK. The skill and local MCP adapter remain
capability-discovery interfaces; they do not submit jobs.

## Authenticated preview API

- `POST /api/veildesk/previews`: submit a preview mandate; returns HTTP 202 and its ID.
- `GET /api/veildesk/previews/:id`: retrieve the caller's verified result or pending state.
- Send `Authorization: Bearer <Privy access token>` on both endpoints.
- Missing/invalid identity returns 401. Other users' results return 404; attempts
  to claim an already-owned ID return 409. Responses use `Cache-Control: no-store`.
- Retry submission with the exact same ID and contents after an uncertain response.
  Changed contents with the same ID are rejected. A 503 may mean transport is
  temporarily unavailable; it does not prove the request was never delivered.

The JSON mandate has exactly these fields:

```json
{
  "schema": "veildesk.mandate.v1",
  "id": "<new UUID>",
  "mode": "dry_run",
  "market": "market-slug",
  "side": "YES",
  "maxSpendUsd": "1.00",
  "limitPrice": "0.5",
  "expiresAt": 0,
  "approval": "preview_only"
}
```

Replace expiresAt with a future Unix timestamp in milliseconds within one hour.
The provider validates mandate structure and bounds. It does not verify the market,
produce research, accept payment or execute an order. All results retain
`executionAuthorized: false`.

## Privacy and ownership

This API accepts a plaintext mandate over HTTPS from an authenticated user.
PolyDesk can see it and encrypts it before sending it to the VeilDesk relay. The
provider can decrypt it. This is not browser-to-provider encryption or anonymity.
The SDK verifies the signed provider response against pinned keys and checks the
returned mandate against the submitted digest. PolyDesk returns decrypted results
only after verifying ownership. No request bodies, identities or results are logged
by this handler. Operators must not enable body logging upstream.

Owner hashes and the encrypted SDK outbox persist separately on PolyDesk's disk.
Reservations survive transport errors and prevent an ID from changing owners.
Keep state and keys across deployment and coordinate backups. Missing state must
not be reconstructed by accepting user-supplied ownership claims.

## Render configuration

- `VEILDESK_PREVIEW_ENABLED=true`
- `VEILDESK_CLIENT_CONFIG=/etc/secrets/veildesk-client.json`
- `VEILDESK_CLIENT_STATE=/var/sibyl/veildesk`
- Existing `PRIVY_APP_ID` and `PRIVY_APP_SECRET` authenticate callers.

PolyDesk's actual Render disk is mounted at `/var/sibyl`. The handler checks that
mount before opening SDK state on Render. A dedicated enrolled PolyDesk client
identity belongs in the secret file. It must not be embedded in a browser or Git.
`vendor/veildesk` contains the unmodified seven-module SDK import graph pinned to
commit `cff6dee5cff84f8381a074f87195cf8b7ca40565`, so a sibling checkout is unnecessary.

## Verification

`node --import tsx --test scripts/veildesk-preview.test.ts scripts/veildesk.test.ts`
tests HTTP authentication boundaries, cross-user denial, ownership persistence,
conflicting retries, safe errors and discovery. Set `VEILDESK_LIVE_CONFIG` to a
private enrolled client config to exercise the actual vendored SDK against Render.
That integration test injects test identities at the authentication boundary;
it does not establish successful sign-in with a real user's Privy token.

ZEC payment settlement, trading, marketplace listing, and a browser submission UI
are outside this endpoint's implemented scope.

Deployment verification on 2026-10-27: the HTTP boundary tests passed against the
live Render relay/provider with the dedicated `polydesk-app` identity, including
verified result contents, cross-user denial and exact replay. Authentication in
that test was injected; a real user sign-in remains a separate acceptance step.

## Full integration scope (28 October 2026)

PolyDesk is the service provider: a buyer agent requests research from PolyDesk.
PolyDesk owns retrieval, 0G inference and report generation. VeilDesk owns private
coordination, authenticated invoice binding, receipt verification and encrypted
delivery. Neither service purchase nor research authorizes a trade.

| Interface | Implemented scope | Access |
| --- | --- | --- |
| PolyDesk discovery / downloadable skill | Discovery and envelope structure validation | Public; no research or payment submission |
| PolyDesk preview HTTP API | Bounded unpaid mandates | Privy bearer, enabled API, ownership checks |
| PolyDesk `scripts/veildesk-mcp.ts` | `veildesk_capabilities` only | Local stdio |
| VeilDesk `scripts/mcp-server.mjs` | Capabilities, submit preview, get preview | Local stdio, enrolled preview client; paid capabilities refused |
| VeilDesk paid research SDK | Invoice, settlement verification, encrypted report retrieval | Restricted enrolled pilot buyer; private configuration and durable state |
| PolyDesk provider worker | Internal research adapter and delivery | Operator configuration; not a public purchase route |

The preview SDK pin above applies only to the vendored preview import graph.
The deployed paid provider runtime is separately pinned to
`2dd3c860cbcf6d93b9df5f30d952b3d2c962f58d`; this documentation change does not
upgrade it. `scripts/veildesk-render-worker.ts` launches the pinned runtime and
PolyDesk research adapter with durable `/var/data` state. The public PolyDesk
preview API uses its own `/var/sibyl` mount. Do not mix their identities or state.

### Paid research purchase contract

Use standalone VeilDesk `createPaidResearchClient({ config, stateDirectory })`,
not the vendored preview SDK. Operator enrollment authenticates/pins the provider
keys, buyer identity, relay and network, with an explicit payment ceiling. The
capability is `polydesk.research.mainnet-paid.v1`.

```json
{
  "id": "<new UUID>",
  "expiresAt": 0,
  "request": {
    "schema": "veildesk.service-request.v1",
    "service": "polydesk.market-research.v1",
    "input": {"marketId": "<market identifier>", "outcome": "<outcome>", "side": "BUY"},
    "disclosure": "polydesk-provider-disclosure-v2",
    "executionAuthorized": false
  }
}
```

Use exactly these fields and a future millisecond expiry within one hour. BUY or
SELL is the research perspective, not trading permission. Submit the purchase,
retrieve and authenticate its invoice, separately authorize any wallet action,
then retrieve and authenticate/decrypt the completed report. `submitPaymentHint`
provides an existing transaction reference; it does not broadcast a payment.
Wallet preparation/broadcast remain separately authorized operator operations.
Never publish enrollment secrets, payment memos, wallet keys or client state.

The provider adapter (`api/veildesk-research-service.mjs`) validates input and
requires the PolyDesk report schema, AVAILABLE research, and both
`orderAuthorized` and `orderSubmitted` false. PolyDesk's retrieval and 0G
configuration stays with PolyDesk. No independent compute attestation is claimed.

### Mainnet acceptance evidence

On 28 October 2026, one controlled mainnet service purchase completed: 0.0002 ZEC
service payment plus 0.0001 ZEC fee, four receipt confirmations, and an authenticated
11,784-byte research report. Repeated retrieval returned the identical report.
No trade was submitted. Wallet freshness checks delayed completion to approximately
23 minutes after broadcast. This is recorded operator acceptance evidence, not an
independent audit or a public cryptographic proof of a private transaction.

Wallet/indexer observations are trusted. Providers see authorized requests. IP
addresses and timing can remain visible; public market trades stay public.
The public demo's encryption lab runs both endpoints locally in the visitor's tab;
it does not invoke the paid service or make a payment.

- [Public demo](https://veildesk-relay.onrender.com/)
- [Raw video](https://veildesk-relay.onrender.com/demo.mp4)
- [Pilot record](https://github.com/Cyano88/veildesk/blob/main/docs/mainnet-research-pilot-2026-10-28.md)
- [Integrator/judge guide](https://github.com/Cyano88/veildesk/blob/main/docs/judge-guide.md)

VeilDesk is not yet listed on OKX AI. Broader enrollment, service adapters and
marketplace ZEC payment eligibility remain planned. Do not reuse unrelated
PolyDesk marketplace service IDs for this flow or claim infrastructure partnerships.
