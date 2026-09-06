# Paid research delivery status

The payment status endpoint retains its v1 `status` lifecycle for existing clients.
`completed` means a decision receipt was stored, not that research succeeded or a
trade was approved. Read `deliveryStatus` and `researchStatus` as well:

- `deliveryStatus: degraded` with `researchStatus: UNAVAILABLE`: a provider-failure
  receipt was stored. Stop polling, retrieve the decision, and escalate to the user.
- `deliveryStatus: completed`: retrieve the decision and inspect its decision and
  evidence. This is not authorization to sign or trade.
- `running` or `settled`: continue bounded polling of the same payment status URL.
- `failed`: inspect the error and advertised recovery eligibility.

`additionalPaymentRequired: false` applies to delivery of this existing settlement.
Never start another payment to recover it. A degraded receipt does not currently
advertise automatic retry: existing proof-bearing decisions remain immutable and
need an explicit recovery workflow before they can be replaced.

Older responses may omit the new fields. Always retrieve the decision before
treating research as available or proceeding to a separately authorized preview.
