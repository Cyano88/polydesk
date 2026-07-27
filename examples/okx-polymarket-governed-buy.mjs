import { execFileSync } from 'node:child_process'
import {
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
  createL2Headers,
  orderToJsonV2,
} from '@polymarket/clob-client-v2'

const [
  ownerAddress,
  depositWalletAddress,
  maximumTotalDebitUsdc = '4',
  orderAmountUsdc = '3.975',
] = process.argv.slice(2)
if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress || '') || !/^0x[a-fA-F0-9]{40}$/.test(depositWalletAddress || '')) {
  console.error('Usage: node examples/okx-polymarket-governed-buy.mjs <owner-eoa> <deposit-wallet> [maximum-total-debit-usdc] [order-amount-usdc]')
  process.exit(1)
}
if (!(Number(maximumTotalDebitUsdc) > 0) || !(Number(orderAmountUsdc) > 0) || Number(orderAmountUsdc) > Number(maximumTotalDebitUsdc)) {
  console.error('maximum-total-debit-usdc and order-amount-usdc must be positive, and the order amount cannot exceed the total debit cap.')
  process.exit(1)
}

const CONFIG = {
  baseUrl: 'https://polydesk.trade',
  clobUrl: 'https://clob.polymarket.com',
  ownerAddress,
  depositWalletAddress,
  marketUrl: 'https://polymarket.com/event/fed-decision-in-july-181',
  marketSlug: 'will-there-be-no-change-in-fed-interest-rates-after-the-july-2026-meeting',
  outcome: 'Yes',
  maximumTotalDebitUsdc,
  orderAmountUsdc,
  maximumPrice: 0.795,
  orderType: 'FAK',
}

function jsonForCli(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)
}

function explicitDomainTypes(domain) {
  const known = {
    name: 'string',
    version: 'string',
    chainId: 'uint256',
    verifyingContract: 'address',
    salt: 'bytes32',
  }
  return Object.keys(domain)
    .filter(name => known[name])
    .map(name => ({ name, type: known[name] }))
}

function runOnchainOs(args) {
  const output = execFileSync('onchainos', args, {
    encoding: 'utf8',
    windowsHide: true,
  })
  const parsed = JSON.parse(output)
  if (!parsed?.ok) throw new Error(parsed?.error || 'OKX Agentic Wallet request failed.')
  return parsed.data
}

function signTypedData({ domain, types, primaryType, message }) {
  const typedData = {
    domain,
    types: {
      EIP712Domain: explicitDomainTypes(domain),
      ...types,
    },
    primaryType,
    message,
  }
  const data = runOnchainOs([
    'wallet',
    'sign-message',
    '--type',
    'eip712',
    '--message',
    jsonForCli(typedData),
    '--chain',
    '137',
    '--from',
    CONFIG.ownerAddress,
  ])
  if (!/^0x[a-fA-F0-9]+$/.test(data?.signature || '')) {
    throw new Error('OKX Agentic Wallet did not return an EIP-712 signature.')
  }
  return data.signature
}

function signPersonal(message) {
  const data = runOnchainOs([
    'wallet',
    'sign-message',
    '--type',
    'personal',
    '--message',
    message,
    '--chain',
    '196',
    '--from',
    CONFIG.ownerAddress,
  ])
  if (!/^0x[a-fA-F0-9]{130}$/.test(data?.signature || '')) {
    throw new Error('OKX Agentic Wallet did not return a 65-byte mandate signature.')
  }
  return data.signature
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init)
  const data = await response.json().catch(() => null)
  return { response, data }
}

function requireOk(label, result) {
  if (!result.response.ok || !result.data?.ok) {
    throw new Error(`${label}: ${result.data?.error || `HTTP ${result.response.status}`}`)
  }
  return result.data
}

function decodePaymentResponse(value) {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
  } catch {
    return { present: true, decoded: false }
  }
}

const externalOrderId = `okx:polydesk:fed:${Date.now()}`
const prepare = requireOk('PolyDesk preparation failed', await jsonRequest(
  `${CONFIG.baseUrl}/api/polymarket-open/prepare`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      externalOrderId,
      marketUrl: CONFIG.marketUrl,
      marketSlug: CONFIG.marketSlug,
      outcome: CONFIG.outcome,
      maxSpendUsdc: CONFIG.orderAmountUsdc,
      wallet: CONFIG.depositWalletAddress,
      orderType: CONFIG.orderType,
    }),
  },
))

