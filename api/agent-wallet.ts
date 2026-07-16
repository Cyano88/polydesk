import type { Request, Response } from 'express'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import { createPublicClient, defineChain, formatUnits, http } from 'viem'
import { appendAgentActivity, listAgentActivity } from './agent-activity.js'
import { setAgentProfileWallet } from './agent-profile.js'
import { getAgentGovernanceProfile, getAgentLegalProfile } from './agent-legal.js'
import { generateZeroScoutPolymarketBrief } from './zeroscout-polymarket-brief.js'

const execFileAsync = promisify(execFile)
const CIRCLE_BIN = process.platform === 'win32' ? 'circle.cmd' : 'circle'
const DATA_PATH = process.env.DATA_PATH?.trim()
const STORE_PATH = process.env.AGENT_WALLET_PROVISION_STORE
  ?? (DATA_PATH ? `${DATA_PATH}/agent-wallet-provisioning.json` : './data/agent-wallet-provisioning.json')
const CIRCLE_SESSION_ROOT = process.env.AGENT_WALLET_CIRCLE_SESSION_PATH
  ?? (DATA_PATH ? `${DATA_PATH}/circle-web-sessions` : './data/circle-web-sessions')
const CIRCLE_CLI_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.CIRCLE_CLI_ENABLED ?? '').toLowerCase())
const SERVICE_SECRET = process.env.AGENT_WALLET_SERVICE_SECRET
const DEFAULT_AGENT_SLUG = normalizeSlug(process.env.DEFAULT_AGENT_SLUG || 'polydesk-agent')
const DEFAULT_AGENT_WALLET_ADDRESS = normalizeExpectedWallet(process.env.DEFAULT_AGENT_WALLET_ADDRESS)
const DEFAULT_AGENT_WALLET_CHAIN = normalizeBalanceChain(process.env.DEFAULT_AGENT_WALLET_CHAIN ?? process.env.DEFAULT_AGENT_CHAIN, 'ARC-TESTNET')
const DEFAULT_SCOUT_ORIGIN = (process.env.POLYDESK_BASE_URL ?? process.env.PUBLIC_POLYDESK_ORIGIN ?? 'https://polydesk-i96m.onrender.com').replace(/\/+$/, '')
const DEFAULT_SCOUT_URL = `${DEFAULT_SCOUT_ORIGIN}/api/x402/polymarket-scout`
const ALLOWED_SERVICE_URLS = new Set(
  (process.env.AGENT_WALLET_ALLOWED_SERVICE_URLS ?? process.env.X402_POLYMARKET_SCOUT_URL ?? DEFAULT_SCOUT_URL)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean),
)

function publicErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown ZeroScout error')
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key[=:]\s*[A-Za-z0-9._~+/=-]+/gi, 'api_key=[redacted]')
    .slice(0, 240)
}

function isTransientZeroScoutError(err: unknown) {
  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : 0
  const message = err instanceof Error ? err.message : String(err ?? '')
  return (
    !status
    || status === 408
    || status === 429
    || status >= 500
    || /abort|aborted|timeout|timed out|network|fetch failed|upstream|replacement fee too low|nonce too low|already known|underpriced|0G upload error/i.test(message)
  )
}
const MAX_SERVICE_AMOUNT = Number(process.env.AGENT_WALLET_MAX_SERVICE_AMOUNT ?? process.env.X402_POLYMARKET_SCOUT_MAX_AMOUNT ?? '0.01')
const MAX_GATEWAY_DEPOSIT_AMOUNT = Number(process.env.AGENT_WALLET_MAX_GATEWAY_DEPOSIT_AMOUNT ?? '5')
const GATEWAY_BALANCE_CHAIN = process.env.AGENT_WALLET_GATEWAY_BALANCE_CHAIN ?? 'ARC-TESTNET'
const ARC_TESTNET_GATEWAY_CHAIN = 'ARC-TESTNET'
const GATEWAY_DEPOSIT_VERIFY_ATTEMPTS = Math.max(1, Number(process.env.AGENT_WALLET_GATEWAY_DEPOSIT_VERIFY_ATTEMPTS ?? '6') || 6)
const GATEWAY_DEPOSIT_VERIFY_DELAY_MS = Math.max(500, Number(process.env.AGENT_WALLET_GATEWAY_DEPOSIT_VERIFY_DELAY_MS ?? '5000') || 5000)

const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
  testnet: true,
})

const USDC_BALANCE_ABI = [{
  name: 'balanceOf',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

const USDC_CHAIN_CONFIG = {
  'ARC-TESTNET': {
    chain: ARC_TESTNET,
    token: '0x3600000000000000000000000000000000000000',
    rpcEnv: 'PRIVATE_RPC_URL_ARC',
    fallbackRpc: 'https://rpc.testnet.arc.network',
  },
} as const

function delay(ms: number) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms))
}

type PendingSession = {
  agentSlug: string
  emailHash: string
  requestId?: string
  expectedWallet?: string
  testnet: boolean
  createdAt: number
}

type AgentWalletRecord = {
  walletAddress: string
  chain: string
  emailHash?: string
  sessionId?: string
  updatedAt: number
  source?: 'env' | 'store'
}

type StoreData = {
  pending: Record<string, PendingSession>
  agents?: Record<string, AgentWalletRecord>
  activity?: Record<string, unknown[]>
}

type X402ServiceResponse = {
  service?: string
  payment?: {
    payer?: string
    amount?: string
    network?: string
    transaction?: string
  }
  receipt?: {
    provider?: string
    price?: string
    seller?: string
    generatedAt?: string
  }
  scout?: Record<string, unknown>
}

