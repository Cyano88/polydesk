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
can be recovered only by the operator tool below.

## Operator recovery

After verifying provider readiness, run on the configured application server:

```sh
node --import tsx scripts/recover-degraded-research.ts <settlement-transaction> <payer> --execute
```

The tool accepts no replacement market or mandate. It verifies the stored request
hash and payer, requires an ESCALATE receipt with UNAVAILABLE research, preserves
the previous decision reference, and retains the six-attempt lifetime budget.
Concurrent calls are rejected while a fresh delivery is running. It creates no
new service payment and performs no trade; research and proof storage may consume
the service's existing provider resources. Poll the original settlement status
afterward. Do not rerun blindly after an interrupted command.

Older responses may omit the new fields. Always retrieve the decision before
treating research as available or proceeding to a separately authorized preview.
