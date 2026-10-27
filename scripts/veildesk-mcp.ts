import { createInterface } from 'node:readline'
import { veildeskManifest } from '../api/veildesk.js'

// Local, read-only stdio discovery adapter. stdout is reserved for JSON-RPC.
export function reply(message: any): object | undefined {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
  if (!Object.hasOwn(message, 'id')) return undefined
  const base = { jsonrpc: '2.0', id: message.id }
  if (message.method === 'initialize') return { ...base, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'veildesk-by-polydesk', version: '0.1.0' } } }
  if (message.method === 'ping') return { ...base, result: {} }
  if (message.method === 'tools/list') return { ...base, result: { tools: [{ name: 'veildesk_capabilities', description: 'Read VeilDesk preview capabilities; no research, payment or trade execution.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }] } }
  if (message.method === 'tools/call' && message.params?.name === 'veildesk_capabilities' && (!message.params.arguments || Object.keys(message.params.arguments).length === 0)) return { ...base, result: { content: [{ type: 'text', text: JSON.stringify(veildeskManifest) }] } }
  return { ...base, error: { code: message.method === 'tools/call' ? -32602 : -32601, message: 'Unsupported method or tool arguments' } }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/veildesk-mcp.ts')) {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  input.on('line', line => {
    try { const result = reply(JSON.parse(line)); if (result) process.stdout.write(JSON.stringify(result) + '\n') }
    catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n') }
  })
}
