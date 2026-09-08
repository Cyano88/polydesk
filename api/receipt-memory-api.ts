import type { Request, Response } from 'express'
import { verifyMessage } from 'ethers'
import { createHash } from 'node:crypto'
import { memoryDatabaseQuery } from './render-durable-store.js'
import { recallFromSibyl } from './receipt-memory-worker.js'
import { isDeepStrictEqual } from 'node:util'

export function memoryRecallAuthorization(body: Record<string, unknown>, now = Date.now(), sibyl = false) {
  const { owner, expiresAt, after = '', limit = 20 } = body
  if (typeof owner !== 'string' || !/^0x[a-f0-9]{40}$/.test(owner)
      || typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 300000
      || typeof after !== 'string' || (after !== '' && !/^pex_[a-f0-9]{24}$/.test(after))
      || typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100
      || Object.keys(body).some(k => !['owner','expiresAt','after','limit','signature'].includes(k))) throw new Error('Invalid recall authorization')
  const message = [sibyl ? 'PolyDesk Sibyl memory read v1' : 'PolyDesk receipt memory read v1','https://polydesk.trade',
    'POST /api/polymarket-agent-memory/' + (sibyl ? 'recall-sibyl' : 'recall'),owner,String(expiresAt),after,String(limit)].join('\n')
  return { owner, expiresAt, after, limit, message }
}

export function createReceiptMemoryRecallHandler(query = memoryDatabaseQuery, sibylRecall?: typeof recallFromSibyl) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    let auth: ReturnType<typeof memoryRecallAuthorization>
    try {
      auth = memoryRecallAuthorization(req.body ?? {}, Date.now(), Boolean(sibylRecall))
      if (typeof req.body.signature !== 'string' || !/^0x[a-fA-F0-9]{130}$/.test(req.body.signature)
          || verifyMessage(auth.message, req.body.signature).toLowerCase() !== auth.owner) throw new Error('Owner mismatch')
    } catch { return res.status(401).json({ ok: false, state: 'OWNER_AUTHENTICATION_REQUIRED', signingAuthorized: false }) }
    try {
      const result = await query(`select execution_id,payload,payload_hash,state from polydesk_receipt_memory_outbox
        where owner=$1 and execution_id>$2 order by execution_id limit $3`, [auth.owner, auth.after, auth.limit + 1])
      const page = result.rows.slice(0, auth.limit)
      for (const row of page) {
        const body = JSON.parse(row.payload)
        if (body.owner !== auth.owner || body.executionId !== row.execution_id
            || createHash('sha256').update(row.payload).digest('hex') !== row.payload_hash) throw new Error('Stored memory mismatch')
      }
      if (sibylRecall) {
        if (page.some(row => row.state !== 'delivered')) throw new Error('Memory synchronization incomplete')
        const recalled = await sibylRecall(auth.owner, page)
        if (recalled.length !== page.length || recalled.some((receipt, i) =>
          !isDeepStrictEqual(receipt, JSON.parse(page[i].payload)))) throw new Error('Memory recall mismatch')
        return res.status(200).json({ ok: true, schema: 'polydesk-sibyl-memory-recall-v1',
          source: 'SIBYL_VERIFIED_RECEIPTS', coverage: 'OUTBOX_SINCE_ENABLEMENT', historyComplete: false,
          records: recalled.map(receipt => ({receipt, memoryStatus: 'RECALLED_VERIFIED'})),
          nextCursor: result.rows.length > auth.limit ? page.at(-1)?.execution_id : null,
          signingAuthorized: false, orderSubmitted: false })
      }
      return res.status(200).json({ ok: true, schema: 'polydesk-receipt-memory-recall-v1',
        source: 'POSTGRES_VERIFIED_RECEIPTS', coverage: 'OUTBOX_SINCE_ENABLEMENT', historyComplete: false,
        records: page.map(row => ({ receipt: JSON.parse(row.payload), memoryStatus: row.state === 'delivered' ? 'SYNCHRONIZED'
          : row.state === 'failed' ? 'OPERATOR_REVIEW_REQUIRED' : 'PENDING' })),
        nextCursor: result.rows.length > auth.limit ? page.at(-1)?.execution_id : null,
        signingAuthorized: false, orderSubmitted: false })
    } catch { return res.status(503).json({ ok: false, state: 'MEMORY_UNAVAILABLE', historyComplete: false,
      nextAction: 'NOTIFY_PLATFORM_OPERATOR', signingAuthorized: false }) }
  }
}

export function createSibylMemoryRecallHandler() {
  return createReceiptMemoryRecallHandler(memoryDatabaseQuery, recallFromSibyl)
}
