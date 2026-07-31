import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'

export const OKX_REWARD_CHAIN_ID = 196
export const OKX_REWARD_NETWORK = 'eip155:196'
export const OKX_REWARD_USDT0 = '0x779ded0c9e1022225f8e0630b35a9b54be713736' as Address
export const OKX_REWARD_INSTANT_ATOMIC = 1_000_000n

const transferEvent = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

const xLayer = defineChain({
  id: OKX_REWARD_CHAIN_ID,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'OKX X Layer Explorer',
      url: 'https://www.okx.com/web3/explorer/xlayer',
    },
  },
})

type RewardPayoutVerificationInput = {
  transactionHash: Hex
  payoutAddress: Address
  recipient: Address
  amountAtomic?: bigint
  minimumConfirmations?: number
  notBefore?: Date
}

type RewardPayoutClient = Pick<
  PublicClient,
  'getChainId' | 'getTransaction' | 'getTransactionReceipt' | 'getBlockNumber' | 'getBlock'
>

function sameAddress(left: string | null | undefined, right: string) {
  return String(left ?? '').toLowerCase() === right.toLowerCase()
}

export async function verifyOkxRewardPayout(
  input: RewardPayoutVerificationInput,
  client: RewardPayoutClient = createPublicClient({
    chain: xLayer,
    transport: http(process.env.POLYDESK_OKX_REWARDS_XLAYER_RPC_URL?.trim() || undefined),
  }),
) {
  const minimumConfirmations = Math.max(3, Math.min(20, input.minimumConfirmations ?? 3))
  const amountAtomic = input.amountAtomic ?? OKX_REWARD_INSTANT_ATOMIC
  const [chainId, transaction, receipt, latestBlock] = await Promise.all([
    client.getChainId(),
    client.getTransaction({ hash: input.transactionHash }),
    client.getTransactionReceipt({ hash: input.transactionHash }),
    client.getBlockNumber(),
  ])

  if (chainId !== OKX_REWARD_CHAIN_ID) throw new Error('Payout transaction was not read from X Layer mainnet.')
  if (receipt.status !== 'success') throw new Error('Payout transaction did not succeed.')
  if (!sameAddress(transaction.from, input.payoutAddress) || !sameAddress(receipt.from, input.payoutAddress)) {
    throw new Error('Payout transaction was not sent by the configured campaign wallet.')
  }
  if (!sameAddress(transaction.to, OKX_REWARD_USDT0) || !sameAddress(receipt.to, OKX_REWARD_USDT0)) {
    throw new Error('Payout transaction did not call the approved USDT0 contract.')
  }
  if (transaction.value !== 0n) throw new Error('Payout transaction must not transfer native currency.')

  const confirmations = latestBlock >= receipt.blockNumber
    ? Number(latestBlock - receipt.blockNumber + 1n)
    : 0
  if (confirmations < minimumConfirmations) {
    throw new Error(`Payout transaction has ${confirmations} confirmation(s); ${minimumConfirmations} required.`)
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber })
  const blockTime = new Date(Number(block.timestamp) * 1000)
  if (input.notBefore) {
    if (Number.isNaN(input.notBefore.getTime())) throw new Error('Payout lease start time is invalid.')
    if (blockTime < input.notBefore) throw new Error('Payout transaction predates the approved payout lease.')
  }

  const transfers = receipt.logs
    .filter(log => sameAddress(log.address, OKX_REWARD_USDT0))
    .flatMap(log => {
      try {
        const decoded = decodeEventLog({
          abi: [transferEvent],
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName !== 'Transfer') return []
        return [decoded.args]
      } catch {
        return []
      }
    })

  if (transfers.length !== 1) {
    throw new Error('Payout transaction must contain exactly one USDT0 Transfer event.')
  }
  const [transfer] = transfers
  if (
    !sameAddress(transfer.from, input.payoutAddress)
    || !sameAddress(transfer.to, input.recipient)
    || transfer.value !== amountAtomic
  ) {
    throw new Error('USDT0 transfer does not exactly match the approved reward payout.')
  }

  return {
    ok: true as const,
    chainId,
    transactionHash: input.transactionHash.toLowerCase() as Hex,
    blockNumber: receipt.blockNumber.toString(),
    blockTime: blockTime.toISOString(),
    confirmations,
    from: input.payoutAddress.toLowerCase() as Address,
    to: input.recipient.toLowerCase() as Address,
    asset: OKX_REWARD_USDT0,
    amountAtomic: amountAtomic.toString(),
  }
}
