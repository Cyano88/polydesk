// Receipt finality is separate from transaction success and order matching.
type RecordValue = Record<string, unknown>
export type PolygonFinalityProof = {
  chainId: 'eip155:137'
  blockNumber: string
  blockHash: string
  finalizedBlockNumber: string
  finalizedBlockHash: string
}
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Missing Polygon block evidence.')
  return value as RecordValue
}
function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value) || value.length > 18) throw new Error('Invalid Polygon block quantity.')
  return BigInt(value)
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) throw new Error('Invalid Polygon block hash.')
  return value.toLowerCase()
}
export function verifyPolygonFinality(receipt: RecordValue, chainId: unknown, canonicalBlock: unknown, finalizedBlock: unknown): PolygonFinalityProof {
  if (quantity(chainId) !== 137n) throw new Error('Completion RPC is not Polygon mainnet.')
  const canonical = object(canonicalBlock)
  const finalized = object(finalizedBlock)
  const height = quantity(receipt.blockNumber)
  const finalHeight = quantity(finalized.number)
  const blockHash = hash(receipt.blockHash)
  if (quantity(canonical.number) !== height || hash(canonical.hash) !== blockHash) throw new Error('Receipt block is not canonical.')
  if (height > finalHeight) throw new Error('Receipt block is not finalized.')
  const finalizedHash = hash(finalized.hash)
  if (height === finalHeight && finalizedHash !== blockHash) throw new Error('Finalized block conflicts with receipt block.')
  // Prove the receipt transaction is in that canonical block, not merely a claimed height.
  const tx = hash(receipt.transactionHash)
  if (!Array.isArray(canonical.transactions) || !canonical.transactions.some(value => typeof value === 'string' && value.toLowerCase() === tx)) {
    throw new Error('Receipt transaction is absent from canonical block.')
  }
  return {
    chainId: 'eip155:137', blockNumber: '0x' + height.toString(16), blockHash,
    finalizedBlockNumber: '0x' + finalHeight.toString(16), finalizedBlockHash: finalizedHash,
  }
}
export async function fetchPolygonFinality(
  receipt: RecordValue,
  rpc: (method: string, params: unknown[]) => Promise<unknown>,
): Promise<PolygonFinalityProof> {
  const height = '0x' + quantity(receipt.blockNumber).toString(16)
  // Pin the finality watermark first, then verify the receipt's canonical block.
  const chainId = await rpc('eth_chainId', [])
  if (quantity(chainId) !== 137n) throw new Error('Completion RPC is not Polygon mainnet.')
  const finalized = await rpc('eth_getBlockByNumber', ['finalized', false])
  const canonical = await rpc('eth_getBlockByNumber', [height, false])
  return verifyPolygonFinality(receipt, chainId, canonical, finalized)
}
