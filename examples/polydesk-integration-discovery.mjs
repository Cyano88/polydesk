const baseUrl = String(process.env.POLYDESK_BASE_URL || 'https://polydesk.trade').replace(/\/+$/, '')
const response = await fetch(`${baseUrl}/.well-known/polydesk.json`, {
  headers: { accept: 'application/json' },
})

if (!response.ok) throw new Error(`PolyDesk discovery returned HTTP ${response.status}`)
const manifest = await response.json()
if (manifest.schema !== 'polydesk-integration-manifest' || manifest.schemaVersion !== '1.0.0') {
  throw new Error('Unsupported PolyDesk integration manifest')
}

console.log(JSON.stringify({
  provider: manifest.provider,
  status: manifest.status,
  payment: manifest.integration.payment,
  services: manifest.services.map(service => ({
    id: service.id,
    marketplaceServiceId: service.marketplaceServiceId,
    method: service.method,
    endpoint: `${manifest.baseUrl}${service.endpoint}`,
    price: service.price,
    requestSchema: service.requestSchema,
  })),
}, null, 2))
