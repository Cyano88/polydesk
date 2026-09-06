import { Interface, TypedDataEncoder, parseUnits } from 'ethers'

// Polymarket/ctf-exchange-v2: Hashing.sol and ITrading.sol.
export const EXCHANGES_V2 = ['0xe111180000d2663c0091e4f400237545b87b996b', '0xe2222d279d744050d28e00520010520000310f59'] as const
export const FILL_INTERFACE = new Interface([
  'event OrderFilled(bytes32 indexed orderHash,address indexed maker,address indexed taker,uint8 side,uint256 tokenId,uint256 makerAmountFilled,uint256 takerAmountFilled,uint256 fee,bytes32 builder,bytes32 metadata)',
])
const orderTypes = { Order: [
  ['salt', 'uint256'], ['maker', 'address'], ['signer', 'address'], ['tokenId', 'uint256'],
  ['makerAmount', 'uint256'], ['takerAmount', 'uint256'], ['side', 'uint8'], ['signatureType', 'uint8'],
  ['timestamp', 'uint256'], ['metadata', 'bytes32'], ['builder', 'bytes32'],
].map(([name, type]) => ({ name, type })) }

export function bindPolymarketOrder(order: Record<string, unknown>) {
  if (order.side !== 'BUY') throw new Error('Only BUY order proofs are supported.')
  return {
    version: 'ctf-v2-eip712' as const,
    hashes: Object.fromEntries(EXCHANGES_V2.map(exchange => [exchange, TypedDataEncoder.hash({
      name: 'Polymarket CTF Exchange', version: '2', chainId: 137, verifyingContract: exchange,
    }, orderTypes, { ...order, side: 0 }).toLowerCase()])),
    maker: String(order.maker).toLowerCase(), tokenId: String(order.tokenId),
    makerAmount: String(order.makerAmount), takerAmount: String(order.takerAmount),
    builder: String(order.builder).toLowerCase(), metadata: String(order.metadata).toLowerCase(),
  }
}
export type OrderProofBinding = ReturnType<typeof bindPolymarketOrder>

export function verifyOrderFillLogs(binding: OrderProofBinding, orderId: string, transactionHash: string,
  receipt: Record<string, unknown>, maximumPrice: string, maximumSpend: string) {
  if (String(receipt.transactionHash).toLowerCase() !== transactionHash || receipt.status !== '0x1') throw new Error('Transaction receipt identity or success status does not match.')
  if (!Array.isArray(receipt.logs)) throw new Error('Transaction receipt has no fill logs.')
  let spent = 0n
  let shares = 0n
  let exchange = ''
  const seen = new Set<string>()
  for (const raw of receipt.logs) {
    if (!raw || typeof raw !== 'object') continue
    const log = raw as Record<string, unknown>
    const address = String(log.address).toLowerCase()
    if (!EXCHANGES_V2.includes(address as typeof EXCHANGES_V2[number]) || binding.hashes[address] !== orderId) continue
    let parsed
    try { parsed = FILL_INTERFACE.parseLog({ topics: log.topics as string[], data: String(log.data) }) } catch { continue }
    if (!parsed || parsed.args.orderHash.toLowerCase() !== orderId) continue
    if (log.removed === true || (log.transactionHash && String(log.transactionHash).toLowerCase() !== transactionHash)) throw new Error('Fill log is removed or belongs to another transaction.')
    if (!/^0x[0-9a-f]+$/i.test(String(log.logIndex))) throw new Error('Fill log index is missing.')
    const index = BigInt(String(log.logIndex)).toString()
    if (seen.has(index)) throw new Error('Duplicate fill log index.')
    seen.add(index)
    const a = parsed.args
    if (a.maker.toLowerCase() !== binding.maker || a.side !== 0n || a.tokenId.toString() !== binding.tokenId
      || a.builder.toLowerCase() !== binding.builder || a.metadata.toLowerCase() !== binding.metadata) throw new Error('Fill log does not match the bound BUY order.')
    const cost: bigint = a.makerAmountFilled
    const size: bigint = a.takerAmountFilled
    if (cost <= 0n || size <= 0n || cost * BigInt(binding.takerAmount) > size * BigInt(binding.makerAmount)
      || cost * 1_000_000n > size * parseUnits(maximumPrice, 6)) throw new Error('Fill exceeds the signed order price bound.')
    spent += cost
    shares += size
    exchange = address
  }
  if (!exchange) throw new Error('No exact signed-order OrderFilled log from an allowlisted exchange matched.')
  if (spent > BigInt(binding.makerAmount) || spent > parseUnits(maximumSpend, 6)) throw new Error('Fill exceeds the signed order spend bound.')
  return { exchange, spent, shares }
}
