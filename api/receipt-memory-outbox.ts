import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { memoryDatabaseQuery } from './render-durable-store.js'

type Row = Record<string, any>
export function memoryEnvelope(owner: string, receipt: Row) {
  owner = owner.toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(owner) || !/^pex_[a-f0-9]{24}$/.test(receipt.executionId)) throw new Error('Invalid memory identity')
  if (receipt.receiptVersion !== 'polydesk-governed-trade-receipt-v1' || receipt.status !== 'VERIFIED_FILLED'
      || receipt.policy?.decision !== 'APPROVE' || receipt.finality?.chainId !== 'eip155:137'
      || ['polygonReceiptVerified','polygonFinalityVerified','allowedExchangeVerified','orderIdInReceipt',
          'publicTradeMatched','buyerAuthoritySignatureVerified','exactSignedOrderVerified'].some(k => receipt.proofs?.[k] !== true)) {
    throw new Error('Unverified receipts cannot enter memory')
  }
  const policy = receipt.policy.researchPolicy
  if (!/^[1-9][0-9]{0,77}$/.test(receipt.market?.tokenId)
      || !['orderId','transactionHash'].every(k => /^0x[a-fA-F0-9]{64}$/.test(receipt.execution?.[k]))
      || !['blockHash','finalizedBlockHash'].every(k => /^0x[a-fA-F0-9]{64}$/.test(receipt.finality?.[k]))
      || !['fillSize','fillPrice','fillAmountUsdc'].every(k => typeof receipt.execution?.[k] === 'number'
          && Number.isFinite(receipt.execution[k]) && receipt.execution[k] > 0)
      || receipt.execution.fillPrice > 1 || !Number.isFinite(Date.parse(receipt.verifiedAt))) throw new Error('Invalid receipt projection')
  if (!['agent-independent-v1', 'zeroscout-approved-v1'].includes(policy)) throw new Error('Unknown research policy')
  if (policy === 'zeroscout-approved-v1' && (!/^pstd_[a-f0-9]{32}$/.test(receipt.policy.researchDecisionId)
      || !/^[a-f0-9]{64}$/.test(receipt.policy.researchAnalysisHash))) throw new Error('Missing research binding')
  const body = { schema: 'polydesk-receipt-memory-v1', owner, executionId: receipt.executionId,
    verifiedAt: receipt.verifiedAt, tokenId: receipt.market.tokenId,
    orderId: receipt.execution.orderId, transactionHash: receipt.execution.transactionHash,
    fillSize: receipt.execution.fillSize, fillPrice: receipt.execution.fillPrice,
    fillAmountUsdc: receipt.execution.fillAmountUsdc,
    chainId: receipt.finality.chainId, blockHash: receipt.finality.blockHash,
    finalizedBlockHash: receipt.finality.finalizedBlockHash,
    researchPolicy: policy,
    ...(policy === 'zeroscout-approved-v1' ? { researchDecisionId: receipt.policy.researchDecisionId,
      researchAnalysisHash: receipt.policy.researchAnalysisHash } : {}) }
  const payload = JSON.stringify(body)
  if (Buffer.byteLength(payload) > 16384) throw new Error('Memory envelope too large')
  return { owner, executionId: receipt.executionId as string, payload,
    payloadHash: createHash('sha256').update(payload).digest('hex') }
}

// Called only inside the execution-key transaction, after verified monotonic merge.
export async function enqueueReceiptMemory(client: Pick<PoolClient, 'query'>, owner: string, receipt: Row) {
  const event = memoryEnvelope(owner, receipt)
  const result = await client.query(`insert into polydesk_receipt_memory_outbox
    (execution_id,owner,payload,payload_hash) values ($1,$2,$3,$4)
    on conflict (execution_id) do update set execution_id=excluded.execution_id
      where polydesk_receipt_memory_outbox.owner=excluded.owner
        and polydesk_receipt_memory_outbox.payload_hash=excluded.payload_hash
        and polydesk_receipt_memory_outbox.payload=excluded.payload
    returning execution_id`, [event.executionId, event.owner, event.payload, event.payloadHash])
  if (result.rowCount !== 1) throw new Error('Conflicting receipt memory binding')
  await client.query(`insert into render_durable_kv(store_key,value,updated_at) values ($1,$2::jsonb,now())
    on conflict(store_key) do update set value=excluded.value,updated_at=now()`,
  [`polymarket-governed-receipt:${event.executionId}`, JSON.stringify(receipt)])
}

export type MemoryJob = { execution_id: string; owner: string; payload: string; payload_hash: string;
  lease_token: string; attempts: number }
type Query = typeof memoryDatabaseQuery
export async function runMemoryDeliveryOnce(deliver: (job: MemoryJob) => Promise<void>, query: Query = memoryDatabaseQuery) {
  const lease = randomUUID()
  const result = await query(`with candidate as (
    select execution_id from polydesk_receipt_memory_outbox
    where (state='pending' and next_at<=now()) or (state='delivering' and lease_until<now())
    order by next_at,execution_id for update skip locked limit 1
  ) update polydesk_receipt_memory_outbox j set state='delivering',attempts=j.attempts+1,
    lease_token=$1,lease_until=now()+interval '60 seconds'
    from candidate c where j.execution_id=c.execution_id returning j.*`, [lease])
  const job = result.rows[0] as MemoryJob | undefined
  if (!job) return false
  try {
    if (job.attempts > 8) throw new Error('Delivery attempts exhausted')
    await deliver(job)
    await query(`update polydesk_receipt_memory_outbox set state='delivered',lease_token=null,lease_until=null,error_code=null
      where execution_id=$1 and lease_token=$2 and state='delivering'`, [job.execution_id, lease])
  } catch {
    await query(`update polydesk_receipt_memory_outbox set state=case when attempts>=8 then 'failed' else 'pending' end,
      next_at=now()+interval '60 seconds',lease_token=null,lease_until=null,error_code='SIBYL_DELIVERY_UNAVAILABLE'
      where execution_id=$1 and lease_token=$2 and state='delivering'`, [job.execution_id, lease])
  }
  return true
}
