const baseUrl = String(process.env.POLYDESK_BASE_URL || 'https://polydesk.trade').replace(/\/+$/, '')
const response = await fetch(`${baseUrl}/.well-known/polydesk.json`, {
  headers: { accept: 'application/json' },
})

if (!response.ok) throw new Error(`PolyDesk discovery returned HTTP ${response.status}`)
const manifest = await response.json()
if (manifest.schema !== 'polydesk-integration-manifest' || manifest.schemaVersion !== '2.0.0') {
  throw new Error('Unsupported PolyDesk integration manifest')
}

console.log(JSON.stringify({
  provider: manifest.provider,
  status: manifest.status,
  payment: manifest.integration.payment,
  products: manifest.products.map(product => ({
    id: product.id,
    name: product.name,
    type: product.type,
    implementationStatus: product.implementationStatus,
    marketplace: product.marketplace,
    pricing: product.pricing,
  })),
  capabilities: manifest.capabilities.map(capability => ({
    id: capability.id,
    method: capability.method,
    endpoint: `${manifest.baseUrl}${capability.endpoint}`,
    requestSchema: capability.requestSchema,
  })),
}, null, 2))
