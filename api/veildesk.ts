import type { Request, Response } from 'express'

export const veildeskManifest = {
  schema: 'veildesk.discovery.v1', name: 'VeilDesk', by: 'PolyDesk', status: 'preview',
  description: 'Private coordination for prediction-market agents with selective disclosure.',
  docs: '/docs/veildesk', skill: '/skills/veildesk/SKILL.md',
  endpoints: { discovery: '/api/veildesk', validateEnvelope: '/api/veildesk/validate' },
  available: ['discovery', 'envelope_structure_validation'],
  unavailable: ['research_submission', 'research_delivery', 'zcash_settlement', 'trade_execution'],
  localTestnet: { wallet: 'zallet', receiptVerifier: 'schema_fixture_tested', authenticatedMandateBinding: true,
    shieldedPaymentTestCompleted: false, hostedSettlementAvailable: false, executionAuthorized: false },
  marketplace: { provider: 'OKX.AI', listed: false, agentId: null, serviceId: null, zecPaymentsVerified: false },
  privacy: { plaintextAccepted: false, validationDecrypts: false, publicTradesRemainPublic: true },
  mcp: { transport: 'stdio', script: 'scripts/veildesk-mcp.ts', tools: ['veildesk_capabilities'] },
} as const

export function validateEnvelope(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  const fields = ['version', 'id', 'direction', 'ephemeralPublicKey', 'salt', 'iv', 'ciphertext']
  if (Object.keys(v).length !== fields.length || Object.keys(v).some(k => !fields.includes(k))) return false
  if (v.version !== 1 || typeof v.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.id) || !['request', 'response'].includes(String(v.direction))) return false
  const lengths = { ephemeralPublicKey: 65, salt: 32, iv: 12, ciphertext: 4112 }
  return Object.entries(lengths).every(([field, length]) => {
    const text = v[field]
    if (typeof text !== 'string' || text.length > 6000) return false
    const decoded = Buffer.from(text, 'base64')
    return decoded.length === length && decoded.toString('base64') === text && (field !== 'ephemeralPublicKey' || decoded[0] === 4)
  })
}

export function veildeskDiscovery(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  return res.json({ ...veildeskManifest, previewApi: { enabled: process.env.VEILDESK_PREVIEW_ENABLED === 'true', authentication: 'privy_bearer', submit: '/api/veildesk/previews', get: '/api/veildesk/previews/:id', plaintextVisibleTo: ['polydesk', 'provider'], executionAuthorized: false } })
}
export function veildeskValidate(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const valid = validateEnvelope(req.body)
  return res.status(valid ? 200 : 400).json({ schema: 'veildesk.validation.v1', valid,
    scope: 'structure_only', acceptedForResearch: false,
    message: valid ? 'Envelope structure valid. Authenticity and decryption are not verified.' : 'Invalid envelope. Send only the encrypted envelope fields.' })
}
