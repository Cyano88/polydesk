/**
 * 0G Storage — fire-and-forget archive layer for Hash PayLink payment records.
 *
 * Every confirmed payment in multi-payer collection mode is uploaded as a JSON
 * blob to 0G decentralized storage. The root hash (content address) is then
 * anchored on-chain via PayLinkArchive.sol deployed on 0G mainnet (chain 16661).
 *
 * This is intentionally non-blocking — if 0G upload fails the payment record
 * is still captured in the server registry. 0G is the permanent archive layer,
 * not the primary store.
 *
 * Required env vars:
 *   OG_STORAGE_KEY      Private key of wallet holding OG tokens for gas
 *   OG_ARCHIVE_ADDRESS  Deployed PayLinkArchive contract on 0G mainnet
 *   OG_RPC_URL          Preferred 0G EVM RPC endpoint
 *   OG_INDEXER_RPC_URL  Preferred 0G storage indexer endpoint
 */

import { ZgFile, Indexer }  from '@0gfoundation/0g-ts-sdk'
import { ethers }            from 'ethers'
import { writeFile, unlink } from 'fs/promises'
import { join }              from 'path'
import { tmpdir }            from 'os'
import { randomBytes }       from 'crypto'

const OG_UPLOAD_TIMEOUT_MS = 90_000
const OG_ANCHOR_TIMEOUT_MS = 90_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

// ─── 0G Mainnet config ────────────────────────────────────────────────────────
const EVM_RPC     = (process.env.OG_RPC_URL ?? process.env.OG_EVM_RPC_URL ?? process.env.ZG_RPC_URL ?? 'https://evmrpc.0g.ai').trim()
const INDEXER_RPC = (process.env.OG_INDEXER_RPC_URL ?? process.env.ZG_INDEXER_RPC_URL ?? 'https://indexer-storage-turbo.0g.ai').trim()

