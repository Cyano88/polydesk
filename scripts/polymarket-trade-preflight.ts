import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
const args = process.argv.slice(2)
const get = (name: string) => args[args.indexOf(name) + 1]
try {
 for (const key of ['--market-slug', '--outcome', '--max-total', '--price']) if (!args.includes(key)) throw new Error(`Missing ${key}`)
 const { stdout } = await run(process.env.POLYMARKET_ONCHAINOS_BIN || 'onchainos', ['wallet', 'addresses', '--chain', '137'], { timeout: 20_000, maxBuffer: 100_000 })
 const envelope = JSON.parse(stdout)
 const addresses = envelope.data?.evm?.filter((x: any) => x.chainIndex === '137')
 if (envelope.ok !== true || addresses?.length !== 1) throw new Error('Active Polygon signing wallet could not be verified.')
 const response = await fetch('https://polydesk.trade/api/polymarket-account/trade-preflight', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000),
 body: JSON.stringify({ ownerAddress: addresses[0].address, marketSlug: get('--market-slug'), outcome: get('--outcome'), maxTotalUsdc: get('--max-total'), limitPrice: get('--price') }) })
 const result = await response.json()
 if (!response.ok || result.ok !== true) throw new Error(result.error || `Preflight HTTP ${response.status}`)
 console.log(JSON.stringify(result, null, 2))
 if (!result.publicChecksPassed) process.exitCode = 2
} catch (error) {
 const text = error instanceof Error ? error.message : 'Preflight failed'
 console.log(JSON.stringify({ ok: false, orderAuthorized: false, publicChecksPassed: false, error: /BadRecordMac|TLS|connection error/i.test(text) ? 'OKX_CONNECTION_FAILED: no signing or order attempted' : text.slice(0, 500) }))
 process.exitCode = 1
}
