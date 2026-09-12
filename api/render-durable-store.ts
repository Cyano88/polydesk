import pg from 'pg'
import type { PoolClient } from 'pg'

const { Pool } = pg
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

let schemaReady: Promise<void> | null = null

function requirePool() {
  if (!pool) throw new Error('Render durable Postgres storage is not configured. Add DATABASE_URL on Render.')
  return pool
}

async function ensureSchema() {
  schemaReady ??= requirePool().query(`
    create table if not exists render_durable_kv (
      store_key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    );
  `).then(() => undefined)
  await schemaReady
}

let memorySchemaReady: Promise<void> | null = null
async function ensureMemorySchema() {
  await ensureSchema()
  memorySchemaReady ??= requirePool().query(`
    create table if not exists polydesk_receipt_memory_outbox (
      execution_id text primary key,
      owner text not null,
      payload text not null,
      payload_hash text not null,
      state text not null default 'pending' check (state in ('pending','delivering','delivered','failed')),
      attempts integer not null default 0,
      next_at timestamptz not null default now(),
      lease_token uuid,
      lease_until timestamptz,
      error_code text,
      created_at timestamptz not null default now()
    );
    create index if not exists polydesk_receipt_memory_owner_idx
      on polydesk_receipt_memory_outbox(owner, execution_id);
  `).then(() => undefined).catch(error => { memorySchemaReady = null; throw error })
  await memorySchemaReady
}

export function hasRenderDurableStore() {
  return Boolean(pool)
}

export async function readDurableJson<T>(key: string): Promise<T | undefined> {
  if (!pool) return undefined
  await ensureSchema()
  const result = await pool.query('select value from render_durable_kv where store_key = $1 limit 1', [key])
  return result.rows[0]?.value as T | undefined
}

export async function listDurableJsonByPrefix<T>(prefix: string, limit = 100): Promise<T[]> {
  if (!pool) return []
  await ensureSchema()
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)))
  const result = await pool.query(
    `select value from render_durable_kv
      where left(store_key, length($1)) = $1
      order by updated_at asc
      limit $2`,
    [prefix, boundedLimit],
  )
  return result.rows.map(row => row.value as T)
}

export async function writeDurableJson(key: string, value: unknown): Promise<void> {
  await ensureSchema()
  await requirePool().query(
    `insert into render_durable_kv (store_key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (store_key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

export async function mutateDurableJson<T>(key: string, mutate: (current: T | undefined) => T | Promise<T>,
  effects?: (next: T, client: PoolClient) => Promise<void>): Promise<T> {
  await ensureSchema()
  if (effects) await ensureMemorySchema()
  const client = await requirePool().connect()
  try {
    await client.query('begin')
    // Serialize mutations even before this key has a row. `FOR UPDATE` alone
    // cannot lock an absent row, so two first writers could otherwise both
    // read `undefined` and let the last commit overwrite the first.
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [key])
    const result = await client.query('select value from render_durable_kv where store_key = $1 for update', [key])
    const current = result.rows[0]?.value as T | undefined
    const next = await mutate(current)
    await client.query(
      `insert into render_durable_kv (store_key, value, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (store_key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(next)],
    )
    if (effects) await effects(next, client)
    await client.query('commit')
    return next
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function memoryDatabaseQuery(sql: string, values: unknown[] = []) {
  await ensureMemorySchema()
  return requirePool().query(sql, values)
}
/** Stable key pagination: completed rows cannot permanently hide newer work. */
export async function pageDurableJsonByPrefix<T>(prefix: string, after = '', limit = 100): Promise<Array<{key:string;value:T}>> {
  await ensureSchema()
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)))
  const result = await requirePool().query(
    `select store_key, value from render_durable_kv
     where left(store_key, length($1)) = $1 and store_key > $2
     order by store_key asc limit $3`, [prefix, after, boundedLimit],
  )
  return result.rows.map(row => ({key:row.store_key, value:row.value as T}))
}
