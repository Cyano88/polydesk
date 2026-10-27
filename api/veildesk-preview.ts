import { Router, type Request } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { createVeilDeskAdapter } from './veildesk-client.js'

type Adapter = Awaited<ReturnType<typeof createVeilDeskAdapter>>
type Dependencies = { authenticate: (req: Request) => Promise<string>; adapter: () => Promise<Adapter>; stateDirectory: string }
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const failure = (status: number) => Object.assign(new Error('VeilDesk request failed'), { status })

// Ownership is reserved before transport. Failed or uncertain submissions keep
// their owner so another user can never acquire a partially delivered mandate.
export function createVeilDeskPreviewRouter(deps: Dependencies) {
  if (!isAbsolute(deps.stateDirectory)) throw Error('Absolute persistent VeilDesk state path required')
  const router = Router(), owners = join(deps.stateDirectory, 'owners')
  async function owns(id: string, user: string) {
    try { return await readFile(join(owners, id), 'utf8') === digest(user) }
    catch (error: any) { if (error.code === 'ENOENT') return false; throw error }
  }
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.all(['/', '/:id'], async (req, res) => {
    try {
      const user = await deps.authenticate(req)
      if (!user) throw failure(401)
      if (!['GET', 'POST'].includes(req.method) || (req.method === 'POST' && req.params.id) || (req.method === 'GET' && !req.params.id)) {
        return res.status(405).json({ error: 'Method not allowed' })
      }
      const adapter = await deps.adapter()
      const id = req.method === 'POST' ? req.body?.id : req.params.id
      if (typeof id !== 'string' || !uuid.test(id)) throw failure(400)
      if (req.method === 'GET') {
        if (!await owns(id, user)) throw failure(404)
        return res.json(await adapter.getPreview(id))
      }
      try { adapter.validatePreview(req.body) } catch { throw failure(400) }
      await mkdir(owners, { recursive: true, mode: 0o700 })
      try {
        const file = await open(join(owners, id), 'wx', 0o600)
        try { await file.writeFile(digest(user)); await file.sync() } finally { await file.close() }
        if (process.platform !== 'win32') { const directory = await open(owners, 'r'); try { await directory.sync() } finally { await directory.close() } }
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error
        if (!await owns(id, user)) throw failure(409)
      }
      // Return only the SDK-verified result interface, never raw relay envelopes.
      await adapter.submitPreview(req.body)
      return res.status(202).json({ id, executionAuthorized: false })
    } catch (error: any) {
      let status = [400, 401, 404, 409, 429, 503].includes(error.status) ? error.status : 503
      if (error.message === 'Mandate ID reused with different contents') status = 409
      const messages: Record<number, string> = { 400: 'Invalid preview mandate', 401: 'Sign in to use VeilDesk', 404: 'Preview not found', 409: 'Mandate ID conflict', 429: 'Try again later', 503: 'VeilDesk unavailable; retry the same mandate' }
      return res.status(status).json({ error: messages[status], executionAuthorized: false })
    }
  })
  return router
}

export function veildeskPreviewRouter() {
  const stateDirectory = process.env.VEILDESK_CLIENT_STATE || join(process.env.DATA_PATH || resolve('data'), 'veildesk')
  let adapter: Promise<Adapter> | undefined
  return createVeilDeskPreviewRouter({
    stateDirectory,
    authenticate: async req => {
      const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1]
      if (!token) throw failure(401)
      if (process.env.VEILDESK_PREVIEW_ENABLED !== 'true' || !process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) throw failure(503)
      try {
        const claims = await new PrivyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET).verifyAuthToken(token)
        if (!claims.userId) throw failure(401)
        return claims.userId
      } catch { throw failure(401) }
    },
    adapter: async () => {
      if (!process.env.VEILDESK_CLIENT_CONFIG) throw failure(503)
      if (process.env.RENDER === 'true') {
        const mounts = await readFile('/proc/self/mountinfo', 'utf8')
        if (!(stateDirectory === '/var/sibyl/veildesk' || stateDirectory.startsWith('/var/sibyl/veildesk/')) || !mounts.split('\n').some(line => line.split(' ')[4] === '/var/sibyl')) throw failure(503)
      }
      if (!adapter) adapter = createVeilDeskAdapter({configPath: process.env.VEILDESK_CLIENT_CONFIG, sdkRoot: resolve('vendor/veildesk'), unpaidOnly: true, stateDirectory: join(stateDirectory, 'outbox')}).catch(error => { adapter = undefined; throw error })
      return adapter
    },
  })
}
