import assert from 'node:assert/strict'
import test from 'node:test'
import { publicCatalogue, publicServices } from '../api/okx-agentic-marketplace.js'

test('reads live agents and services from the public OKX AI marketplace', async () => {
  const catalogue = await publicCatalogue('API services')
  const agents = Array.isArray(catalogue.list) ? catalogue.list as Array<Record<string, unknown>> : []
  assert.ok(agents.length > 0)
  assert.ok(Number(catalogue.total) >= agents.length)

  const agentId = String(agents[0]?.agentId || '')
  assert.match(agentId, /^\d+$/)
  const services = await publicServices(agentId)
  assert.ok(Array.isArray(services.list))
  assert.ok(Number(services.total) >= (services.list as unknown[]).length)
})
