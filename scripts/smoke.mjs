const baseUrl = String(process.env.POLYDESK_SMOKE_URL ?? process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

const checks = [
  { path: '/api/health', expect: [200], label: 'health' },
  { path: '/polydesk?preview=1&service=pulse', expect: [200], label: 'pulse spa' },
  { path: '/polydesk?preview=1&service=portfolio', expect: [200], label: 'overview spa' },
  { path: '/polydesk?preview=1&service=agent', expect: [200], label: 'agent spa' },
  { path: '/polydesk?preview=1&service=lp-scout', expect: [200], label: 'lp scout spa' },
  { path: '/polydesk?preview=1&service=activity', expect: [200], label: 'activity spa' },
  { path: '/docs', expect: [200], label: 'documentation overview' },
  { path: '/docs/okx-ai', expect: [200], label: 'OKX AI documentation' },
  { path: '/polydesk?service=worldcup', expect: [200], label: 'worldcup spa' },
  { path: '/api/pulse', expect: [200], label: 'pulse intelligence' },
  { path: '/api/poly-stream', expect: [200], label: 'poly stream' },
  { path: '/api/poly-worldcup-news', expect: [200], label: 'world cup news' },
  { path: '/api/a2mcp/services', expect: [200], label: 'agent service catalog' },
  { path: '/api/a2mcp/okx/polymarket-lp-scout', expect: [402, 503], label: 'okx ai lp scout payment gate' },
  { path: '/api/a2mcp/football-live-data', expect: [402, 503], label: 'football live data payment gate' },
  { path: '/api/a2mcp/football-live-data', method: 'POST', body: {}, expect: [402, 503], label: 'football live data POST payment gate' },
  { path: '/api/a2mcp/football-news-brief', expect: [402, 503], label: 'football news payment gate' },
  { path: '/api/a2mcp/football-news-brief', method: 'POST', body: {}, expect: [402, 503], label: 'football news POST payment gate' },
  { path: '/api/a2mcp/polymarket-funding-link', expect: [402, 503], label: 'funding link payment gate' },
  { path: '/api/a2mcp/polymarket-funding-link', method: 'POST', body: {}, expect: [402, 503], label: 'funding link POST payment gate' },
  { path: '/api/a2mcp/polymarket-portfolio-watch', method: 'POST', body: {}, expect: [402, 503], label: 'legacy portfolio watch payment gate' },
  { path: '/api/a2mcp/polymarket-agent-flow', method: 'POST', body: {}, expect: [400, 503], label: 'governed trader preflight' },
  { path: '/api/polymarket-agent-flow', expect: [200], label: 'governed trader public flow' },
  { path: '/api/a2mcp/worldcup-live-scores', method: 'POST', body: {}, expect: [402, 503], label: 'legacy world cup live data payment gate' },
  { path: '/api/a2mcp/worldcup-market-news', method: 'POST', body: {}, expect: [402, 503], label: 'legacy world cup news payment gate' },
  { path: '/api/a2mcp/polymarket-governed-open', method: 'POST', body: {}, expect: [404], label: 'retired duplicate governed service' },
  { path: '/api/polymarket-open/prepare', method: 'POST', body: {}, expect: [400], label: 'signed open intent preparation' },
  { path: '/api/polymarket-signed-open/validate', method: 'POST', body: {}, expect: [400], label: 'signed open free validation' },
  { path: '/api/polymarket-governed-open/authorize', method: 'POST', body: {}, expect: [400], label: 'governed mandate authorization preparation' },
  { path: '/api/polymarket-governed-open/validate', method: 'POST', body: {}, expect: [400], label: 'governed open free validation' },
  { path: '/api/agent-activity?id=missing-scout-id', expect: [404], label: 'agent activity is ID scoped' },
  { path: '/api/x402/polymarket-scout', expect: [200, 400, 402, 500, 503], label: 'lp scout mounted' },
]

let failed = false

for (const check of checks) {
  const url = `${baseUrl}${check.path}`
  try {
    const method = check.method || 'GET'
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json,text/html',
        ...(check.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(check.body ? { body: JSON.stringify(check.body) } : {}),
    })
    const ok = check.expect.includes(response.status)
    const body = await response.text().catch(() => '')
    const detail = body.replace(/\s+/g, ' ').slice(0, 180)
    console.log(`${ok ? 'ok' : 'fail'} ${response.status} ${check.label} ${method} ${check.path}${detail ? ` :: ${detail}` : ''}`)
    if (!ok) failed = true
  } catch (error) {
    failed = true
    console.log(`fail request ${check.label} ${check.path} :: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failed) {
  console.error(`\nPolyDesk smoke failed for ${baseUrl}`)
  process.exit(1)
}

console.log(`\nPolyDesk smoke passed for ${baseUrl}`)
