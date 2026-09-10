export const POLYDESK_ALIGNMENT_CHECKS = [
  { id: 'research-review', control: 'authorization', requirement: 'Show AI reasoning, evidence gaps and original results before review; accepting research does not authorize trading.' },
  { id: 'fee-inclusive-readiness', control: 'wallet', requirement: 'Verify owner-derived wallet, current fees and builder attribution, fee-inclusive BUY cap, SELL inventory and approvals before execution.' },
  { id: 'bounded-trade', control: 'authorization', requirement: 'Bind exact market, token, side, size, price, expiry and owner approval. Monitoring and memory reads grant no trading authority.' },
  { id: 'fresh-execution', control: 'execution', requirement: 'Recheck market identity, supported order type, order-book freshness, depth and price immediately before submission.' },
  { id: 'uncertain-recovery', control: 'recovery', requirement: 'Persist stable execution identity before submission; block duplicate or uncertain retries and verify exact order and finalized receipts before resolving.' },
  { id: 'settlement-receipts', control: 'receipts', requirement: 'Distinguish research settlement, trade settlement and memory synchronization; link exact order and transaction evidence without inventing missing history.' },
  { id: 'sibyl-owner-isolation', control: 'receipts', requirement: 'When Sibyl is integrated, require expiring owner-bound recall proofs, isolate owners, verify Postgres/Sibyl integrity and disclose partial history. Failed projection must never trigger a trade.' },
  { id: 'buyer-continuation', control: 'payment', requirement: 'Offer results before delivery acceptance, corrections for specific defects, settlement verification and a separate trade-or-more-analysis choice.' },
] as const
export type AlignmentCheckId = typeof POLYDESK_ALIGNMENT_CHECKS[number]['id']