export async function payAgentX402Service(params: {
  agentSlug: string
  sellerAgentSlug: string
  serviceUrl: string
  maxAmount: number
  paymentChain?: string
  spendTitle?: string
  spendDetail?: string
  resultTitle?: string
  resultDetail?: string
  sellerTitle?: string
  sellerDetail?: string
  result?: Record<string, unknown>
  appendResultActivity?: boolean
}) {
  if (!CIRCLE_CLI_ENABLED) {
    const error = new Error('Circle Agent Wallet payments are not enabled on this server.') as Error & { status?: number }
    error.status = 503
    throw error
  }
  const store = await readStore()
  const record = resolveAgentRecord(store, params.agentSlug)
  if (!record?.walletAddress || !record.sessionId) {
    const error = new Error('Pocket Wallet needs a fresh Arc sign-in before this x402 payment can continue.') as Error & { status?: number; code?: string }
    error.status = 404
    error.code = 'circle_session_missing'
    throw error
  }

  const serviceKey = `${params.agentSlug}_${record.sessionId}`
  let output = ''
  try {
    output = await runCircle([
      'services',
      'pay',
      params.serviceUrl,
      '--address',
      record.walletAddress,
      '--chain',
      params.paymentChain ?? ARC_TESTNET_GATEWAY_CHAIN,
      '--max-amount',
      String(params.maxAmount),
    ], serviceKey)
  } catch (err) {
    if (isCircleLoginExpired(err)) {
      const error = new Error('Circle Agent Wallet is connected, but the secure spending session expired. Reconnect the wallet on the agent dashboard, then retry.') as Error & { status?: number; code?: string }
      error.status = 409
      error.code = 'circle_session_expired'
      throw error
    }
    throw err
  }

  const parsedResponse = extractJsonFromCliOutput(output) as X402ServiceResponse | undefined
  const proof = buildX402Proof({
    response: parsedResponse,
    buyerAgent: params.agentSlug,
    sellerAgent: params.sellerAgentSlug,
    buyerWallet: record.walletAddress,
    serviceUrl: params.serviceUrl,
    maxAmount: String(params.maxAmount),
    circleOutput: output,
  })
  const spendActivity = await appendAgentActivity({
    agentSlug: params.agentSlug,
    type: 'x402_spent',
    title: params.spendTitle ?? 'Bought LP Scout API',
    amount: String(params.maxAmount),
    asset: 'USDC',
    direction: 'out',
    network: 'Circle Gateway x402',
    wallet: record.walletAddress,
    serviceUrl: params.serviceUrl,
    detail: params.spendDetail ?? 'Agent paid a machine-to-machine service',
    proof,
  })
  const resultActivity = params.appendResultActivity !== false
    ? await appendAgentActivity({
      agentSlug: params.agentSlug,
      type: 'scout_returned',
      title: params.resultTitle ?? 'Live Polymarket scout returned',
      direction: 'result',
      network: params.resultTitle ? 'Circle Gateway x402' : 'Polymarket CLOB',
      wallet: record.walletAddress,
      serviceUrl: params.serviceUrl,
      detail: params.resultDetail ?? (typeof parsedResponse?.scout?.summary === 'string'
        ? parsedResponse.scout.summary
        : 'API returned one conservative LP candidate'),
      result: params.result ?? parsedResponse?.scout,
    })
    : undefined
  if (params.sellerAgentSlug && params.sellerAgentSlug !== params.agentSlug) {
    await appendAgentActivity({
      agentSlug: params.sellerAgentSlug,
      type: 'x402_sold',
      title: params.sellerTitle ?? 'Sold LP Scout API',
      amount: String(params.maxAmount),
      asset: 'USDC',
      direction: 'in',
      network: 'Circle Gateway x402',
      wallet: parsedResponse?.receipt?.seller ?? '',
      serviceUrl: params.serviceUrl,
      detail: params.sellerDetail ?? `${params.agentSlug} bought live Polymarket scout data`,
      proof,
    })
  }

  return {
    walletAddress: record.walletAddress,
    response: parsedResponse,
    receiptActivityId: spendActivity?.id,
    resultActivityId: resultActivity?.id,
    proof,
    raw: output.slice(0, 3000),
  }
}

export async function getAgentWalletRecord(agentSlug: string) {
  const store = await readStore()
  const record = resolveAgentRecord(store, agentSlug)
  if (!record?.walletAddress) return undefined
  return {
    walletAddress: record.walletAddress,
    chain: record.chain,
    sessionId: record.sessionId,
    updatedAt: record.updatedAt,
    source: record.source,
  }
}

