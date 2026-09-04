import { createHash } from 'node:crypto'

export const POLYDESK_CONFORMANCE_AUDIT_PRICE_USDT = 25
export const POLYDESK_CONFORMANCE_CONTROLS = ['payment', 'wallet', 'authorization', 'execution', 'recovery', 'receipts'] as const

export type PolyDeskConformanceControl = typeof POLYDESK_CONFORMANCE_CONTROLS[number]
export type PolyDeskConformanceStatus = 'pass' | 'fail' | 'not-tested'

export type PolyDeskConformanceEvidence = {
  id: string
  sha256: string
  capturedAt: string
  kind: 'public-url' | 'attached-file' | 'transaction' | 'runtime-response'
  source?: string
  summary: string
}

export type PolyDeskConformanceFinding = {
  control: PolyDeskConformanceControl
  status: PolyDeskConformanceStatus
  summary: string
  evidenceIds: string[]
  remediation?: string
}

export type PolyDeskConformanceAuditInput = {
  jobId: string
  buyerAgentId: string
  integrationName: string
  platformUrl: string
  assessedVersion?: string
  generatedAt: string
  evidence: PolyDeskConformanceEvidence[]
  findings: PolyDeskConformanceFinding[]
}

export type PolyDeskConformanceAuditReport = {
  schema: 'polydesk-integration-conformance-report'
  schemaVersion: '1.0.0'
  reportId: string
  jobId: string
  buyerAgentId: string
  integration: { name: string; platformUrl: string; assessedVersion?: string }
  generatedAt: string
  price: { amountUsdt: 25; billing: 'per-task' }
  verdict: 'CONFORMANT' | 'NON_CONFORMANT' | 'INCOMPLETE'
  counts: { pass: number; fail: number; notTested: number }
  controls: PolyDeskConformanceFinding[]
  evidenceManifest: PolyDeskConformanceEvidence[]
  boundary: string
}

const secretKeyPattern = /private[_-]?key|seed[_-]?phrase|mnemonic|api[_-]?key|client[_-]?secret|authorization|cookie|payment[_-]?signature|clob[_-]?credential/i

function clean(value: unknown, label: string, maxLength: number) {
  const result = String(value ?? '').trim()
  if (!result) throw new Error(`${label} is required.`)
  if (result.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters.`)
  return result
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  for (const key of Object.keys(value)) {
    if (secretKeyPattern.test(key)) throw new Error(`${label} must not contain credentials or signing material.`)
    if (!allowed.includes(key)) throw new Error(`${label} contains unsupported field ${key}.`)
  }
}

function safeHttpsUrl(value: unknown, label: string) {
  const text = clean(value, label, 512)
  let url: URL
  try { url = new URL(text) } catch { throw new Error(`${label} must be a valid HTTPS URL.`) }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} must be a credential-free HTTPS URL.`)
  return url.toString()
}