// ─── PayLinkArchive ABI (anchor rootHash on-chain) ────────────────────────────
const ARCHIVE_ABI = [
  'function archive(string calldata eventId, bytes32 rootHash, string calldata chain, string calldata payer, string calldata amount, uint256 ts) external',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSigner(): ethers.Wallet | null {
  const raw = process.env.OG_STORAGE_KEY ?? process.env.RELAYER_PRIVATE_KEY
  if (!raw) return null
  const key      = raw.startsWith('0x') ? raw : `0x${raw}`
  const provider = new ethers.JsonRpcProvider(EVM_RPC)
  return new ethers.Wallet(key, provider)
}

// ─── Main export ──────────────────────────────────────────────────────────────

export type ArchiveRecord = {
  eventId: string
  txHash:  string
  chain:   string
  payer:   string
  amount:  string
  ts:      number
  source?: string
  merchantId?: string
  contextLabel?: string
  settlementType?: string
  amountNgn?: string
  metadata?: Record<string, unknown>
}

export type ArchiveResult = {
  rootHash: string  // 0G Storage content address
  ogTxHash: string  // PayLinkArchive on-chain tx (chainscan.0g.ai/tx/...)
}

export type ArchiveFailure = {
  ok: false
  stage: 'config' | 'merkle' | 'upload' | 'anchor' | 'unexpected'
  error: string
  retryable: boolean
}

export type ArchiveOutcome = { ok: true; result: ArchiveResult } | ArchiveFailure

let archiveQueue: Promise<void> = Promise.resolve()

function errorText(value: unknown) {
  return value instanceof Error ? value.message : String(value ?? 'Unknown 0G archive error')
}

function isRetryableArchiveError(value: unknown) {
  return /timeout|timed out|network|fetch failed|replacement fee too low|nonce|underpriced|already known|temporar|rate|503|502|500/i.test(errorText(value))
}

function archiveFailure(stage: ArchiveFailure['stage'], error: unknown, retryable = isRetryableArchiveError(error)): ArchiveFailure {
  return {
    ok: false,
    stage,
    error: errorText(error).slice(0, 500),
    retryable,
  }
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function withArchiveQueue<T>(work: () => Promise<T>): Promise<T> {
  const previous = archiveQueue
  let release!: () => void
  archiveQueue = new Promise<void>(resolve => {
    release = resolve
  })
  await previous.catch(() => undefined)
  try {
    return await work()
  } finally {
    release()
  }
}

async function retryArchiveStep<T>(label: string, work: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work()
    } catch (error) {
      lastError = error
      if (!isRetryableArchiveError(error) || attempt === attempts - 1) break
      console.warn(`[0g] ${label} retry ${attempt + 1}/${attempts - 1}:`, errorText(error))
      await wait(1200 + attempt * 1800)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(errorText(lastError))
}

/**
 * Upload a payment record to 0G Storage and anchor the root hash on-chain.
 * Returns { rootHash, ogTxHash } on success, null on any failure.
 * Never throws — all errors are caught and logged.
 */
async function archivePaymentUnlocked(entry: ArchiveRecord): Promise<ArchiveOutcome> {
  const signer = getSigner()
  if (!signer) {
    console.warn('[0g] OG_STORAGE_KEY not set — skipping archive')
    return archiveFailure('config', 'OG_STORAGE_KEY not set', false)
  }

  const tmpPath = join(tmpdir(), `paylink-${randomBytes(8).toString('hex')}.json`)

  try {
    // 1. Write JSON to a temp file (ZgFile requires a file path in Node.js)
    const payload = { ...entry, archivedBy: 'Hash PayLink', version: '1' }
    await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8')

    // 2. Build merkle tree + upload to 0G Storage
    const file = await ZgFile.fromFilePath(tmpPath)
    const [tree, treeErr] = await file.merkleTree()
    if (treeErr || !tree) {
      console.error('[0g] merkle tree error:', treeErr)
      await file.close()
      return archiveFailure('merkle', treeErr || '0G merkle tree was not returned')
    }
    const rootHash = tree.rootHash() as string

    const indexer = new Indexer(INDEXER_RPC)
    const [, uploadErr] = await retryArchiveStep('upload', () => withTimeout(
      indexer.upload(file, EVM_RPC, signer as never),
      OG_UPLOAD_TIMEOUT_MS,
      '0G upload',
    ))
    await file.close()

    if (uploadErr) {
      console.error('[0g] upload error:', uploadErr)
      return archiveFailure('upload', uploadErr)
    }
    console.log(`[0g] uploaded payment record — rootHash: ${rootHash}`)

    // 3. Anchor root hash on-chain via PayLinkArchive contract
    const archiveAddr = process.env.OG_ARCHIVE_ADDRESS
    if (!archiveAddr || !ethers.isAddress(archiveAddr)) {
      console.warn('[0g] OG_ARCHIVE_ADDRESS not set — skipping on-chain anchor')
      return archiveFailure('config', 'OG_ARCHIVE_ADDRESS not set or invalid', false)
    }

    try {
      const contract = new ethers.Contract(archiveAddr, ARCHIVE_ABI, signer)
      const tx = await retryArchiveStep('anchor', () => withTimeout(
        contract.archive(
          entry.eventId,
          ethers.hexlify(ethers.toUtf8Bytes(rootHash).slice(0, 32)).padEnd(66, '0') as `0x${string}`,
          entry.chain,
          entry.payer,
          entry.amount,
          BigInt(entry.ts),
        ),
        OG_ANCHOR_TIMEOUT_MS,
        '0G archive transaction',
      ))
      await retryArchiveStep('anchor confirmation', () => withTimeout(tx.wait(), OG_ANCHOR_TIMEOUT_MS, '0G archive confirmation'))
      console.log(`[0g] anchored on-chain — tx: ${tx.hash}`)
      return { ok: true, result: { rootHash, ogTxHash: tx.hash as string } }
    } catch (anchorErr) {
      console.warn('[0g] on-chain anchor failed:', errorText(anchorErr))
      return archiveFailure('anchor', anchorErr)
    }
  } catch (err) {
    console.error('[0g] unexpected error:', errorText(err))
    return archiveFailure('unexpected', err)
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

export async function archivePaymentDetailed(entry: ArchiveRecord): Promise<ArchiveOutcome> {
  return withArchiveQueue(() => archivePaymentUnlocked(entry))
}

export async function archivePayment(entry: ArchiveRecord): Promise<ArchiveResult | null> {
  const outcome = await archivePaymentDetailed(entry)
  return outcome.ok ? outcome.result : null
}
