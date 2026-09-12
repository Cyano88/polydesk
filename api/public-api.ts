import { createPartnerResearchRouter, researchFee, partnerResearchPaths } from './partner-research.js'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { createPartnerJobsRouter, partnerJobPaths } from './partner-jobs.js'
import { discoverPolymarket } from './polymarket-discover.js'

export const VERSION = '1.0.0'
export const operations = [
  { id: 'listCapabilities', path: '/capabilities', description: 'Discover available public operations.', parameters: [] },
  { id: 'discoverMarkets', path: '/markets', description: 'Search public market candidates without paying, selecting or trading.', parameters: [
    { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1, maxLength: 200 } },
    { name: 'intent', in: 'query', required: false, schema: { type: 'string', maxLength: 500 } },
  ] },
] as const

export function capabilities() {
  return { ok: true, schemaVersion: VERSION, stage: 'public-read-foundation',
    capabilities: operations.map(op => ({ id: op.id, endpoint: `/api/v1${op.path}`, method: 'GET', description: op.description, parameters: op.parameters, authentication: 'none', paymentRequired: false, signingAuthorized: false, orderSubmitted: false })),
    links: { openapi: '/api/v1/openapi.json', guide: '/docs/platforms', legacyCatalog: '/api/a2mcp/services', skill: '/skills/polydesk/SKILL.md' },
    partnerJobs: { endpoint: '/api/v1/jobs', status: 'requires-partner-provisioning', supportedCapabilities: ['market-discovery'], paymentRequired: false },
    paidResearch: { endpoint: '/api/v1/research-jobs', publicPaymentEndpoint: '/api/x402/base/polymarket-smart-trader', fee: researchFee, partnerKeyRequiredForReservations: true, publicPaymentRequiresPartnerKey: false, acceptanceEndpoint: "/api/v1/research-jobs/{id}/acceptance", acceptanceRequiresExactReportHashes: true, acceptanceAuthorizesTrade: false },
    planned: ['MCP transport', 'External subscriptions', 'Unified fee-inclusive trade previews'],
    compatibility: { transport: ['HTTP JSON'], mcp: 'not-implemented',
      payment: 'These reads are free. Existing paid routes retain their own live payment challenges.',
      signer: 'No wallet login is required for these reads. Onchain OS is the reference execution signer; alternate signers require adapter verification.',
      execution: 'No v1 trade submission endpoint is enabled. Service payment and trade authorization remain separate.' },
    nextActions: [{ action: 'DISCOVER_MARKETS', label: 'Search for a market', requiredInputs: ['q'], authorizationRequired: false }],
  }
}
const actionSchema = { type: 'object', required: ['action', 'label', 'authorizationRequired'], properties: { action: { type: 'string' }, label: { type: 'string' }, authorizationRequired: { type: 'boolean' } }, additionalProperties: true }
const envelopeSchema = { type: 'object', required: ['ok', 'schemaVersion', 'requestId', 'nextActions'], properties: { ok: { type: 'boolean' }, schemaVersion: { const: VERSION }, requestId: { type: 'string' }, nextActions: { type: 'array', items: actionSchema } }, additionalProperties: true }
const jsonResponse = (description: string, schema: object) => ({ description, content: { 'application/json': { schema } } })
export function openapi() {
  const paths = Object.fromEntries(operations.map(op => [op.path, { get: { operationId: op.id, summary: op.description, security: [], parameters: op.parameters,
    responses: {
      '200': jsonResponse('Read-only result; never trading authorization.', { ...envelopeSchema, required: [...envelopeSchema.required, op.id === 'discoverMarkets' ? 'result' : 'capabilities'], properties: { ...envelopeSchema.properties, ok: { const: true }, ...(op.id === 'discoverMarkets' ? { result: { type: 'object', description: 'Existing polydesk-market-discovery-v1 result with candidates, truncation and schedule verification.', additionalProperties: true } } : { capabilities: { type: 'array', items: { type: 'object' } } }) } }),
      '400': { '$ref': '#/components/responses/Error' }, '502': { '$ref': '#/components/responses/Error' },
      '429': { description: 'Rate limited. Honor Retry-After; no payment attempted.' },
    },
  } }]))
  return { openapi: '3.1.0', info: { title: 'PolyDesk public API', version: VERSION, description: 'Public discovery and partner-authenticated durable free discovery jobs. Partner research reservations bind existing Base payments; no MCP or trade execution.' }, servers: [{ url: '/api/v1' }], paths: { ...paths, ...partnerJobPaths(), ...partnerResearchPaths() },
    components: { securitySchemes: { PartnerKey: { type: 'http', scheme: 'bearer', description: 'Provisioned partner key; scoped to one tenant and application. Not wallet authorization.' } }, responses: { Error: jsonResponse('Invalid input or unavailable upstream.', { ...envelopeSchema, required: [...envelopeSchema.required, 'error'], properties: { ...envelopeSchema.properties, ok: { const: false }, error: { type: 'object', required: ['code', 'message', 'retryable'], properties: { code: { type: 'string' }, message: { type: 'string' }, retryable: { type: 'boolean' } } } } }) } },
  }
}
export function createPublicApiRouter(search: typeof discoverPolymarket = discoverPolymarket) {
  const router = Router()
  router.use((_req, res, next) => { res.locals.requestId = randomUUID(); res.setHeader('X-Request-ID', res.locals.requestId); res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/openapi.json', (_req, res) => res.json(openapi()))
  router.use('/jobs', createPartnerJobsRouter())
  router.use('/research-jobs', createPartnerResearchRouter())
  for (const op of operations) router.get(op.path, async (req, res) => {
    const envelope = { schemaVersion: VERSION, requestId: res.locals.requestId as string }
    const fail = (status: number, code: string, message: string) => res.status(status).json({ ok: false, ...envelope, error: { code, message, retryable: status === 502 }, nextActions: [{ action: status === 502 ? 'RETRY_DISCOVERY' : 'REFINE_QUERY', label: status === 502 ? 'Retry this free search later' : 'Review the request schema', authorizationRequired: false }] })
    const allowed: readonly string[] = op.parameters.map(p => p.name)
    if (Object.keys(req.query).some(key => !allowed.includes(key)) || Object.values(req.query).some(value => typeof value !== 'string')) return fail(400, 'INVALID_INPUT', 'Only documented scalar query parameters are accepted.')
    if (op.id === 'listCapabilities') return res.json({ ...capabilities(), ...envelope })
    try {
      const result = await search(req.query)
      if (result.status !== 200) return fail(result.status, result.status === 400 ? 'INVALID_INPUT' : 'UPSTREAM_UNAVAILABLE', result.body.error || 'Discovery unavailable.')
      return res.json({ ok: true, ...envelope, result: result.body, nextActions: [
        { action: 'REVIEW_CANDIDATES', label: 'Review candidates and resolution rules', authorizationRequired: false },
        ...(result.body.scheduleVerification === 'required' ? [{ action: 'VERIFY_SCHEDULE', label: 'Verify the actual fixture before choosing a market', authorizationRequired: false }] : []),
        { action: 'REFINE_QUERY', label: 'Refine the search', authorizationRequired: false },
      ] })
    } catch { return fail(502, 'UPSTREAM_UNAVAILABLE', 'Discovery unavailable. No payment or trade attempted.') }
  })
  router.use((req, res) => {
    const known = ['/openapi.json', ...operations.map(op => op.path)].includes(req.path)
    if (known) res.setHeader('Allow', 'GET, HEAD')
    return res.status(known ? 405 : 404).json({ ok: false, schemaVersion: VERSION, requestId: res.locals.requestId, error: { code: known ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND', message: 'Read available capabilities for supported operations.', retryable: false }, nextActions: [{ action: 'LIST_CAPABILITIES', label: 'Read available capabilities', authorizationRequired: false }] })
  })
  return router
}
