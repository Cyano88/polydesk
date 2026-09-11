import type { FacilitatorClient } from '@x402/core/server'
import type { PaymentPayload, ResourceInfo } from '@x402/core/types'

// EIP-3009 authorization/signature and accepted payment terms remain untouched.
// Discovery is server-owned metadata, not a buyer-supplied service definition.
export function withServerDiscovery(client: FacilitatorClient, resource: ResourceInfo, extensions: () => Record<string, unknown>): FacilitatorClient {
  const enrich = (payload: PaymentPayload): PaymentPayload => {
    if (payload.x402Version !== 2) throw new Error('Base discovery requires x402 v2')
    if (payload.resource && payload.resource.url !== resource.url) throw new Error('Payment resource does not match this service')
    const serverExtensions = extensions()
    if (!serverExtensions.bazaar) throw new Error('Server discovery metadata is unavailable')
    return { ...payload, resource: { ...resource }, extensions: { ...payload.extensions, bazaar: serverExtensions.bazaar } }
  }
  return {
    getSupported: () => client.getSupported(),
    verify: (payload, requirements) => client.verify(enrich(payload), requirements),
    settle: (payload, requirements) => client.settle(enrich(payload), requirements),
  }
}