if (!prepare.readyForLocalSigning) throw new Error(`Fresh plan is not signable: ${(prepare.issues || []).join(' ')}`)
if (Number(prepare.market.executionPrice) > CONFIG.maximumPrice) {
  throw new Error(`Live execution boundary ${prepare.market.executionPrice} exceeds approved maximum ${CONFIG.maximumPrice}.`)
}
if (prepare.wallet.address.toLowerCase() !== CONFIG.depositWalletAddress.toLowerCase()) {
  throw new Error('Prepared Deposit Wallet does not match the approved wallet.')
}

const signer = {
  account: { address: CONFIG.ownerAddress },
  signTypedData,
}
const baseClient = new ClobClient({
  host: CONFIG.clobUrl,
  chain: 137,
  signer,
  signatureType: SignatureTypeV2.POLY_1271,
  funderAddress: CONFIG.depositWalletAddress,
  useServerTime: true,
  throwOnError: false,
  builderConfig: prepare.signingPlan.client.builderConfig,
})
const credentials = await baseClient.createOrDeriveApiKey()
if (!credentials?.key || !credentials?.secret || !credentials?.passphrase) {
  throw new Error('Could not derive buyer-local CLOB credentials.')
}
const clobClient = new ClobClient({
  host: CONFIG.clobUrl,
  chain: 137,
  signer,
  creds: credentials,
  signatureType: SignatureTypeV2.POLY_1271,
  funderAddress: CONFIG.depositWalletAddress,
  useServerTime: true,
  throwOnError: true,
  builderConfig: prepare.signingPlan.client.builderConfig,
})

const signedOrder = await clobClient.createMarketOrder({
  tokenID: prepare.market.tokenId,
  amount: Number(CONFIG.orderAmountUsdc),
  price: Number(prepare.market.executionPrice),
  side: Side.BUY,
  orderType: OrderType.FAK,
  userUSDCBalance: Number(prepare.wallet.collateral.balance),
}, {
  tickSize: prepare.market.tickSize,
  negRisk: prepare.market.negRisk,
  version: 2,
})
const orderPayload = orderToJsonV2(signedOrder, credentials.key, OrderType.FAK, false, false)
const makerAmountUsdc = Number(signedOrder.makerAmount) / 1_000_000
const price = Number(prepare.market.executionPrice)
const feeInfo = clobClient.feeInfos[prepare.market.tokenId]
const builderCode = prepare.signingPlan.client.builderConfig.builderCode
const builderTakerFeeRate = clobClient.builderFeeRates[builderCode]?.taker ?? 0
if (!feeInfo || !Number.isFinite(feeInfo.rate) || !Number.isFinite(feeInfo.exponent)) {
  throw new Error('The CLOB did not return fee metadata; refusing to pay for a governed handoff.')
}
const effectivePlatformFeeRate = feeInfo.rate * (price * (1 - price)) ** feeInfo.exponent
const platformFeeUsdc = makerAmountUsdc / price * effectivePlatformFeeRate
const builderFeeUsdc = makerAmountUsdc * builderTakerFeeRate
const estimatedTotalDebitUsdc = Math.ceil((makerAmountUsdc + platformFeeUsdc + builderFeeUsdc) * 1_000_000) / 1_000_000
if (estimatedTotalDebitUsdc > Number(CONFIG.maximumTotalDebitUsdc)) {
  throw new Error(
    `Fee-inclusive debit ${estimatedTotalDebitUsdc.toFixed(6)} pUSD exceeds the approved cap ${Number(CONFIG.maximumTotalDebitUsdc).toFixed(6)} pUSD.`,
  )
}

const mandate = {
  maximumAmountUsdc: CONFIG.maximumTotalDebitUsdc,
  maximumPrice: String(CONFIG.maximumPrice),
  allowedTokenIds: [prepare.market.tokenId],
  allowedMarketUrls: [CONFIG.marketUrl],
  allowedSigner: CONFIG.depositWalletAddress,
  authoritySigner: CONFIG.ownerAddress,
  validUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
}
const authorization = requireOk('Mandate authorization failed', await jsonRequest(
  `${CONFIG.baseUrl}/api/polymarket-governed-open/authorize`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ externalOrderId, mandate }),
  },
))
mandate.authoritySignature = signPersonal(authorization.authorizationMessage)

const governedBody = {
  externalOrderId,
  marketUrl: CONFIG.marketUrl,
  marketTitle: prepare.market.title,
  outcome: prepare.market.outcome,
  tokenId: prepare.market.tokenId,
  signer: CONFIG.depositWalletAddress,
  orderType: CONFIG.orderType,
  order: signedOrder,
  orderPayload,
  mandate,
}
const validation = requireOk('Free governed validation failed', await jsonRequest(
  `${CONFIG.baseUrl}/api/polymarket-governed-open/validate`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(governedBody),
  },
))
if (validation.decision !== 'APPROVE') {
  throw new Error(`Governed decision was ${validation.decision}: ${(validation.reasons || []).join(' ')}`)
}

