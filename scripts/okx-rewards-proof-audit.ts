import { readDurableJson } from '../api/render-durable-store.js'

type StoredProof = {
  transactionHash: string
  payer: string
  serviceId: number
  serviceName: string
  deliveredAt: string
  claimState: string
}

type StoredState = {
  proofs?: Record<string, StoredProof>
}

function maskAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : 'invalid'
}

const state = await readDurableJson<StoredState>('polydesk:okx-rewards:v1')
const proofs = Object.values(state?.proofs ?? {})
const unclaimed = proofs
  .filter(proof => proof.claimState === 'unclaimed')
  .sort((left, right) => right.deliveredAt.localeCompare(left.deliveredAt))
  .slice(0, 20)
  .map(proof => ({
    receiptReference: proof.transactionHash,
    payer: maskAddress(proof.payer),
    serviceId: proof.serviceId,
    serviceName: proof.serviceName,
    deliveredAt: proof.deliveredAt,
  }))

console.log(JSON.stringify({
  ok: true,
  mode: 'proof-audit',
  mutation: false,
  recordedProofs: proofs.length,
  unclaimedProofs: unclaimed.length,
  proofs: unclaimed,
  next: unclaimed.length
    ? 'Choose one genuine non-operator receipt for the private rehearsal. No claim was created.'
    : 'No eligible paid delivery has been recorded since campaign recording began.',
}, null, 2))
