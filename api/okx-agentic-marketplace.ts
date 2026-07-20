import type { Request, Response } from 'express'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { verifiedPrivyUser } from './privy-circle-link.js'
import { withOkxSessionLock } from './okx-session-queue.js'

const execFileAsync = promisify(execFile)
const DATA_ROOT = resolve(process.env.OKX_AGENTIC_DATA_PATH || join(process.env.DATA_PATH || './data', 'okx-agentic-wallets'))
const OKX_BASE_URL = (process.env.OKX_AGENTIC_BASE_URL || 'https://web3.okx.com').replace(/\/+$/, '')
const OKX_AI_PUBLIC_URL = 'https://www.okx.ai'
const PUBLIC_CACHE_MS = 60_000

let publicCatalogueCache: { expiresAt: number; value: Record<string, unknown> } | null = null
const publicAgentCache = new Map<string, { expiresAt: number; value: Record<string, unknown> }>()

type CliEnvelope = { ok?: boolean; error?: string; data?: Record<string, unknown> | unknown[] }

function cliBinary() {
  if (process.platform === 'win32') return process.env.ONCHAINOS_BIN?.trim() || 'onchainos.exe'
  const bundled = resolve('.render-home/.local/bin/onchainos')
  const configured = process.env.ONCHAINOS_BIN?.trim() ? resolve(process.env.ONCHAINOS_BIN.trim()) : ''
  const homeInstall = join(process.env.HOME || '/opt/render', '.local', 'bin', 'onchainos')
  return [bundled, configured, homeInstall].find(candidate => candidate && existsSync(candidate)) || bundled
}

function sessionHome(userId: string) {
  return join(DATA_ROOT, createHash('sha256').update(userId).digest('hex'))
}

function parseCli(stdout: string): CliEnvelope {
  const lines = stdout.trim().split(/\r?\n/).reverse()
  for (const line of lines) {
    try {
      const value = JSON.parse(line) as CliEnvelope
      if (value && typeof value === 'object') return value
    } catch { /* ignore non-JSON CLI output */ }
  }
  throw new Error('Onchain OS returned an invalid response.')
}

async function runForUser(userId: string, args: string[], timeout = 60_000) {
  const home = sessionHome(userId)
  await mkdir(home, { recursive: true, mode: 0o700 })
  return withOkxSessionLock(home, async () => {
    let stdout = ''
    try {
      const result = await execFileAsync(cliBinary(), [...args, '--base-url', OKX_BASE_URL], {
        timeout,
        maxBuffer: 2 * 1024 * 1024,
        shell: false,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          OKX_API_KEY: process.env.OKX_API_KEY || process.env.OKX_PAYMENT_API_KEY,
          OKX_SECRET_KEY: process.env.OKX_SECRET_KEY || process.env.OKX_PAYMENT_SECRET_KEY,
          OKX_PASSPHRASE: process.env.OKX_PASSPHRASE || process.env.OKX_PAYMENT_PASSPHRASE,
        },
      })
      stdout = result.stdout
    } catch (error) {
      const stderr = String((error as Error & { stderr?: string }).stderr || '')
      const envelope = stderr.split(/\r?\n/).reverse().flatMap(line => {
        try {
          const parsed = JSON.parse(line) as { error?: unknown }
          return typeof parsed.error === 'string' ? [parsed.error] : []
        } catch { return [] }
      })[0]
      throw new Error(envelope || 'OKX Agentic Wallet command failed. Please retry.')
    }
    const parsed = parseCli(stdout)
    if (parsed.ok === false) throw new Error(parsed.error || 'Onchain OS request failed.')
    return parsed.data
  })
}

