import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { writeAuditDeliveryBundle, type AuditCompilation } from '../api/polydesk-audit-delivery.js'
import { buildPolyDeskConformanceAuditReport } from '../api/polydesk-integration-conformance-audit.js'

// Local compilation and optional artifact export only: no task authentication,
// evidence collection/verification, marketplace delivery, payment, or signing.
export async function runAuditReportCli(args: string[], read: (path: string) => Promise<string> = path => readFile(path, 'utf8')) {
  if (![2, 4].includes(args.length) || args[0] !== '--request' || !args[1] || args[1].startsWith('--')
    || (args.length === 4 && (args[2] !== '--out-dir' || !args[3] || args[3].startsWith('--')))) {
    throw new Error('Usage: npm run audit:report -- --request <sanitized-audit-input.json> [--out-dir <new-directory>]')
  }
  const result: AuditCompilation = {
    serviceId: '40363',
    report: buildPolyDeskConformanceAuditReport(JSON.parse(await read(args[1]))),
    evidenceIndependentlyVerified: false,
    marketplaceDelivered: false,
    taskPaymentVerified: false,
    priceIsListedServicePrice: true,
    tradeAuthorized: false,
    followUpPrompts: ['Show audit findings and untested controls.', 'Inspect the original JSON and evidence manifest.', 'Request a specific correction or review delivery through the official task workflow.'],
    afterAcceptancePrompts: ['Review the remediation plan.', 'Define a separate re-audit scope after fixes.'],
  }
  if (args.length === 4) {
    const deliveryBundle = await writeAuditDeliveryBundle(args[3], result)
    return { ...result, deliveryBundle }
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(await runAuditReportCli(process.argv.slice(2)), null, 2)}\n`)
  } catch {
    // Never echo potentially sensitive input or parser error snippets.
    process.stderr.write('Audit report rejected. Check request arguments, sanitized schema, and a new writable output directory. A partial bundle is not deliverable. No task was delivered.\n')
    process.exitCode = 1
  }
}
