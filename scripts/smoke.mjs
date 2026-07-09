const baseUrl = String(process.env.POLYDESK_SMOKE_URL ?? process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

const checks = [
  { path: '/api/health', expect: [200], label: 'health' },
  { path: '/polydesk?service=portfolio', expect: [200], label: 'portfolio spa' },
  { path: '/polydesk?service=worldcup', expect: [200], label: 'worldcup spa' },
  { path: '/api/poly-stream', expect: [200], label: 'poly stream' },
  { path: '/api/poly-worldcup-news', expect: [200], label: 'world cup news' },
  { path: '/api/agent-wallet?agent=polydesk-agent', expect: [200, 400, 404, 503], label: 'agent wallet mounted' },
  { path: '/api/x402/polymarket-scout', expect: [200, 400, 402, 500, 503], label: 'lp scout mounted' },
]

let failed = false

for (const check of checks) {
  const url = `${baseUrl}${check.path}`
  try {
    const response = await fetch(url, { headers: { accept: 'application/json,text/html' } })
    const ok = check.expect.includes(response.status)
    const body = await response.text().catch(() => '')
    const detail = body.replace(/\s+/g, ' ').slice(0, 180)
    console.log(`${ok ? 'ok' : 'fail'} ${response.status} ${check.label} ${check.path}${detail ? ` :: ${detail}` : ''}`)
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