function text(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function publicPageState(pathname: string) {
  const response = await fetch(`${OKX_AI_PUBLIC_URL}${pathname}`, {
    headers: { accept: 'text/html', 'user-agent': 'PolyDesk/1.0 (+https://polydesk.trade)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`OKX AI public marketplace returned HTTP ${response.status}.`)
  const html = await response.text()
  const match = html.match(/<script[^>]+id="appState"[^>]*>([\s\S]*?)<\/script>/i)
  if (!match?.[1]) throw new Error('OKX AI public marketplace did not return catalogue data.')
  return JSON.parse(match[1]) as Record<string, unknown>
}

function initialProps(state: Record<string, unknown>) {
  const appContext = state.appContext && typeof state.appContext === 'object' ? state.appContext as Record<string, unknown> : {}
  return appContext.initialProps && typeof appContext.initialProps === 'object' ? appContext.initialProps as Record<string, unknown> : {}
}

export async function publicCatalogue(query: string) {
  if (!publicCatalogueCache || publicCatalogueCache.expiresAt <= Date.now()) {
    const props = initialProps(await publicPageState('/agents'))
    const section = props.AgentMarketplaceAgentList && typeof props.AgentMarketplaceAgentList === 'object' ? props.AgentMarketplaceAgentList as Record<string, unknown> : {}
    const agentList = section.agentList && typeof section.agentList === 'object' ? section.agentList as Record<string, unknown> : {}
    const source = Array.isArray(agentList.list) ? agentList.list : []
    const list = source.flatMap(entry => {
      if (!entry || typeof entry !== 'object') return []
      const item = entry as Record<string, unknown>
      const id = text(item.agentId, 80)
      const name = text(item.name, 160)
      if (!/^\d+$/.test(id) || !name) return []
      const description = text(item.description, 500)
      const price = text(item.startingPrice, 80)
      return [{
        ...item,
        agentId: id,
        name,
        ratingStars: text(item.score, 40) ? `★ ${text(item.score, 40)}` : 'No rating yet',
        minPrice: price ? `${price} ${text(item.symbol, 20) || 'USDT'}` : 'free',
        topService: description ? `${description.slice(0, 140)}${description.length > 140 ? '…' : ''}` : 'Open services',
      }]
    })
    publicCatalogueCache = {
      expiresAt: Date.now() + PUBLIC_CACHE_MS,
      value: { list, total: Number(agentList.total) || list.length, pageSize: list.length, source: 'okx-ai-public-marketplace' },
    }
  }
  const value = publicCatalogueCache.value
  const list = Array.isArray(value.list) ? value.list : []
  const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2 && !['api', 'service', 'services', 'agent', 'agents'].includes(term))
  const filtered = terms.length ? list.filter(entry => {
    const item = entry as Record<string, unknown>
    const haystack = [item.name, item.description, item.categoryName, item.categories].flat().join(' ').toLowerCase()
    return terms.every(term => haystack.includes(term))
  }) : list
  return { ...value, list: filtered, shown: filtered.length }
}

export async function publicServices(agentId: string) {
  const cached = publicAgentCache.get(agentId)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const props = initialProps(await publicPageState(`/agents/${agentId}`))
  const detail = props.AgentDetailPage && typeof props.AgentDetailPage === 'object' ? props.AgentDetailPage as Record<string, unknown> : {}
  const services = detail.services && typeof detail.services === 'object' ? detail.services as Record<string, unknown> : {}
  const source = Array.isArray(services.list) ? services.list : []
  const list = source.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const serviceId = text(item.serviceId, 180)
    const description = text(item.description, 1_000)
    if (!serviceId) return []
    return [{
      ...item,
      serviceId,
      serviceName: text(item.name, 200) || `Service ${serviceId}`,
      serviceDescription: description,
      fee: text(item.price, 80),
      method: /\bPOST\b/i.test(description) ? 'POST' : 'GET',
    }]
  })
  const value = { list, total: Number(services.total) || list.length, pageSize: list.length, source: 'okx-ai-public-marketplace' }
  publicAgentCache.set(agentId, { expiresAt: Date.now() + PUBLIC_CACHE_MS, value })
  return value
}

function params(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key.trim().slice(0, 80), text(item, 500)] as const)
    .filter(([key, item]) => key && item)
    .slice(0, 20)
}

