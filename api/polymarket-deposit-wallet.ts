import { getAddress, isAddress } from 'viem'

const POLYMARKET_RELAYER_URL = (process.env.POLYMARKET_RELAYER_URL ?? process.env.RELAYER_URL ?? '').trim()
const POLYMARKET_CHAIN_ID = Number(process.env.POLYMARKET_CHAIN_ID ?? 137)
const POLYMARKET_RPC_URL = (process.env.POLYMARKET_RPC_URL ?? process.env.POLYGON_RPC_URL ?? '').trim()
const POLYMARKET_BUILDER_API_KEY = (process.env.POLYMARKET_BUILDER_API_KEY ?? process.env.BUILDER_API_KEY ?? '').trim()
const POLYMARKET_BUILDER_SECRET = (process.env.POLYMARKET_BUILDER_SECRET ?? process.env.BUILDER_SECRET ?? '').trim()
const POLYMARKET_BUILDER_PASS_PHRASE = (
  process.env.POLYMARKET_BUILDER_PASS_PHRASE
  ?? process.env.POLYMARKET_BUILDER_PASSPHRASE
  ?? process.env.BUILDER_PASS_PHRASE
  ?? process.env.BUILDER_PASSPHRASE
  ?? ''
).trim()

function collectErrorText(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return [value.message, collectErrorText(value.cause, depth + 1)].filter(Boolean).join(' ')
  if (Array.isArray(value)) return value.map(item => collectErrorText(item, depth + 1)).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return ['message', 'error', 'details', 'cause', 'response', 'data']
      .map(key => collectErrorText(record[key], depth + 1))
      .filter(Boolean)
      .join(' ')
  }
  return String(value)
}

export function hasPolymarketRelayerConfig() {
  return Boolean(
    POLYMARKET_RELAYER_URL
    && POLYMARKET_CHAIN_ID === 137
    && POLYMARKET_BUILDER_API_KEY
    && POLYMARKET_BUILDER_SECRET
    && POLYMARKET_BUILDER_PASS_PHRASE,
  )
}

export async function createPolymarketDepositWalletClient(ownerAddress: string) {
  if (!isAddress(ownerAddress)) {
    const err = new Error('Provide a valid Polygon owner EOA.')
    ;(err as Error & { status?: number }).status = 400
    throw err
  }
  if (!hasPolymarketRelayerConfig()) {
    const err = new Error('Polymarket deposit wallet relayer is not configured.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  const [{ RelayClient }, { BuilderConfig }, { createWalletClient, http }, { polygon }] = await Promise.all([
    import('@polymarket/builder-relayer-client'),
    import('@polymarket/builder-signing-sdk'),
    import('viem'),
    import('viem/chains'),
  ])
  const walletClient = createWalletClient({
    account: { address: getAddress(ownerAddress), type: 'json-rpc' },
    chain: polygon,
    transport: http(POLYMARKET_RPC_URL || undefined),
  })
  const builderConfig = new BuilderConfig({
    localBuilderCreds: {
      key: POLYMARKET_BUILDER_API_KEY,
      secret: POLYMARKET_BUILDER_SECRET,
      passphrase: POLYMARKET_BUILDER_PASS_PHRASE,
    },
  })
  return new RelayClient(
    POLYMARKET_RELAYER_URL,
    POLYMARKET_CHAIN_ID,
    walletClient,
    builderConfig as never,
    undefined,
    { chain: polygon },
  )
}

export async function inspectPolymarketDepositWallet(ownerAddress: string) {
  const owner = getAddress(ownerAddress)
  const client = await createPolymarketDepositWalletClient(owner)
  const depositWalletAddress = getAddress(await client.deriveDepositWalletAddress())
  let deployed = false
  try {
    deployed = await client.getDeployed(depositWalletAddress, 'WALLET')
  } catch {
    deployed = false
  }
  return { ownerAddress: owner, depositWalletAddress, deployed }
}

export async function ensurePolymarketDepositWallet(ownerAddress: string) {
  const client = await createPolymarketDepositWalletClient(ownerAddress)
  const depositWalletAddress = getAddress(await client.deriveDepositWalletAddress())
  const readyWallet = () => ({
    depositWalletAddress,
    depositWalletStatus: 'ready',
    depositWalletTxId: null as string | null,
    depositWalletTxHash: null as string | null,
  })
  let deployed = false
  try {
    deployed = await client.getDeployed(depositWalletAddress, 'WALLET')
  } catch {
    deployed = false
  }
  if (deployed) return readyWallet()

  let response: Awaited<ReturnType<typeof client.deployDepositWallet>>
  try {
    response = await client.deployDepositWallet()
  } catch (error) {
    if (collectErrorText(error).toLowerCase().includes('wallet already deployed')) {
      try {
        deployed = await client.getDeployed(depositWalletAddress, 'WALLET')
      } catch {
        deployed = true
      }
      if (deployed) return readyWallet()
    }
    throw error
  }
  return {
    depositWalletAddress,
    depositWalletStatus: response.state || 'pending',
    depositWalletTxId: response.transactionID || null,
    depositWalletTxHash: response.transactionHash || null,
  }
}