const builderHandoff = requireOk('Builder handoff failed', await jsonRequest(
  `${CONFIG.baseUrl}/api/polymarket-builder-handoff`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'governed-open',
      marketTitle: prepare.market.title,
      marketUrl: CONFIG.marketUrl,
      outcome: prepare.market.outcome,
      tokenId: prepare.market.tokenId,
      signer: CONFIG.depositWalletAddress,
      orderType: CONFIG.orderType,
      order: signedOrder,
      orderPayload,
    }),
  },
))

const challengeResponse = await fetch(`${CONFIG.baseUrl}/api/a2mcp/polymarket-governed-open`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(governedBody),
})
if (challengeResponse.status !== 402) {
  const challengeBody = await challengeResponse.text()
  throw new Error(`Expected a fresh payment challenge, received HTTP ${challengeResponse.status}: ${challengeBody.slice(0, 300)}`)
}
const paymentRequired = challengeResponse.headers.get('payment-required')
if (!paymentRequired) throw new Error('PolyDesk challenge did not include PAYMENT-REQUIRED.')

const payment = runOnchainOs([
  'payment',
  'pay',
  '--payload',
  paymentRequired,
  '--selected-index',
  '0',
])
if (!payment?.authorization_header || !payment?.header_name) {
  throw new Error('OKX Agent Payments Protocol did not return a payment authorization header.')
}

const paidResponse = await fetch(`${CONFIG.baseUrl}/api/a2mcp/polymarket-governed-open`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    [payment.header_name]: payment.authorization_header,
  },
  body: JSON.stringify(governedBody),
})
const paidDecision = await paidResponse.json().catch(() => null)
if (!paidResponse.ok || !paidDecision?.ok || paidDecision.decision !== 'APPROVE') {
  throw new Error(`Paid governed replay failed: ${paidDecision?.error || paidDecision?.decision || `HTTP ${paidResponse.status}`}`)
}

const finalPayload = paidDecision.nextAction?.orderPayload
if (!finalPayload || JSON.stringify(finalPayload) !== JSON.stringify(orderPayload)) {
  throw new Error('Paid handoff did not return the exact locally signed order payload.')
}
const orderBody = JSON.stringify(finalPayload)
const serverTime = await clobClient.getServerTime()
const userHeaders = await createL2Headers(signer, credentials, {
  method: 'POST',
  requestPath: '/order',
  body: orderBody,
}, serverTime)

let builderHeaders = {}
if (builderHandoff.remoteBuilderSigner?.url && builderHandoff.remoteBuilderSigner?.token) {
  const signerUrl = new URL(builderHandoff.remoteBuilderSigner.url, CONFIG.baseUrl)
  const signedHeaders = await jsonRequest(signerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${builderHandoff.remoteBuilderSigner.token}`,
    },
    body: JSON.stringify({ method: 'POST', path: '/order', body: orderBody }),
  })
  if (!signedHeaders.response.ok || !signedHeaders.data) {
    throw new Error(`Builder header signing failed: ${signedHeaders.data?.error || `HTTP ${signedHeaders.response.status}`}`)
  }
  builderHeaders = signedHeaders.data
}

const orderResponse = await fetch(`${CONFIG.clobUrl}/order`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...userHeaders,
    ...builderHeaders,
  },
  body: orderBody,
})
const orderResult = await orderResponse.json().catch(() => null)
if (!orderResponse.ok || orderResult?.error || orderResult?.success === false) {
  throw new Error(`Polymarket order submission failed: ${orderResult?.error || `HTTP ${orderResponse.status}`}`)
}

console.log(JSON.stringify({
  ok: true,
  externalOrderId,
  plan: {
    priceBoundary: prepare.market.executionPrice,
    orderAmountUsdc: CONFIG.orderAmountUsdc,
    estimatedTotalDebitUsdc: estimatedTotalDebitUsdc.toFixed(6),
    maximumTotalDebitUsdc: CONFIG.maximumTotalDebitUsdc,
    orderType: CONFIG.orderType,
    tokenId: prepare.market.tokenId,
  },
  governance: {
    decision: paidDecision.decision,
    executionId: paidDecision.executionId,
    duplicate: paidDecision.duplicate,
    hashes: paidDecision.hashes,
  },
  servicePayment: decodePaymentResponse(paidResponse.headers.get('payment-response')),
  order: orderResult,
}, null, 2))