function isoTimestamp(value: unknown, label: string) {
  const text = clean(value, label, 40)
  const timestamp = new Date(text)
  if (!Number.isFinite(timestamp.getTime())) throw new Error(`${label} must be an ISO-8601 timestamp.`)
  return timestamp.toISOString()
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function buildPolyDeskConformanceAuditReport(raw: PolyDeskConformanceAuditInput): PolyDeskConformanceAuditReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Audit input must be an object.')
  assertAllowedKeys(raw as unknown as Record<string, unknown>, ['jobId', 'buyerAgentId', 'integrationName', 'platformUrl', 'assessedVersion', 'generatedAt', 'evidence', 'findings'], 'Audit input')
  const jobId = clean(raw.jobId, 'jobId', 66).toLowerCase()
  if (!/^0x[a-f0-9]{64}$/.test(jobId)) throw new Error('jobId must be a 32-byte 0x-prefixed identifier.')
  const buyerAgentId = clean(raw.buyerAgentId, 'buyerAgentId', 20)
  if (!/^\d+$/.test(buyerAgentId)) throw new Error('buyerAgentId must be numeric.')
  const integrationName = clean(raw.integrationName, 'integrationName', 120)
  const platformUrl = safeHttpsUrl(raw.platformUrl, 'platformUrl')
  const assessedVersion = raw.assessedVersion ? clean(raw.assessedVersion, 'assessedVersion', 80) : undefined
  const generatedAt = isoTimestamp(raw.generatedAt, 'generatedAt')
  const generatedTime = new Date(generatedAt).getTime()

  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0 || raw.evidence.length > 100) throw new Error('evidence must contain between 1 and 100 entries.')
  const evidenceIds = new Set<string>()
  const evidence = raw.evidence.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`evidence[${index}] must be an object.`)
    assertAllowedKeys(item as unknown as Record<string, unknown>, ['id', 'sha256', 'capturedAt', 'kind', 'source', 'summary'], `evidence[${index}]`)
    const id = clean(item.id, `evidence[${index}].id`, 80)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)) throw new Error(`evidence[${index}].id is invalid.`)
    if (evidenceIds.has(id)) throw new Error(`Duplicate evidence id ${id}.`)
    evidenceIds.add(id)
    const sha256 = clean(item.sha256, `evidence[${index}].sha256`, 64).toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`evidence[${index}].sha256 must be a SHA-256 digest.`)
    const capturedAt = isoTimestamp(item.capturedAt, `evidence[${index}].capturedAt`)
    if (new Date(capturedAt).getTime() > generatedTime + 300_000) throw new Error(`evidence[${index}] is dated after the report.`)
    if (!['public-url', 'attached-file', 'transaction', 'runtime-response'].includes(item.kind)) throw new Error(`evidence[${index}].kind is invalid.`)
    const source = item.source ? item.kind === 'public-url' || item.kind === 'runtime-response' ? safeHttpsUrl(item.source, `evidence[${index}].source`) : clean(item.source, `evidence[${index}].source`, 512) : undefined
    return { id, sha256, capturedAt, kind: item.kind, ...(source ? { source } : {}), summary: clean(item.summary, `evidence[${index}].summary`, 500) }
  })

  if (!Array.isArray(raw.findings) || raw.findings.length !== POLYDESK_CONFORMANCE_CONTROLS.length) throw new Error(`findings must contain exactly ${POLYDESK_CONFORMANCE_CONTROLS.length} controls.`)
  const seenControls = new Set<PolyDeskConformanceControl>()
  const findings = raw.findings.map((finding, index) => {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) throw new Error(`findings[${index}] must be an object.`)
    assertAllowedKeys(finding as unknown as Record<string, unknown>, ['control', 'status', 'summary', 'evidenceIds', 'remediation'], `findings[${index}]`)
    if (!POLYDESK_CONFORMANCE_CONTROLS.includes(finding.control)) throw new Error(`findings[${index}].control is invalid.`)
    if (seenControls.has(finding.control)) throw new Error(`Duplicate control ${finding.control}.`)
    seenControls.add(finding.control)
    if (!['pass', 'fail', 'not-tested'].includes(finding.status)) throw new Error(`findings[${index}].status is invalid.`)
    if (!Array.isArray(finding.evidenceIds)) throw new Error(`findings[${index}].evidenceIds must be an array.`)
    const linkedEvidence = [...new Set(finding.evidenceIds.map(value => clean(value, `findings[${index}].evidenceIds`, 80)))]
    for (const id of linkedEvidence) if (!evidenceIds.has(id)) throw new Error(`findings[${index}] references unknown evidence ${id}.`)
    if (finding.status !== 'not-tested' && linkedEvidence.length === 0) throw new Error(`findings[${index}] requires evidence for a ${finding.status} result.`)
    const remediation = finding.remediation ? clean(finding.remediation, `findings[${index}].remediation`, 1000) : undefined
    if (finding.status === 'fail' && !remediation) throw new Error(`findings[${index}] requires remediation for a failed control.`)
    return { control: finding.control, status: finding.status, summary: clean(finding.summary, `findings[${index}].summary`, 1000), evidenceIds: linkedEvidence, ...(remediation ? { remediation } : {}) }
  })

  const counts = { pass: findings.filter(item => item.status === 'pass').length, fail: findings.filter(item => item.status === 'fail').length, notTested: findings.filter(item => item.status === 'not-tested').length }
  const verdict = counts.fail ? 'NON_CONFORMANT' : counts.notTested ? 'INCOMPLETE' : 'CONFORMANT'
  const reportCore = { jobId, buyerAgentId, integration: { name: integrationName, platformUrl, ...(assessedVersion ? { assessedVersion } : {}) }, generatedAt, findings, evidence }
  const reportId = `pcia_${createHash('sha256').update(canonicalJson(reportCore)).digest('hex').slice(0, 32)}`
  return { schema: 'polydesk-integration-conformance-report', schemaVersion: '1.0.0', reportId, jobId, buyerAgentId, integration: reportCore.integration, generatedAt, price: { amountUsdt: 25, billing: 'per-task' }, verdict, counts, controls: findings, evidenceManifest: evidence, boundary: 'This report assesses supplied and independently captured integration evidence. It is not a profitability guarantee, legal opinion, or formal security certification.' }
}
