import express, { type RequestHandler } from 'express'
import {
  createPolydeskMarketContextHandler,
  livePolydeskMarketContextDependencies,
} from './polydesk-market-context.js'

export const POLYDESK_CONTEXT_STAGING_HOST = '127.0.0.1'
export const POLYDESK_CONTEXT_STAGING_PATH = '/api/agent/polymarket-context'

type StagingEnvironment = Record<string, string | undefined>

const polydeskMarketContextHandler = createPolydeskMarketContextHandler(
  livePolydeskMarketContextDependencies,
  { authorization: 'disabled_loopback_staging' },
)

export function requirePolydeskContextStaging(environment: StagingEnvironment) {
  if (environment.POLYDESK_MARKET_CONTEXT_STAGING_ENABLED !== 'true') {
    throw new Error('PolyDesk context staging is disabled.')
  }
}

export function polydeskContextStagingPort(environment: StagingEnvironment) {
  const raw = environment.POLYDESK_MARKET_CONTEXT_STAGING_PORT ?? '4317'
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error('PolyDesk context staging port is invalid.')
  }
  return port
}

const loopbackOnly: RequestHandler = (request, response, next) => {
  const remote = String(request.socket.remoteAddress ?? '').toLowerCase()
  if (remote !== '127.0.0.1' && remote !== '::ffff:127.0.0.1') {
    response.status(403).json({ ok: false, error: 'Loopback access only.' })
    return
  }
  next()
}

export function createPolydeskContextStagingApp(
  handler: RequestHandler = polydeskMarketContextHandler,
) {
  const app = express()
  app.disable('x-powered-by')
  app.use(loopbackOnly)
  app.use(express.json({ limit: '64kb', strict: true }))
  app.get('/health', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.status(200).json({
      ok: true,
      service: 'polydesk-context-staging',
      readOnly: true,
      production: false,
    })
  })
  app.post(POLYDESK_CONTEXT_STAGING_PATH, handler)
  app.use((_request, response) => {
    response.status(404).json({ ok: false, error: 'Route not found.' })
  })
  app.use((
    _error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    response.status(400).json({ ok: false, error: 'Request JSON is invalid.' })
  })
  return app
}
