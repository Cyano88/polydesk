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
