import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { buildPolyDeskConformanceAuditReport } from '../api/polydesk-integration-conformance-audit.js'

// Local compilation only: no task authentication, evidence collection,
// hash verification, marketplace delivery, payment, or signing.
export async function runAuditReportCli(args: string[], read: (path: string) => Promise<string> = path => readFile(path, 'utf8')) {
  if (args.length !== 2 || args[0] !== '--request' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Usage: npm run audit:report -- --request <sanitized-audit-input.json>')
  }
  return {
    serviceId: '40363',
    report: buildPolyDeskConformanceAuditReport(JSON.parse(await read(args[1]))),
    evidenceIndependentlyVerified: false,
    marketplaceDelivered: false,
    tradeAuthorized: false,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(await runAuditReportCli(process.argv.slice(2)), null, 2)}\n`)
  } catch {
    // Never echo potentially sensitive input or parser error snippets.
    process.stderr.write('Audit report rejected. Check request arguments and sanitized conformance-input schema. No task was delivered.\n')
    process.exitCode = 1
  }
}