function withServiceParams(serviceUrl: string, params: Record<string, string | undefined>) {
  const base = process.env.POLYDESK_BASE_URL ?? process.env.PUBLIC_POLYDESK_ORIGIN ?? DEFAULT_SCOUT_ORIGIN
  const url = new URL(serviceUrl, base)
  for (const [key, value] of Object.entries(params)) {
    const clean = String(value ?? '').trim()
    if (clean) url.searchParams.set(key, clean.slice(0, 240))
  }
  return url.toString()
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function normalizeSlug(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

function safeSessionKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function emailHash(email: string) {
  return crypto.createHash('sha256').update(email).digest('hex')
}

function sessionId(agentSlug: string, email: string) {
  return crypto.createHash('sha256').update(`${agentSlug}:${email}`).digest('hex').slice(0, 32)
}

function cleanAmount(value: unknown) {
  const amount = Number(String(value ?? '').trim())
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

function clampAmount(value: unknown, max: number) {
  const amount = cleanAmount(value)
  if (!amount || !Number.isFinite(max) || max <= 0) return undefined
  return Math.min(amount, max)
}

function normalizeBalanceChain(value: unknown) {
  const key = String(value ?? '').trim().toLowerCase()
  if (key === 'arc' || key === 'arc-testnet' || key === 'arc_testnet') return 'ARC-TESTNET'
  const upper = key.toUpperCase()
  if (upper === 'ARC-TESTNET') return upper
  return 'ARC-TESTNET'
}

function normalizeGatewayBalanceChain(value: unknown) {
  const key = String(value ?? '').trim().toLowerCase()
  if (key === 'arc' || key === 'arc-testnet' || key === 'arc_testnet') return 'ARC-TESTNET'
  const fallback = String(value || GATEWAY_BALANCE_CHAIN).trim().toUpperCase()
  if (fallback === 'ARC-TESTNET' || fallback === 'ARC_TESTNET' || fallback === 'ARC') return 'ARC-TESTNET'
  return 'ARC-TESTNET'
}

async function queryUsdcWalletBalance(address: string, chain: string) {
  const config = USDC_CHAIN_CONFIG[chain as keyof typeof USDC_CHAIN_CONFIG]
  if (!config) return undefined
  const rpcUrl = process.env[config.rpcEnv]?.trim() || config.fallbackRpc
  const client = createPublicClient({ chain: config.chain, transport: http(rpcUrl) })
  const raw = await client.readContract({
    address: config.token as `0x${string}`,
    abi: USDC_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
  return formatUnits(raw, 6)
}

function extractJsonFromCliOutput(output: string) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(output.slice(start, end + 1)) as unknown
  } catch {
    return undefined
  }
}

function buildX402Proof(input: {
  response?: X402ServiceResponse
  buyerAgent: string
  sellerAgent: string
  buyerWallet: string
  serviceUrl: string
  maxAmount: string
  circleOutput: string
}) {
  const receiptPayload = {
    service: input.response?.service,
    payment: input.response?.payment,
    receipt: input.response?.receipt,
  }
  const receiptHash = crypto.createHash('sha256').update(JSON.stringify(receiptPayload)).digest('hex')
  const circleOutputHash = crypto.createHash('sha256').update(input.circleOutput).digest('hex')
  const proof = {
    kind: 'circle_gateway_x402' as const,
    provider: input.response?.receipt?.provider ?? 'Circle Gateway x402',
    service: input.response?.service ?? 'PolyDesk x402 service',
    buyerAgent: input.buyerAgent,
    sellerAgent: input.sellerAgent,
    payer: input.response?.payment?.payer ?? input.buyerWallet,
    seller: input.response?.receipt?.seller,
    amount: input.response?.payment?.amount ?? input.response?.receipt?.price ?? `${input.maxAmount} USDC`,
    network: input.response?.payment?.network,
    transaction: input.response?.payment?.transaction,
    serviceUrl: input.serviceUrl,
    generatedAt: input.response?.receipt?.generatedAt ?? new Date().toISOString(),
    receiptHash,
    circleOutputHash,
    legal: getAgentLegalProfile(input.sellerAgent),
    governance: getAgentGovernanceProfile(),
  }
  const proofHash = crypto.createHash('sha256').update(JSON.stringify(proof)).digest('hex')
  return { ...proof, proofHash }
}

async function readStore(): Promise<StoreData> {
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as StoreData
  } catch {
    return { pending: {}, agents: {} }
  }
}

async function writeStore(data: StoreData) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2))
}

function parseRequestId(output: string) {
  return output.match(/request(?:\s|-)?id[^a-zA-Z0-9_-]+([a-zA-Z0-9_-]{8,})/i)?.[1]
    ?? output.match(/\b[a-f0-9]{8,}(?:-[a-f0-9]{4,}){2,}\b/i)?.[0]
}

function parseWalletAddress(output: string) {
  return parseWalletAddresses(output)[0]
}

function parseWalletAddresses(output: string) {
  const addresses = new Set<string>()
  try {
    const parsed = JSON.parse(output) as unknown
    const queue = [parsed]
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      if (typeof item === 'string' && /^0x[a-fA-F0-9]{40}$/.test(item)) {
        addresses.add(item)
        continue
      }
      if (Array.isArray(item)) queue.push(...item)
      if (typeof item === 'object') queue.push(...Object.values(item as Record<string, unknown>))
    }
  } catch {
    // CLI can return text tables depending on version; parse those below.
  }
  for (const match of output.matchAll(/0x[a-fA-F0-9]{40}/g)) addresses.add(match[0])
  return [...addresses]
}

function normalizeExpectedWallet(value: unknown) {
  const wallet = String(value ?? '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : ''
}

function parseEnvRegistry(): Record<string, AgentWalletRecord> {
  const registry: Record<string, AgentWalletRecord> = {}
  if (DEFAULT_AGENT_SLUG && DEFAULT_AGENT_WALLET_ADDRESS) {
    registry[DEFAULT_AGENT_SLUG] = {
      walletAddress: DEFAULT_AGENT_WALLET_ADDRESS,
      chain: DEFAULT_AGENT_WALLET_CHAIN,
      updatedAt: 0,
      source: 'env',
    }
  }

  const raw = String(process.env.AGENT_WALLET_REGISTRY ?? '').trim()
  if (!raw) return registry
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const [rawSlug, value] of Object.entries(parsed)) {
      const slug = normalizeSlug(rawSlug)
      if (!slug) continue
      const entry = typeof value === 'string' ? { walletAddress: value } : value as Record<string, unknown>
      const walletAddress = normalizeExpectedWallet(entry.walletAddress)
      if (!walletAddress) continue
      registry[slug] = {
        walletAddress,
        chain: normalizeBalanceChain(entry.chain, DEFAULT_AGENT_WALLET_CHAIN),
        updatedAt: Number(entry.updatedAt) || 0,
        source: 'env',
      }
    }
  } catch {
    // Invalid env registry should not break the public wallet lookup endpoint.
  }
  return registry
}

