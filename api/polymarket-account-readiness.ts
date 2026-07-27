import type { Request, Response } from 'express'
import { createPublicClient, formatUnits, getAddress, http, isAddress, parseUnits } from 'viem'
import { polygon } from 'viem/chains'
import { inspectPolymarketDepositWallet } from './polymarket-deposit-wallet.js'

const PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' as const
const PUSD_DECIMALS = 6
const SUPPORTED_ASSETS_URL = 'https://bridge.polymarket.com/supported-assets'
const REQUEST_TIMEOUT_MS = 12_000

const erc20BalanceAbi = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

type SourceNetwork = 'base' | 'arbitrum'
type JsonRecord = Record<string, unknown>

export type PolymarketAccountReadinessDependencies = {
  inspectWallet: typeof inspectPolymarketDepositWallet
  readPusdBalance: (wallet: `0x${string}`) => Promise<bigint>
  fetchSupportedAssets: () => Promise<unknown>
}

function clean(value: unknown, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseAmount(value: unknown, field: string) {
  const amount = clean(value, 32)
  if (!amount) return { ok: true as const, value: '0', raw: 0n }
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount)) {
    return { ok: false as const, status: 400, error: `${field} must be a non-negative amount with at most 6 decimals.` }
  }
  return { ok: true as const, value: amount, raw: parseUnits(amount, PUSD_DECIMALS) }
}

function sourceNetwork(value: unknown): SourceNetwork | null {
  const network = clean(value || 'base', 20).toLowerCase()
  return network === 'base' || network === 'arbitrum' ? network : null
}

function networkChainId(network: SourceNetwork) {
  return network === 'base' ? '8453' : '42161'
}

function supportedAssetQuote(value: unknown, network: SourceNetwork, symbol: string) {
  if (!isRecord(value) || !Array.isArray(value.supportedAssets)) return null
  const wantedSymbol = symbol.toUpperCase()
  const matches = value.supportedAssets.filter(isRecord).filter(item => {
    const token = isRecord(item.token) ? item.token : {}
    return clean(item.chainId, 32) === networkChainId(network)
      && clean(token.symbol, 24).toUpperCase() === wantedSymbol
  })
  if (matches.length !== 1) return null
  const item = matches[0]
  const token = isRecord(item.token) ? item.token : {}
  const minimum = clean(item.minCheckoutUsd, 32)
  if (!/^\d+(?:\.\d{1,6})?$/.test(minimum) || Number(minimum) <= 0) return null
  const address = clean(token.address, 64)
  if (!isAddress(address)) return null
  return {
    network,
    chainId: Number(networkChainId(network)),
    symbol: wantedSymbol,
    tokenAddress: getAddress(address),
    decimals: Number(token.decimals),
    minimumUsdc: minimum,
    minimumRaw: parseUnits(minimum, PUSD_DECIMALS),
  }
}

function polygonClient() {
  const rpcUrl = clean(process.env.POLYMARKET_RPC_URL || process.env.POLYGON_RPC_URL, 500)
  return createPublicClient({ chain: polygon, transport: http(rpcUrl || undefined) })
}

async function defaultReadPusdBalance(wallet: `0x${string}`) {
  return polygonClient().readContract({
    address: PUSD,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [wallet],
  })
}

