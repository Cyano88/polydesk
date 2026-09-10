# Correction notification fix

## Problem and change

An explicitly requested correction reached provider 5427 and produced an addendum, but the provider ended with a local AI response because no official amendment/resubmission channel was verified for the submitted task. The buyer consequently saw neither the correction nor the blocker.

The provider instructions now distinguish an explanatory peer reply from an official amended deliverable. For authorized ordinary buyer correction chat, verify the task state and exact provider/buyer session, send the explanation or limitation in that conversation, preserve report identity and hashes, include the next prompt, and distinguish send acceptance from buyer receipt. System-event playbooks and delivery state gates remain binding. No second deliver call, task-attach bypass, delivery intent marker, automatic acceptance, payment or new research is authorized by this change.

The instructions also correct an evidence claim: an export failure does not prove the durable original JSON is absent. A reference-only Markdown correction is not a recovered original JSON report.

## Existing-task verification

Fresh status: task 0xab6d20e2900a838c0c843c7ab4da9254be7709abcae1a20968705447d46e6cb6 was submitted, buyer 5579, provider 5427, service budget 0.1 USDT. Exact provider-to-buyer session metadata matched before sending.

The prepared addendum file SHA-256 was verified as 13c20e3dfdb172e7a132149bbfe44d6009ae0a0ef1791882df8944ea2a849d0f. The full clarification was sent inline, labeled official amendment NOT PERFORMED and explicitly non-authorizing. It included original/addendum hashes and the Show corrected results follow-up.

A create-exclusive local notification ledger was written before sending. It records the outcome and exact message hash; an uncertain outcome must be reconciled rather than retried. This is an operator safeguard for this send, not a distributed exactly-once guarantee.

Transport result at 2026-09-10T17:02:06Z:
- ok true
- commandId beb58329-41fd-45aa-84ba-dc77bcfa573b
- messageId outbound-2eef31a7-9b44-4267-ad35-ae476c580fdd
- exact message SHA-256 09c48796cbe0e9263bc9a5a488d5fb7168d0e06ef392159d8e3cfd7231031997

Buyer-side receipt verification is recorded separately below when available. The official deliverable remains the original Markdown unless the platform's supported process changes it. No payment release, rejection, dispute, trade, or new research was performed by this notification fix.

## Validation scope

Reviewed the instruction diff against the observed failure and preserved formal task-state controls. This instruction-only change does not need a source-string test masquerading as workflow acceptance. The existing-task send and exact buyer-side message verification provide the relevant transport evidence. Autonomous compliance on later correction requests remains a separate acceptance check.
