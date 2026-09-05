import assert from 'node:assert/strict'
import test from 'node:test'
import { getAddress, parseUnits } from 'viem'
import { checkPolymarketAccountReadiness } from '../api/polymarket-account-readiness.js'
import {
  createA2mcpPolymarketFundingLinkHandler,
  preflightA2mcpPolymarketFundingLink,
} from '../api/a2mcp-polymarket-funding-link.js'

const owner = getAddress('0x1111111111111111111111111111111111111111')
const depositWallet = getAddress('0x2222222222222222222222222222222222222222')

const supportedAssets = {
  supportedAssets: [{
    chainId: '8453',
    chainName: 'Base',
    token: {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x3333333333333333333333333333333333333333',
      decimals: 6,
    },
    minCheckoutUsd: 2,
  }],
}

function readinessDependencies(input: { deployed?: boolean; balance?: string } = {}) {
  return {
    inspectWallet: async () => ({
      ownerAddress: owner,
      depositWalletAddress: depositWallet,
      deployed: input.deployed ?? true,
    }),
    readPusdBalance: async () => parseUnits(input.balance ?? '0', 6),
    fetchSupportedAssets: async () => supportedAssets,
  }
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, unknown>,
    setHeader(name: string, value: unknown) { this.headers[name.toLowerCase()] = value; return this },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

test('derives the Deposit Wallet and reports the exact funding shortfall', async () => {
  const result = await checkPolymarketAccountReadiness({
    ownerAddress: owner,
    requiredBalanceUsdc: '5',
    sourceNetwork: 'base',
  }, readinessDependencies({ balance: '1.25' }))

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.state, 'funding_required')
  assert.equal(result.data.polymarketAccount.wallet, depositWallet)
  assert.equal(result.data.polymarketAccount.collateral.shortfall, '3.75')
  assert.equal(result.data.funding.minimumUsdc, '2')
  assert.equal(result.data.funding.suggestedAmountUsdc, '3.75')
  assert.equal(result.data.nextAction, 'CREATE_FUNDING_CHECKOUT')
})

test('fails closed when a caller supplies a wallet that does not derive from the owner', async () => {
  const result = await checkPolymarketAccountReadiness({
    ownerAddress: owner,
    polymarketWallet: '0x4444444444444444444444444444444444444444',
    requiredBalanceUsdc: '5',
  }, readinessDependencies())

  assert.equal(result.ok, false)
  assert.equal(result.status, 409)
  assert.match(result.error, /not the Polymarket Deposit Wallet derived/i)
})

test('requires activation before funding an undeployed derived wallet', async () => {
  const result = await checkPolymarketAccountReadiness({
    ownerAddress: owner,
    requiredBalanceUsdc: '5',
  }, readinessDependencies({ deployed: false }))

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.state, 'activation_required')
  assert.equal(result.data.nextAction, 'SETUP_DEPOSIT_WALLET')
  assert.equal(result.data.polymarketAccount.collateral.balance, '0')
})

test('blocks an undeployed account before the x402 service fee', async () => {
  const result = await preflightA2mcpPolymarketFundingLink({
    method: 'POST',
    headers: {},
    query: {},
    body: {
      ownerAddress: owner,
      requiredBalanceUsdc: '5',
      network: 'base',
    },
  } as any, {
    readiness: input => checkPolymarketAccountReadiness(input, readinessDependencies({ deployed: false })),
  })

  assert.equal(result.proceed, false)
  if (result.proceed) return
  assert.equal(result.status, 409)
  assert.equal(result.body.nextAction, 'SETUP_DEPOSIT_WALLET')
})

test('funding handoff targets only the derived deployed wallet', async () => {
  let checkoutInput: any
  const handler = createA2mcpPolymarketFundingLinkHandler({
    readiness: input => checkPolymarketAccountReadiness(input, readinessDependencies({ balance: '1' })),
    createCheckout: async input => {
      checkoutInput = input
      return {
        statusCode: 201,
        data: {
          ok: true,
          fundingRequestId: 'pmf_11111111111111111111',
          checkoutUrl: 'https://app.hashpaylink.com/pay/c/chk_verified',
        },
      }
    },
  })
  const res = responseRecorder()
  await handler({
    method: 'POST',
    headers: {},
    query: {},
    body: {
      ownerAddress: owner,
      wallet: depositWallet,
      requiredBalanceUsdc: '5',
      network: 'base',
    },
  } as any, res as any)

  assert.equal(res.statusCode, 200)
  assert.equal(checkoutInput.polymarketWallet, depositWallet)
  assert.equal(checkoutInput.amount, '4')
  assert.equal(checkoutInput.returnUrl, 'https://polydesk.trade/integrations?notice=polymarket-funding-complete')
  assert.equal(res.body.polymarket.derivedFromOwner, true)
  assert.equal(res.body.nextAction, 'PAY_CHECKOUT_THEN_POLL_STATUS')
})

test('does not create a checkout when the verified pUSD balance is sufficient', async () => {
  let checkoutCalls = 0
  const handler = createA2mcpPolymarketFundingLinkHandler({
    readiness: input => checkPolymarketAccountReadiness(input, readinessDependencies({ balance: '8' })),
    createCheckout: async () => {
      checkoutCalls += 1
      throw new Error('must not create checkout')
    },
  })
  const res = responseRecorder()
  await handler({
    method: 'POST',
    headers: {},
    query: {},
    body: {
      ownerAddress: owner,
      requiredBalanceUsdc: '5',
      network: 'base',
    },
  } as any, res as any)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.nextAction, 'PREPARE_BUY')
  assert.equal(res.body.checkout, null)
  assert.equal(checkoutCalls, 0)
})