async function defaultFetchSupportedAssets() {
  const response = await fetch(SUPPORTED_ASSETS_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Polymarket supported-assets HTTP ${response.status}`)
  return response.json()
}

const defaultDependencies: PolymarketAccountReadinessDependencies = {
  inspectWallet: inspectPolymarketDepositWallet,
  readPusdBalance: defaultReadPusdBalance,
  fetchSupportedAssets: defaultFetchSupportedAssets,
}

export async function checkPolymarketAccountReadiness(
  input: unknown,
  dependencies: PolymarketAccountReadinessDependencies = defaultDependencies,
) {
  if (!isRecord(input)) return { ok: false as const, status: 400, error: 'Readiness request must be a JSON object.' }
  const ownerAddress = clean(input.ownerAddress ?? input.owner ?? input.eoa, 64)
  const suppliedWallet = clean(input.polymarketWallet ?? input.wallet, 64)
  const network = sourceNetwork(input.sourceNetwork ?? input.network)
  const sourceToken = clean(input.sourceToken || 'USDC', 24).toUpperCase()
  const required = parseAmount(input.requiredBalanceUsdc ?? input.requiredUsdc ?? input.maxSpendUsdc, 'requiredBalanceUsdc')

  if (!isAddress(ownerAddress)) return { ok: false as const, status: 400, error: 'Provide the owner EOA that will sign Polymarket actions.' }
  if (suppliedWallet && !isAddress(suppliedWallet)) return { ok: false as const, status: 400, error: 'polymarketWallet must be a valid 0x address when supplied.' }
  if (!network) return { ok: false as const, status: 400, error: 'sourceNetwork must be base or arbitrum.' }
  if (!required.ok) return required
  if (sourceToken !== 'USDC') return { ok: false as const, status: 400, error: 'The hosted pilot currently accepts USDC funding only.' }

  let wallet: Awaited<ReturnType<typeof inspectPolymarketDepositWallet>>
  try {
    wallet = await dependencies.inspectWallet(ownerAddress)
  } catch (error) {
    const status = Number((error as Error & { status?: number })?.status) || 502
    return { ok: false as const, status, error: error instanceof Error ? error.message : 'Could not derive the Polymarket account wallet.' }
  }

  if (suppliedWallet && getAddress(suppliedWallet) !== wallet.depositWalletAddress) {
    return {
      ok: false as const,
      status: 409,
      error: 'The supplied wallet is not the Polymarket Deposit Wallet derived from this owner EOA.',
      ownerAddress: wallet.ownerAddress,
      derivedDepositWallet: wallet.depositWalletAddress,
    }
  }

  let balanceRaw = 0n
  try {
    balanceRaw = wallet.deployed
      ? await dependencies.readPusdBalance(wallet.depositWalletAddress as `0x${string}`)
      : 0n
  } catch (error) {
    return { ok: false as const, status: 502, error: `Could not read the derived wallet pUSD balance: ${error instanceof Error ? error.message : 'unknown error'}` }
  }

  const fundingNeededRaw = required.raw > balanceRaw ? required.raw - balanceRaw : 0n
  let quote: ReturnType<typeof supportedAssetQuote> = null
  let quoteError = ''
  try {
    quote = supportedAssetQuote(await dependencies.fetchSupportedAssets(), network, sourceToken)
    if (!quote) quoteError = `Polymarket did not advertise one verified ${sourceToken} route on ${network}.`
  } catch (error) {
    quoteError = error instanceof Error ? error.message : 'Could not load supported bridge assets.'
  }

  const suggestedRaw = quote && fundingNeededRaw > 0n
    ? (fundingNeededRaw > quote.minimumRaw ? fundingNeededRaw : quote.minimumRaw)
    : 0n
  const state = !wallet.deployed
    ? 'activation_required'
    : fundingNeededRaw > 0n
      ? (quote ? 'funding_required' : 'funding_route_unavailable')
      : 'ready_to_buy'

  return {
    ok: true as const,
    status: 200,
    data: {
      ok: true,
      state,
      owner: {
        address: wallet.ownerAddress,
        role: 'signer',
      },
      polymarketAccount: {
        wallet: wallet.depositWalletAddress,
        walletType: 'DEPOSIT_WALLET',
        signatureType: 3,
        derivedFromOwner: true,
        deployedOnPolygon: wallet.deployed,
        collateral: {
          symbol: 'pUSD',
          tokenAddress: PUSD,
          decimals: PUSD_DECIMALS,
          balance: formatUnits(balanceRaw, PUSD_DECIMALS),
          required: required.value,
          shortfall: formatUnits(fundingNeededRaw, PUSD_DECIMALS),
        },
      },
      funding: {
        needed: fundingNeededRaw > 0n,
        sourceNetwork: network,
        sourceToken,
        supportedAssetVerified: Boolean(quote),
        minimumUsdc: quote?.minimumUsdc ?? null,
        suggestedAmountUsdc: quote ? formatUnits(suggestedRaw, PUSD_DECIMALS) : null,
        sourceTokenAddress: quote?.tokenAddress ?? null,
        ...(quoteError ? { issue: quoteError } : {}),
      },
      nextAction: state === 'activation_required'
        ? 'SETUP_DEPOSIT_WALLET'
        : state === 'funding_required'
          ? 'CREATE_FUNDING_CHECKOUT'
          : state === 'ready_to_buy'
            ? 'PREPARE_BUY'
            : 'RETRY_READINESS',
      safety: [
        'Never fund the owner EOA for Deposit Wallet orders.',
        'Create a checkout only for the derived, deployed Polymarket Deposit Wallet.',
        'Treat funding as complete only after bridge completion and a refreshed pUSD balance.',
      ],
    },
  }
}

export default async function polymarketAccountReadinessHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }
  const result = await checkPolymarketAccountReadiness(req.body)
  if (!result.ok) {
    const { status, ...body } = result
    return res.status(status).json(body)
  }
  return res.status(result.status).json(result.data)
}
