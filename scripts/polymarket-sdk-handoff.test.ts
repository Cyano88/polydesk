import assert from 'node:assert/strict'
import test from 'node:test'
import { keccak256, concat } from 'ethers'
import { bindPolymarketOrder, EXCHANGES_V2 } from '../api/polymarket-order-proof.js'
import { Wallet } from '@ethersproject/wallet'
import { OrderBuilder, OrderType, Side, SignatureTypeV2, orderToJsonV2 } from '@polymarket/clob-client-v2'
import { validateSignedOpenInput } from '../api/a2mcp-polymarket-signed-open.js'
import { evaluateGovernedOpenInput, governedMandateAuthorizationMessage } from '../api/a2mcp-polymarket-governed-open.js'

// Public synthetic fixture only. No provider, live wallet, credentials or network.
const owner = new Wallet('0x' + '42'.repeat(32))
const depositWallet = '0x1111111111111111111111111111111111111111'
const builderCode = '0x' + 'ab'.repeat(32)
const marketUrl = 'https://polymarket.com/event/synthetic-sdk-test'

for (const orderType of [OrderType.FAK, OrderType.FOK]) {
  for (const negRisk of [false, true]) {
    test(`official SDK deposit-wallet ${orderType} negRisk=${negRisk} passes exact governed handoff`, async () => {
      const builder = new OrderBuilder(owner, 137, SignatureTypeV2.POLY_1271, depositWallet)
      const signed = await builder.buildMarketOrder({
        tokenID: '123456789', amount: 5, price: 0.5, side: Side.BUY, orderType, builderCode,
      }, { tickSize: '0.01', negRisk }, 2)
      assert.ok('timestamp' in signed)
      const payload = orderToJsonV2(signed as Parameters<typeof orderToJsonV2>[0], 'synthetic-api-key', orderType)
      const body = {
        externalOrderId: `sdk:test:${orderType}:${negRisk}`,
        marketUrl, marketTitle: 'Synthetic SDK market', outcome: 'Yes', tokenId: '123456789',
        signer: depositWallet, orderType, order: signed, orderPayload: payload,
      }
      const validation = validateSignedOpenInput(body)
      assert.equal(validation.ok, true, validation.ok ? undefined : validation.error)
      assert.equal(signed.signer.toLowerCase(), depositWallet)
      assert.equal(signed.maker.toLowerCase(), depositWallet)
      assert.equal(signed.signatureType, 3)
      // SDK POLY_1271 wrapper contains innerSignature(65), domain(32), contentsHash(32).
      const sdkHash = keccak256(concat(['0x1901', '0x' + signed.signature.slice(132, 196), '0x' + signed.signature.slice(196, 260)]))
      const proof = bindPolymarketOrder(signed as unknown as Record<string, unknown>)
      assert.equal(proof.hashes[EXCHANGES_V2[negRisk ? 1 : 0]], sdkHash, 'Independent hashing must match the official SDK signature wrapper')
      const mandate = {
        maximumAmountUsdc: '5', maximumPrice: '0.5', allowedTokenIds: ['123456789'],
        allowedMarketUrls: [marketUrl], allowedSigner: depositWallet,
        authoritySigner: owner.address.toLowerCase(), validUntil: new Date(Date.now() + 60_000).toISOString(),
        approvalRequiredAboveUsdc: '5', researchPolicy: 'agent-independent-v1',
      }
      const authoritySignature = await owner.signMessage(governedMandateAuthorizationMessage(body.externalOrderId, mandate))
      const governed = evaluateGovernedOpenInput({ ...body, mandate: { ...mandate, authoritySignature } })
      assert.equal(governed.ok, true, governed.ok ? undefined : governed.error)
      if (governed.ok) assert.equal(governed.decision, 'APPROVE')
      const drifted = { ...body, orderPayload: { ...payload, order: { ...payload.order, makerAmount: '6000000' } } }
      assert.equal(validateSignedOpenInput(drifted).ok, false)
    })
  }
}
