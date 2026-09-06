import { createHash, randomUUID } from 'node:crypto'
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types'
import { mutateDurableJson, readDurableJson } from './render-durable-store.js'
import { smartTraderAnalysisRequestBinding } from './polymarket-smart-trader.js'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .filter(([, v]) => v !== undefined).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')

export function basePaymentAttemptBinding(raw: unknown, requirements: PaymentRequirements, payload: PaymentPayload, payer: string) {
  // This first implementation supports the route's native-USDC EIP-3009 authorization only.
  // Do not guess nonce identity for other authorization mechanisms.
  const authorization = (payload.payload as Record<string, unknown>)?.authorization as Record<string, unknown> | undefined
  const nonce = authorization?.nonce
  if (typeof nonce !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(nonce)
    || typeof authorization?.from !== 'string' || authorization.from.toLowerCase() !== payer.toLowerCase()
    || typeof authorization.to !== 'string' || authorization.to.toLowerCase() !== requirements.payTo.toLowerCase()
    || authorization.value !== requirements.amount) {
    throw new Error('Payment authorization cannot be durably identified.')
  }
  const { request, requestHash } = smartTraderAnalysisRequestBinding(raw)
  const identity = { network: requirements.network, asset: requirements.asset.toLowerCase(), payer: payer.toLowerCase(), nonce: nonce.toLowerCase() }
  const id = hash(identity)
  const bindingHash = hash({ identity, requestHash, seller: requirements.payTo.toLowerCase(),
    amount: requirements.amount, authorizationHash: hash(authorization), service: '/api/x402/base/polymarket-smart-trader' })
  return { id, bindingHash, request, requestHash, ...identity, seller: requirements.payTo.toLowerCase(), amount: requirements.amount }
}

export type BasePaymentAttempt = ReturnType<typeof basePaymentAttemptBinding> & {
  schema: 'polydesk-base-payment-attempt-v1'
  state: 'attempted' | 'settled'
  claimToken: string
  createdAt: string
  transaction?: string
  recoveryProof?: BasePaymentRecoveryProof
}
export type BasePaymentRecoveryProof = {
  chainId: 'eip155:8453'
  transaction: string
  blockNumber: string
  blockHash: string
  finalizedBlockNumber: string
  finalizedBlockHash: string
}
export type BaseAttemptMutator = (key: string, update: (current: BasePaymentAttempt | undefined) => BasePaymentAttempt) => Promise<BasePaymentAttempt>

export class ExistingBasePaymentAttempt extends Error {
  constructor(readonly attemptId: string, readonly paymentState: 'attempted' | 'settled' | 'conflict') {
    super('Existing payment attempt requires reconciliation; do not settle again.')
  }
}

export class BasePaymentAttempts {
  constructor(private readonly mutate: BaseAttemptMutator = (key, update) => mutateDurableJson(key, update),
    private readonly read: (key: string) => Promise<BasePaymentAttempt | undefined> = readDurableJson) {}

  async get(id: string): Promise<BasePaymentAttempt | undefined> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid payment attempt ID.')
    const record = await this.read(`polydesk:base-payment-attempt:${id}`)
    if (!record) return undefined
    const identity = { network: record.network, asset: record.asset, payer: record.payer, nonce: record.nonce }
    if (record.schema !== 'polydesk-base-payment-attempt-v1' || record.id !== id || hash(identity) !== id
      || !['attempted', 'settled'].includes(record.state) || typeof record.claimToken !== 'string' || !record.claimToken
      || !/^[a-f0-9]{64}$/.test(record.bindingHash) || hash(record.request) !== record.requestHash
      || smartTraderAnalysisRequestBinding(record.request).requestHash !== record.requestHash
      || (record.state === 'settled' && !record.transaction)) throw new Error('Invalid stored payment attempt.')
    return record
  }

  async claim(binding: ReturnType<typeof basePaymentAttemptBinding>): Promise<BasePaymentAttempt> {
    const record: BasePaymentAttempt = { ...binding, schema: 'polydesk-base-payment-attempt-v1',
      state: 'attempted', claimToken: randomUUID(), createdAt: new Date().toISOString() }
    // No external call occurs inside the database transaction. A commit failure never permits settlement.
    return this.mutate(`polydesk:base-payment-attempt:${binding.id}`, current => {
      if (current !== undefined) {
        const matches = current.schema === record.schema && current.id === record.id
          && current.bindingHash === record.bindingHash && current.requestHash === record.requestHash
          && hash(current.request) === hash(record.request)
        throw new ExistingBasePaymentAttempt(binding.id, matches && ['attempted', 'settled'].includes(current.state) ? current.state : 'conflict')
      }
      return record
    })
  }

  async settled(claim: BasePaymentAttempt, transaction: string, recoveryProof?: BasePaymentRecoveryProof): Promise<BasePaymentAttempt> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(transaction) || /^0x0{64}$/.test(transaction)) throw new Error('Invalid settlement reference')
    if (recoveryProof && (recoveryProof.chainId !== 'eip155:8453' || recoveryProof.transaction !== transaction.toLowerCase())) {
      throw new Error('Recovery proof does not match settlement.')
    }
    return this.mutate(`polydesk:base-payment-attempt:${claim.id}`, current => {
      if (!current || current.claimToken !== claim.claimToken || current.bindingHash !== claim.bindingHash
        || current.schema !== claim.schema || current.id !== claim.id
        || hash(current.request) !== hash(claim.request)
        || (['requestHash', 'network', 'asset', 'payer', 'nonce', 'seller', 'amount'] as const).some(key => current[key] !== claim[key])
        || (current.state !== 'attempted' && current.state !== 'settled')
        || (current.transaction && current.transaction.toLowerCase() !== transaction.toLowerCase())) {
        throw new Error('Payment attempt changed; reconciliation required.')
      }
      return { ...current, state: 'settled', transaction, ...(recoveryProof ? { recoveryProof } : {}) }
    })
  }
}
