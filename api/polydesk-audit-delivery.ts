import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { PolyDeskConformanceAuditReport } from './polydesk-integration-conformance-audit.js'

export type AuditCompilation = {
  serviceId: '40363'
  report: PolyDeskConformanceAuditReport
  evidenceIndependentlyVerified: false
  marketplaceDelivered: false
  taskPaymentVerified: false
  priceIsListedServicePrice: true
  tradeAuthorized: false
  followUpPrompts: string[]
  afterAcceptancePrompts: string[]
}

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const quote = (value: string) => value.split(/\r?\n/).map(line => '> ' + line.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&')).join('\n')

export function renderAuditFindings(result: AuditCompilation) {
  const r = result.report
  const sections = [
    '# Integration audit findings',
    `Report: ${r.reportId}\n\nTask: ${r.jobId}\n\nBuyer: ${r.buyerAgentId}\n\nGenerated: ${r.generatedAt}`,
    '## Scope', quote(r.integration.name), quote(r.integration.platformUrl),
    quote('Assessed version: ' + (r.integration.assessedVersion ?? 'Not specified; confirm the agreed version before delivery.')),
    '## Assessment and limitations',
    `Declared verdict: **${r.verdict}**. This is compiled from supplied findings; evidence has not been independently verified by this tool.`,
    quote(r.boundary),
    'The 25 USDT amount is the listed service price, not proof of payment or the amount agreed for a particular task. No task has been delivered, accepted, paid, or authorized to trade by this export.',
    '## Controls',
  ]
  for (const f of r.controls) {
    sections.push(`### ${f.control}: ${f.status}`, quote(f.summary), quote('Evidence: ' + (f.evidenceIds.join(', ') || 'None')))
    if (f.remediation) sections.push('Remediation:', quote(f.remediation))
  }
  sections.push('## Alignment checks')
  for (const f of r.checks) {
    sections.push(`### ${f.id}: ${f.status}`, quote(f.summary), quote('Evidence: ' + (f.evidenceIds.join(', ') || 'None')))
    if (f.remediation) sections.push('Remediation:', quote(f.remediation))
  }
  sections.push('## Evidence manifest')
  for (const e of r.evidenceManifest) {
    sections.push(quote(`${e.id} | ${e.kind} | captured ${e.capturedAt}\nSHA-256: ${e.sha256}\nSource: ${e.source ?? 'Not supplied'}\n${e.summary}`))
  }
  sections.push('## Review next steps', ...result.followUpPrompts.map(quote),
    '## After separately verified acceptance and settlement', ...result.afterAcceptancePrompts.map(quote),
    'Use audit-report.json as the original structured compilation. delivery-manifest.json binds this summary and the JSON by hash. Their hashes prove file integrity, not factual accuracy. Corrections must preserve these originals and identify what changed.')
  return sections.join('\n\n') + '\n'
}

export async function writeAuditDeliveryBundle(directory: string, result: AuditCompilation) {
  const outputDirectory = resolve(directory)
  const reportText = JSON.stringify(result, null, 2) + '\n'
  const summaryText = renderAuditFindings(result)
  // Claim a fresh directory; existing paths (including symlinks) never overwrite a delivery.
  await mkdir(outputDirectory, { mode: 0o700 })
  const artifacts = []
  for (const [name, content, mediaType] of [
    ['audit-report.json', reportText, 'application/json'],
    ['findings.md', summaryText, 'text/markdown'],
  ] as const) {
    await writeFile(join(outputDirectory, name), content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    const saved = await readFile(join(outputDirectory, name))
    if (hash(saved) !== hash(content)) throw new Error('Audit artifact write verification failed.')
    artifacts.push({ name, mediaType, bytes: saved.length, sha256: hash(saved) })
  }
  const manifest = {
    schema: 'polydesk-audit-delivery-manifest-v1',
    reportId: result.report.reportId, jobId: result.report.jobId, buyerAgentId: result.report.buyerAgentId,
    generatedAt: result.report.generatedAt, evidenceIndependentlyVerified: false,
    marketplaceDelivered: false, taskPaymentVerified: false, artifacts,
  }
  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  // Manifest is written last. A partial directory is not a completed delivery bundle.
  await writeFile(join(outputDirectory, 'delivery-manifest.json'), manifestText, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  if (hash(await readFile(join(outputDirectory, 'delivery-manifest.json'))) !== hash(manifestText)) throw new Error('Manifest verification failed.')
  return { outputDirectory, artifacts, manifestSha256: hash(manifestText), marketplaceDelivered: false }
}