export function listedServiceMatches(root: unknown, serviceId: string, endpoint: string) {
  const queue = [root]
  const normalizedEndpoint = endpoint.replace(/\/+$/, '')
  while (queue.length) {
    const next = queue.shift()
    if (!next || typeof next !== 'object') continue
    if (Array.isArray(next)) {
      queue.push(...next)
      continue
    }
    const item = next as Record<string, unknown>
    const cells = Array.isArray(item.cells) ? item.cells.map(cell => String(cell)) : []
    const itemId = text(item.id ?? item.serviceId ?? cells[0], 180).replace(/^#/, '')
    const itemEndpoint = text(item.endpoint ?? item.url ?? cells[4], 1_000).replace(/^`|`$/g, '').replace(/\/+$/, '')
    if (itemId === serviceId && itemEndpoint === normalizedEndpoint) return true
    queue.push(...Object.values(item))
  }
  return false
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : 'OKX Agentic Wallet request failed.'
  if (/BadRecordMac/i.test(message)) return 'OKX Agentic Wallet could not refresh its secure session. Sign in again, then retry.'
  if (/session expired/i.test(message)) return 'Your OKX Agentic Wallet session expired. Sign in again to continue.'
  if (/ENOENT|not found/i.test(message)) return 'Onchain OS is not installed on this PolyDesk server.'
  return message.replace(/bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500)
}

export default async function okxAgenticMarketplaceHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  try {
    const { claims } = await verifiedPrivyUser(req)
    const action = text(req.body?.action, 40)

    if (action === 'status') {
      const data = await runForUser(claims.userId, ['wallet', 'status'], 12_000)
      return res.json({ ok: true, wallet: data })
    }
    if (action === 'login-init') {
      const data = await runForUser(claims.userId, ['wallet', 'login', '--phase', 'init'])
      return res.json({ ok: true, login: data })
    }
    if (action === 'login-poll') {
      const sessionId = text(req.body?.sessionId, 160)
      if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing Agentic Wallet login session.' })
      const data = await runForUser(claims.userId, ['wallet', 'login', '--phase', 'poll', '--session-id', sessionId], 300_000)
      return res.json({ ok: true, wallet: data })
    }
    if (action === 'search') {
      const query = text(req.body?.query, 120)
      if (!query) return res.status(400).json({ ok: false, error: 'Enter a marketplace search.' })
      const data = await publicCatalogue(query)
      return res.json({ ok: true, catalog: data })
    }
    if (action === 'services') {
      const agentId = text(req.body?.agentId, 80).replace(/^#/, '')
      if (!/^\d+$/.test(agentId)) return res.status(400).json({ ok: false, error: 'Invalid OKX agent ID.' })
      const data = await publicServices(agentId)
      return res.json({ ok: true, services: data })
    }
    if (action === 'quote') {
      const agentId = text(req.body?.agentId, 80).replace(/^#/, '')
      const serviceId = text(req.body?.serviceId, 180)
      const endpoint = text(req.body?.endpoint, 1_000)
      const method = text(req.body?.method, 10).toUpperCase() || 'GET'
      if (!/^\d+$/.test(agentId) || !serviceId || !/^https:\/\//i.test(endpoint) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return res.status(400).json({ ok: false, error: 'This service does not expose a supported HTTPS API endpoint.' })
      }
      const currentServices = await runForUser(claims.userId, ['agent', 'service-list', '--agent-id', agentId])
      if (!listedServiceMatches(currentServices, serviceId, endpoint)) {
        return res.status(409).json({ ok: false, error: 'This OKX service listing changed. Refresh the agent’s services before paying.' })
      }
      const args = ['payment', 'quote', endpoint, '--method', method]
      for (const [key, value] of params(req.body?.params)) args.push('--param', `${key}=${value}`)
      const data = await runForUser(claims.userId, args, 90_000)
      return res.json({ ok: true, quote: data })
    }
    if (action === 'pay') {
      if (req.body?.approved !== true) return res.status(400).json({ ok: false, error: 'Explicit payment approval is required.' })
      const paymentId = text(req.body?.paymentId, 180)
      const selectedIndex = Number(req.body?.selectedIndex)
      if (!paymentId || !Number.isInteger(selectedIndex) || selectedIndex < 0) {
        return res.status(400).json({ ok: false, error: 'Invalid OKX payment quote.' })
      }
      const args = ['payment', 'pay', '--payment-id', paymentId, '--selected-index', String(selectedIndex), '--yes']
      for (const [key, value] of params(req.body?.params)) args.push('--param', `${key}=${value}`)
      const data = await runForUser(claims.userId, args, 180_000)
      return res.json({ ok: true, purchase: data })
    }
    return res.status(400).json({ ok: false, error: 'Unsupported OKX marketplace action.' })
  } catch (error) {
    const status = Number((error as Error & { status?: number }).status) || (/Missing Privy|auth/i.test(String(error)) ? 401 : 502)
    return res.status(status).json({ ok: false, error: friendlyError(error) })
  }
}