function getEnvAgentRecord(agentSlug: string) {
  return parseEnvRegistry()[agentSlug]
}

function resolveAgentRecord(store: StoreData, agentSlug: string): AgentWalletRecord | undefined {
  const envRecord = getEnvAgentRecord(agentSlug)
  const storedRecord = store.agents?.[agentSlug]
  if (!envRecord) return storedRecord
  if (storedRecord?.walletAddress && storedRecord.walletAddress.toLowerCase() === envRecord.walletAddress.toLowerCase()) {
    return {
      ...envRecord,
      emailHash: storedRecord.emailHash,
      sessionId: storedRecord.sessionId,
      updatedAt: storedRecord.updatedAt || envRecord.updatedAt,
    }
  }
  return envRecord
}

function parseBalance(output: string) {
  const cleanOutput = output.replace(/\u001b\[[0-9;]*m/g, '')
  try {
    const parsed = JSON.parse(cleanOutput) as unknown
    const queue = [parsed]
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      if (typeof item === 'string') {
        const textValue = parseBalanceText(item)
        if (textValue !== undefined) return textValue
        continue
      }
      if (Array.isArray(item)) queue.push(...item)
      if (typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      for (const [key, value] of Object.entries(record)) {
        if (/usdc/i.test(key)) {
          if (typeof value === 'number' || typeof value === 'string') {
            const parsedValue = String(value).match(/\d+(?:\.\d+)?/)?.[0]
            if (parsedValue !== undefined) return parsedValue
          }
          if (value && typeof value === 'object') queue.push(value)
        }
      }
      const token = String(record.token ?? record.symbol ?? record.currency ?? record.asset ?? '').toLowerCase()
      const raw =
        record.balance ??
        record.amount ??
        record.availableBalance ??
        record.available ??
        record.formattedBalance ??
        record.formatted ??
        record.value
      if ((token === '' || token === 'usdc' || token.includes('usdc')) && (typeof raw === 'number' || typeof raw === 'string')) {
        const value = String(raw)
        if (/^\d+(\.\d+)?$/.test(value)) return value
      }
      queue.push(...Object.values(record))
    }
  } catch {
    // CLI can return text tables depending on version; parse those below.
  }
  return parseBalanceText(cleanOutput)
}

function parseBalanceText(output: string) {
  const direct = output.match(/\b\d+(?:\.\d+)?\s+USDC\b/i)?.[0]?.replace(/\s+USDC/i, '')
    ?? output.match(/\bUSDC\b[^\d]*(\d+(?:\.\d+)?)/i)?.[1]
  if (direct !== undefined) return direct
  if (/\bUSDC\b/i.test(output)) {
    const tableNumber = output.match(/[│|]\s*(\d+(?:\.\d+)?)\s*[│|]/)?.[1]
    if (tableNumber !== undefined) return tableNumber
  }
  const withoutAddresses = output.replace(/0x[a-fA-F0-9]{40}/g, '')
  const labelled = withoutAddresses.match(/\b(?:balance|available|amount|total)\b[^\d]*(\d+(?:\.\d+)?)/i)?.[1]
  if (labelled !== undefined) return labelled
  const numericValues = [...withoutAddresses.matchAll(/\b\d+(?:\.\d+)?\b/g)].map(match => match[0])
  if (numericValues.length === 1) return numericValues[0]
  if (/no\s+(token\s+)?balances?|not\s+found|empty/i.test(output)) return '0'
  return undefined
}

function isCircleLoginExpired(error: unknown) {
  const err = error as Error & { stdout?: string; stderr?: string }
  const detail = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
  return /not logged in|session expired|run [`']?circle wallet login/i.test(detail)
}

function safeCircleCliError(detail: string) {
  if (/otp value is not matched|otp value.*not match|otp token match|invalid otp|otp.*expired/i.test(detail)) {
    return {
      status: 400,
      code: 'otp_mismatch',
      error: 'Circle code was not accepted. Use the newest OTP from your email, or resend OTP and try again.',
    }
  }
  if (/invalid or expired request id|request id.*expired|request.*expired/i.test(detail)) {
    return {
      status: 400,
      code: 'otp_expired',
      error: 'OTP expired. Resend OTP and use the newest code.',
    }
  }
  return {
    status: 500,
    code: 'circle_cli_error',
    error: detail || 'Circle CLI request failed.',
  }
}

async function walletChoicesWithBalances(wallets: string[], key: string, chain: string) {
  const uniqueWallets = [...new Set(wallets)].slice(0, 8)
  const choices: Array<{ address: string; balance?: string; balanceError?: string }> = []
  for (const address of uniqueWallets) {
    const choice: { address: string; balance?: string; balanceError?: string } = { address }
    try {
      let output = ''
      try {
        output = await runCircle(['wallet', 'balance', '--address', address, '--chain', chain, '--output', 'json'], key, 20_000)
      } catch {
        output = await runCircle(['wallet', 'balance', '--address', address, '--chain', chain], key, 20_000)
      }
      choice.balance = parseBalance(output)
      if (choice.balance === undefined) choice.balanceError = 'Balance unavailable'
    } catch (err) {
      choice.balanceError = err instanceof Error ? err.message.slice(0, 120) : 'Balance unavailable'
    }
    choices.push(choice)
  }
  return choices
}

async function runCircle(args: string[], key: string, timeoutMs = 60_000) {
  const sessionHome = resolve(CIRCLE_SESSION_ROOT, safeSessionKey(key))
  await mkdir(sessionHome, { recursive: true })
  const { stdout, stderr } = await execFileAsync(CIRCLE_BIN, args, {
    timeout: timeoutMs,
    maxBuffer: 128 * 1024,
    shell: false,
    env: {
      ...process.env,
      HOME: sessionHome,
      USERPROFILE: sessionHome,
      CIRCLE_ACCEPT_TERMS: '1',
    },
  })
  return [stdout, stderr].filter(Boolean).join('\n').trim()
}

async function readCircleGatewayBalance(walletAddress: string, key: string, chain: string) {
  let output = ''
  try {
    output = await runCircle(['gateway', 'balance', '--address', walletAddress, '--chain', chain, '--output', 'json'], key, 30_000)
  } catch (err) {
    if (isCircleLoginExpired(err)) throw err
    output = await runCircle(['gateway', 'balance', '--address', walletAddress, '--chain', chain], key, 30_000)
  }
  return {
    balance: parseBalance(output),
    output,
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    const agentSlug = normalizeSlug(req.query.agent)
    if (!agentSlug) return res.status(400).json({ ok: false, error: 'Missing agent name.' })
    const store = await readStore()
    const record = resolveAgentRecord(store, agentSlug)
    const balanceChain = normalizeBalanceChain(req.query.chain ?? record?.chain)
    const gatewayBalanceChain = normalizeGatewayBalanceChain(req.query.gatewayChain ?? req.query.x402Chain ?? req.query.chain)
    let balance: string | undefined
    let balanceError: string | undefined
    let balanceChecked = false
    let gatewayBalance: string | undefined
    let gatewayBalanceError: string | undefined
    let gatewayBalanceChecked = false
    let sessionExpired = false
    if (record?.walletAddress && req.query.balance === '1') {
      balanceChecked = true
      try {
        balance = await queryUsdcWalletBalance(record.walletAddress, balanceChain)
        if (balance === undefined) {
          if (!record.sessionId) {
            balanceError = 'Reconnect this agent wallet to enable balance lookup.'
          } else if (!CIRCLE_CLI_ENABLED) {
            balanceError = 'Circle CLI balance lookup is not enabled on this server.'
          } else {
            const key = `${agentSlug}_${record.sessionId}`
            let output = ''
            try {
              output = await runCircle(['wallet', 'balance', '--address', record.walletAddress, '--chain', balanceChain, '--output', 'json'], key, 30_000)
            } catch {
              output = await runCircle(['wallet', 'balance', '--address', record.walletAddress, '--chain', balanceChain], key, 30_000)
            }
            balance = parseBalance(output)
            if (balance === undefined) balanceError = 'Circle CLI returned no parseable USDC balance.'
          }
        }
      } catch (err) {
        if (isCircleLoginExpired(err)) {
          sessionExpired = true
          balanceError = 'Wallet session expired. Sign in once to continue.'
        } else {
          balanceError = err instanceof Error ? err.message.slice(0, 240) : 'Balance lookup failed.'
        }
      }
    }
    if (record?.walletAddress && req.query.x402 === '1' && !record.sessionId) {
      gatewayBalanceChecked = true
      gatewayBalanceError = 'Reconnect this agent wallet to enable x402 balance lookup.'
    } else if (record?.walletAddress && req.query.x402 === '1' && !CIRCLE_CLI_ENABLED) {
      gatewayBalanceChecked = true
      gatewayBalanceError = 'Circle CLI x402 balance lookup is not enabled on this server.'
    } else if (record?.walletAddress && record.sessionId && req.query.x402 === '1' && CIRCLE_CLI_ENABLED) {
      gatewayBalanceChecked = true
      try {
        const key = `${agentSlug}_${record.sessionId}`
        const gateway = await readCircleGatewayBalance(record.walletAddress, key, gatewayBalanceChain)
        gatewayBalance = gateway.balance
        if (gatewayBalance === undefined) gatewayBalanceError = 'Circle CLI returned no parseable x402 balance.'
      } catch (err) {
        if (isCircleLoginExpired(err)) {
          sessionExpired = true
          gatewayBalanceError = 'Wallet session expired. Sign in once to continue.'
        } else {
          gatewayBalanceError = err instanceof Error ? err.message.slice(0, 240) : 'x402 balance lookup failed.'
        }
      }
    }
    return res.json({
      ok: true,
      found: !!record,
      agentSlug,
      walletAddress: record?.walletAddress,
      connected: !!record?.sessionId && !sessionExpired,
      source: record?.source ?? (record ? 'store' : undefined),
      chain: balanceChain,
      storedChain: record?.chain,
      balance,
      balanceChecked,
      balanceError,
      gatewayBalance,
      gatewayBalanceChecked,
      gatewayBalanceError,
      code: sessionExpired ? 'circle_session_expired' : undefined,
      gatewayBalanceChain,
      activity: await listAgentActivity(agentSlug),
      updatedAt: record?.updatedAt,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!CIRCLE_CLI_ENABLED) {
    return res.status(503).json({
      ok: false,
      error: 'Circle wallet provisioning is not enabled on this server.',
      setup: 'Install @circle-fin/cli and set CIRCLE_CLI_ENABLED=true.',
    })
  }

  const action = String(req.body?.action ?? '').trim().toLowerCase()
  const agentSlug = normalizeSlug(req.body?.agentSlug)
  const email = normalizeEmail(req.body?.email)
  const testnet = true
  if (!agentSlug) return res.status(400).json({ ok: false, error: 'Missing agent name.' })

  const id = email ? sessionId(agentSlug, email) : ''
  const key = `${agentSlug}_${id}`

  try {
    if (action === 'init') {
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email.' })
      const args = ['wallet', 'login', email, '--init', ...(testnet ? ['--testnet'] : [])]
      const output = await runCircle(args, key)
      const requestId = parseRequestId(output)
      const store = await readStore()
      const expectedWallet = normalizeExpectedWallet(req.body?.expectedWallet)
      store.pending[id] = { agentSlug, emailHash: emailHash(email), requestId, expectedWallet, testnet, createdAt: Date.now() }
      await writeStore(store)
      return res.json({ ok: true, sessionId: id, requestId, message: 'OTP sent by Circle.' })
    }

    if (action === 'complete') {
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email.' })
      const otp = String(req.body?.otp ?? '').trim()
      if (!/^[a-zA-Z0-9-]{4,32}$/.test(otp)) return res.status(400).json({ ok: false, error: 'Invalid OTP.' })
      const store = await readStore()
      const pending = store.pending[id]
      if (!pending || pending.agentSlug !== agentSlug || pending.emailHash !== emailHash(email)) {
        return res.status(400).json({ ok: false, error: 'Start provisioning again before entering OTP.' })
      }
      if (!pending.requestId) {
        return res.status(400).json({ ok: false, error: 'Circle did not return a request id. Use the CLI fallback.' })
      }

      await runCircle(['wallet', 'login', '--request', pending.requestId, '--otp', otp, '--testnet'], key)
      const chain = 'ARC-TESTNET'
      let listOutput = ''
      try {
        listOutput = await runCircle(['wallet', 'list', '--type', 'agent', '--chain', chain, '--output', 'json'], key)
      } catch {
        listOutput = await runCircle(['wallet', 'list', '--type', 'agent', '--chain', chain], key)
      }
      const wallets = parseWalletAddresses(listOutput)
      const existing = resolveAgentRecord(store, agentSlug)
      const expectedWallet = pending.expectedWallet || normalizeExpectedWallet(req.body?.expectedWallet)
      const expectedMatch = expectedWallet
        ? wallets.find(item => item.toLowerCase() === expectedWallet.toLowerCase())
        : undefined
      const existingMatch = existing?.walletAddress
        ? wallets.find(item => item.toLowerCase() === existing.walletAddress.toLowerCase())
        : undefined
      let walletAddress = expectedMatch || existingMatch
      if (!walletAddress && expectedWallet) {
        return res.status(409).json({
          ok: false,
          code: 'expected_wallet_not_found',
          error: 'Circle login succeeded, but the expected agent wallet was not found for this email.',
          existingWallet: existing?.walletAddress,
          expectedWallet,
          availableWallets: await walletChoicesWithBalances(wallets, key, chain),
        })
      }
      if (!walletAddress && wallets.length === 1) {
        walletAddress = wallets[0]
      }
      if (!walletAddress && wallets.length > 1) {
        return res.status(409).json({
          ok: false,
          code: 'multiple_agent_wallets',
          error: 'Circle returned multiple agent wallets. Enter the funded agent wallet address so PolyDesk does not pick the wrong wallet.',
          existingWallet: existing?.walletAddress,
          availableWallets: await walletChoicesWithBalances(wallets, key, chain),
        })
      }
      if (!walletAddress) return res.status(502).json({ ok: false, error: 'Circle login completed, but no wallet address was found.' })

      let gatewayBalance: string | undefined
      try {
        const gateway = await readCircleGatewayBalance(walletAddress, key, ARC_TESTNET_GATEWAY_CHAIN)
        gatewayBalance = gateway.balance
      } catch (err) {
        const sessionExpired = isCircleLoginExpired(err)
        return res.status(sessionExpired ? 409 : 503).json({
          ok: false,
          connected: false,
          code: sessionExpired ? 'circle_session_expired' : 'circle_session_validation_failed',
          error: sessionExpired
            ? 'Circle accepted the OTP, but the secure Arc x402 session was not available. Reopen Pocket Wallet and request a new code.'
            : 'Circle accepted the OTP, but PolyDesk could not validate Arc x402 access. Reopen Pocket Wallet and try again.',
        })
      }

      delete store.pending[id]
      const envRecord = getEnvAgentRecord(agentSlug)
      if (envRecord?.walletAddress && envRecord.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(409).json({
          ok: false,
          code: 'platform_agent_locked',
          error: 'This agent wallet is pinned by PolyDesk and cannot be replaced from this flow.',
          existingWallet: envRecord.walletAddress,
          newWallet: walletAddress,
        })
      }
      const explicitExpectedMatch = expectedWallet && walletAddress.toLowerCase() === expectedWallet.toLowerCase()
      if (existing?.walletAddress && existing.walletAddress.toLowerCase() !== walletAddress.toLowerCase() && !explicitExpectedMatch) {
        return res.status(409).json({
          ok: false,
          code: 'wallet_mismatch',
          error: 'This Circle login returned a different agent wallet. The existing wallet was not replaced.',
          existingWallet: existing.walletAddress,
          newWallet: walletAddress,
        })
      }
      store.agents = {
        ...(store.agents ?? {}),
        [agentSlug]: { walletAddress, chain, emailHash: pending.emailHash, sessionId: id, updatedAt: Date.now(), source: 'store' },
      }
      await writeStore(store)
      await setAgentProfileWallet(agentSlug, walletAddress)
      await appendAgentActivity({
        agentSlug,
        type: 'wallet_connected',
        title: 'Circle Agent Wallet connected',
        direction: 'system',
        network: chain,
        wallet: walletAddress,
        detail: 'Arc Testnet session connected',
      })
      return res.json({
        ok: true,
        connected: true,
        walletAddress,
        chain,
        agentSlug,
        gatewayBalance,
        gatewayBalanceChecked: true,
        gatewayBalanceChain: ARC_TESTNET_GATEWAY_CHAIN,
      })
    }

    if (action === 'disconnect') {
      if (getEnvAgentRecord(agentSlug)) {
        return res.status(409).json({
          ok: false,
          code: 'platform_agent_locked',
          error: 'This agent wallet is pinned by PolyDesk env config and cannot be disconnected from this flow.',
        })
      }
      const store = await readStore()
      const record = store.agents?.[agentSlug]
      if (!record) return res.json({ ok: true, disconnected: true, agentSlug })
      store.agents = {
        ...(store.agents ?? {})
      }
      delete store.agents[agentSlug]
      await writeStore(store)
      await setAgentProfileWallet(agentSlug, '')
      return res.json({ ok: true, disconnected: true, forgotten: true, agentSlug })
    }

    if (action === 'gateway-balance') {
      const store = await readStore()
      const record = resolveAgentRecord(store, agentSlug)
      if (!record?.walletAddress || !record.sessionId) {
        return res.status(404).json({ ok: false, error: 'Agent wallet session not found. Login on the web dashboard first.' })
      }

      const serviceKey = `${agentSlug}_${record.sessionId}`
      const gatewayBalanceChain = normalizeGatewayBalanceChain(req.body?.chain ?? req.body?.gatewayChain)
      let output = ''
      try {
        output = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', gatewayBalanceChain, '--output', 'json'], serviceKey, 30_000)
      } catch {
        output = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', gatewayBalanceChain], serviceKey, 30_000)
      }
      const gatewayBalance = parseBalance(output)
      return res.json({
        ok: true,
        agentSlug,
        walletAddress: record.walletAddress,
        gatewayBalance,
        gatewayBalanceChain,
        raw: output.slice(0, 1200),
      })
    }

    if (action === 'gateway-deposit-arc') {
      const amount = clampAmount(req.body?.amount, MAX_GATEWAY_DEPOSIT_AMOUNT)
      if (!amount) return res.status(400).json({ ok: false, error: 'Invalid Arc x402 activation amount.' })

      const store = await readStore()
      const record = resolveAgentRecord(store, agentSlug)
      if (!record?.walletAddress || !record.sessionId) {
        return res.status(404).json({ ok: false, error: 'Arc reader wallet session not found. Reconnect the reader wallet first.' })
      }

      const serviceKey = `${agentSlug}_${record.sessionId}`
      let output = ''
      try {
        output = await runCircle([
          'gateway',
          'deposit',
          '--amount',
          String(amount),
          '--address',
          record.walletAddress,
          '--chain',
          ARC_TESTNET_GATEWAY_CHAIN,
          '--method',
          'direct',
        ], serviceKey, 120_000)
      } catch (err) {
        if (isCircleLoginExpired(err)) {
          return res.status(409).json({
            ok: false,
            code: 'circle_session_expired',
            error: 'Wallet session expired. Sign in once, then retry x402 activation.',
          })
        }
        throw err
      }

      let balanceOutput = ''
      let gatewayBalance: string | undefined
      let balanceError: unknown
      for (let attempt = 1; attempt <= GATEWAY_DEPOSIT_VERIFY_ATTEMPTS; attempt += 1) {
        try {
          try {
            balanceOutput = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', ARC_TESTNET_GATEWAY_CHAIN, '--output', 'json'], serviceKey, 30_000)
          } catch {
            balanceOutput = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', ARC_TESTNET_GATEWAY_CHAIN], serviceKey, 30_000)
          }
          gatewayBalance = parseBalance(balanceOutput)
          balanceError = undefined
          if (Number(gatewayBalance ?? '0') >= Number(amount)) break
        } catch (err) {
          balanceError = err
        }
        if (attempt < GATEWAY_DEPOSIT_VERIFY_ATTEMPTS) await delay(GATEWAY_DEPOSIT_VERIFY_DELAY_MS)
      }

      if (balanceError && !balanceOutput) {
        return res.status(502).json({
          ok: false,
          code: 'arc_gateway_balance_verify_failed',
          error: balanceError instanceof Error ? balanceError.message.slice(0, 240) : 'Arc Gateway balance verification failed after deposit.',
          depositChain: ARC_TESTNET_GATEWAY_CHAIN,
          raw: output.slice(0, 3000),
        })
      }

      if (Number(gatewayBalance ?? '0') < Number(amount)) {
        return res.status(202).json({
          ok: false,
          code: 'arc_gateway_deposit_pending',
          error: `Arc Gateway deposit was submitted, but Circle Gateway has not made ${amount} USDC available yet. Wait a moment, then check activation again.`,
          gatewayBalance: gatewayBalance ?? '0',
          gatewayBalanceChain: ARC_TESTNET_GATEWAY_CHAIN,
          raw: output.slice(0, 3000),
          balanceRaw: balanceOutput.slice(0, 1200),
        })
      }

      await appendAgentActivity({
        agentSlug,
        type: 'gateway_activated',
        title: 'Activated Arc x402 Gateway balance',
        amount: String(amount),
        asset: 'USDC',
        direction: 'in',
        network: 'Arc Testnet',
        wallet: record.walletAddress,
        detail: 'Deposited from Arc Testnet via direct Gateway deposit',
      })

      return res.json({
        ok: true,
        agentSlug,
        walletAddress: record.walletAddress,
        amount: String(amount),
        depositChain: ARC_TESTNET_GATEWAY_CHAIN,
        gatewayBalanceChain: ARC_TESTNET_GATEWAY_CHAIN,
        gatewayBalance,
        response: extractJsonFromCliOutput(output),
        raw: output.slice(0, 3000),
      })
    }

    if (action === 'gateway-deposit') {
      return res.status(410).json({
        ok: false,
        code: 'polydesk_arc_only',
        error: 'PolyDesk LP x402 activation uses Arc only. Reconnect on Arc and retry activation.',
      })
    }

    if (action === 'pay-service' || action === 'pay-lp-scout') {
      const secret = String(req.headers['x-agent-wallet-secret'] ?? req.body?.secret ?? '')
      const authorized = SERVICE_SECRET
        && secret.length === SERVICE_SECRET.length
        && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(SERVICE_SECRET))
      if (action === 'pay-service' && !authorized) return res.status(401).json({ ok: false, error: 'Unauthorized' })

      const serviceUrl = action === 'pay-lp-scout'
        ? withServiceParams(DEFAULT_SCOUT_URL, {
            scoutMode: String(req.body?.scoutMode ?? 'best'),
            context: String(req.body?.context ?? ''),
            budget: String(req.body?.budget ?? ''),
          })
        : String(req.body?.serviceUrl ?? '').trim()
      const allowlistedServiceUrl = action === 'pay-lp-scout' ? DEFAULT_SCOUT_URL : serviceUrl
      const sellerAgentSlug = normalizeSlug(req.body?.sellerAgentSlug) || DEFAULT_AGENT_SLUG
      const requested = cleanAmount(req.body?.maxAmount)
      const maxAmount = Math.min(requested ?? MAX_SERVICE_AMOUNT, MAX_SERVICE_AMOUNT)
      if (!ALLOWED_SERVICE_URLS.has(allowlistedServiceUrl)) return res.status(403).json({ ok: false, error: 'Service URL is not allowlisted.' })
      if (!maxAmount || maxAmount <= 0) return res.status(400).json({ ok: false, error: 'Invalid max amount.' })

      try {
        const result = await payAgentX402Service({
          agentSlug,
          sellerAgentSlug,
          serviceUrl,
          maxAmount,
        })
        const zeroscoutQueued = Boolean(action === 'pay-lp-scout' && result.resultActivityId)
        if (zeroscoutQueued) {
          await appendAgentActivity({
            agentSlug,
            type: 'scout_verification_queued',
            title: 'Agent Hash queued LP Scout verification',
            direction: 'system',
            network: 'ZeroScout / 0G',
            wallet: result.walletAddress,
            serviceUrl,
            detail: 'Payment was validated by Circle Gateway x402. Agent Hash queued ZeroScout verification for the saved LP Scout result.',
            result: {
              sourceActivityId: result.resultActivityId,
              receiptActivityId: result.receiptActivityId,
              proofHash: result.proof?.proofHash,
              status: 'queued',
            },
          })
          void generateZeroScoutPolymarketBrief(agentSlug, result.resultActivityId, {
            includeClaudeReview: true,
            includeOpenAiReview: true,
          }).catch(async err => {
            const detail = publicErrorMessage(err)
            const transient = isTransientZeroScoutError(err)
            console.warn(transient ? '[agent-wallet] ZeroScout LP preparation still pending:' : '[agent-wallet] ZeroScout LP preparation failed:', detail)
            await appendAgentActivity({
              agentSlug,
              type: transient ? 'scout_verification_queued' : 'scout_verification_failed',
              title: transient ? 'ZeroScout verification continuing' : 'ZeroScout verification needs retry',
              direction: 'system',
              network: 'ZeroScout / 0G',
              wallet: result.walletAddress,
              serviceUrl,
              detail: transient
                ? 'ZeroScout is still preparing the verified LP Scout brief. Payment is saved and no additional x402 payment is required.'
                : detail,
              result: {
                sourceActivityId: result.resultActivityId,
                receiptActivityId: result.receiptActivityId,
                proofHash: result.proof?.proofHash,
                status: transient ? 'queued' : 'failed',
                error: transient ? undefined : detail,
                retryable: transient || undefined,
              },
            }).catch(activityErr => {
              console.warn('[agent-wallet] failed to record ZeroScout failure:', publicErrorMessage(activityErr))
            })
          })
        }
        return res.json({
          ok: true,
          agentSlug,
          walletAddress: result.walletAddress,
          serviceUrl,
          maxAmount: String(maxAmount),
          response: result.response,
          receiptActivityId: result.receiptActivityId,
          resultActivityId: result.resultActivityId,
          zeroscoutQueued,
          raw: result.raw,
        })
      } catch (err) {
        const serviceError = err as Error & { status?: number; code?: string }
        if (serviceError.status === 409 && serviceError.code === 'circle_session_expired') {
          return res.status(409).json({
            ok: false,
            code: 'circle_session_expired',
            error: serviceError.message,
          })
        }
        if (serviceError.status === 404) return res.status(404).json({ ok: false, code: serviceError.code || 'circle_session_missing', error: serviceError.message })
        throw err
      }
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' })
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string }
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').slice(0, 1200)
    const safe = safeCircleCliError(detail)
    return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.error })
  }
}
