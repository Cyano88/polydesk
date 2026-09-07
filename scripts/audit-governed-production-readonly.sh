node --input-type=module <<'POLYDESK_READ_ONLY_AUDIT'
import { createRequire } from 'node:module';
const result = { readOnly: true, observedAt: new Date().toISOString() };
const rpcUrl = (process.env.POLYMARKET_RPC_URL || '').trim().slice(0, 400) || (process.env.POLYGON_RPC_URL || '').trim().slice(0, 400);
const dbUrl = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim();
result.rpc = { configured: Boolean(rpcUrl), verified: false };
result.database = { configured: Boolean(dbUrl), verified: false };
if (rpcUrl) {
  try {
    const rpc = async (method, params) => {
      const response = await fetch(rpcUrl, { method: 'POST', redirect: 'error',
        signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const body = await response.json();
      if (!response.ok || body.jsonrpc !== '2.0' || body.id !== 1 || body.error || !body.result) throw Error('RPC');
      return body.result;
    };
    const chain = await rpc('eth_chainId', []);
    if (chain !== '0x89') throw Error('Wrong chain');
    const finalized = await rpc('eth_getBlockByNumber', ['finalized', false]);
    if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(finalized.number) || !/^0x[0-9a-f]{64}$/i.test(finalized.hash)) throw Error('Invalid block');
    const canonical = await rpc('eth_getBlockByNumber', [finalized.number, false]);
    if (canonical.hash !== finalized.hash || canonical.number !== finalized.number || !Array.isArray(canonical.transactions)) throw Error('Noncanonical');
    let receiptMembershipVerified = false;
    if (canonical.transactions.length) {
      const tx = canonical.transactions[0];
      if (!/^0x[0-9a-f]{64}$/i.test(tx)) throw Error('Invalid transaction');
      const receipt = await rpc('eth_getTransactionReceipt', [tx]);
      if (receipt.transactionHash !== tx || receipt.blockHash !== canonical.hash || receipt.blockNumber !== canonical.number) throw Error('Receipt mismatch');
      receiptMembershipVerified = true;
    }
    result.rpc = { configured: true, verified: true, chainId: 137, finalizedTagSupported: true,
      canonicalBlockVerified: true, receiptMembershipVerified, finalizedBlockNumber: finalized.number };
  } catch { result.rpc.error = 'RPC_FINALITY_AUDIT_FAILED'; }
}
if (dbUrl) {
  let pool, client;
  try {
    const { Pool } = createRequire(process.cwd() + '/package.json')('pg');
    pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 10000,
      ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: true } });
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const table = await client.query("SELECT to_regclass('render_durable_kv') IS NOT NULL AS present");
    if (!table.rows[0].present) {
      result.database = { configured: true, verified: true, tablePresent: false };
    } else {
      const counts = await client.query(`WITH executions AS (
          SELECT value FROM render_durable_kv WHERE store_key LIKE 'polymarket-governed-execution:%'
        ), receipts AS (
          SELECT value AS doc FROM render_durable_kv WHERE store_key LIKE 'polymarket-governed-receipt:%'
          UNION ALL SELECT value->'receipt' FROM executions WHERE value->'receipt' IS NOT NULL AND value->'receipt' <> 'null'::jsonb
        ) SELECT count(*)::int AS "storedReceiptCopies",
          count(DISTINCT doc->>'executionId')::int AS "uniqueReceiptExecutions",
          count(*) FILTER (WHERE jsonb_typeof(doc) IS DISTINCT FROM 'object')::int AS "malformedReceiptCopies",
          count(*) FILTER (WHERE doc#>>'{proofs,polygonFinalityVerified}' IS DISTINCT FROM 'true'
            OR jsonb_typeof(doc->'finality') IS DISTINCT FROM 'object')::int AS "copiesMissingFinality",
          count(*) FILTER (WHERE doc#>>'{proofs,exactSignedOrderVerified}' IS DISTINCT FROM 'true')::int AS "copiesMissingExactProof",
          (SELECT count(*)::int FROM executions) AS "executionRecords",
          (SELECT count(*)::int FROM executions WHERE value#>>'{orderProof,version}' IS DISTINCT FROM 'ctf-v2-eip712') AS "executionsMissingOrderBinding"
        FROM receipts`);
      result.database = { configured: true, verified: true, tablePresent: true, ...counts.rows[0],
        classificationOnly: true, receiptsReverified: false };
    }
  } catch { result.database.error = 'READ_ONLY_RECEIPT_INVENTORY_FAILED'; }
  finally {
    if (client) { try { await client.query('ROLLBACK'); } catch {} client.release(); }
    if (pool) { try { await pool.end(); } catch {} }
  }
}
result.ok = result.rpc.verified && result.database.verified;
console.log(JSON.stringify(result));
POLYDESK_READ_ONLY_AUDIT
