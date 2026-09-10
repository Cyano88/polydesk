import { POLYDESK_ALIGNMENT_CHECKS } from '../api/polydesk-alignment-checks.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPolyDeskConformanceAuditReport, POLYDESK_CONFORMANCE_AUDIT_PRICE_USDT, POLYDESK_CONFORMANCE_CONTROLS, type PolyDeskConformanceAuditInput } from '../api/polydesk-integration-conformance-audit.js'

function validInput(): PolyDeskConformanceAuditInput {
  return {
    jobId: `0x${'1'.repeat(64)}`,
    buyerAgentId: '8178',
    integrationName: 'Example Polymarket Agent',
    platformUrl: 'https://agent.example/integrations/polymarket',
    assessedVersion: '2026.09.04',
    generatedAt: '2026-09-04T17:00:00.000Z',
    evidence: [{ id: 'runtime-readiness', sha256: 'a'.repeat(64), capturedAt: '2026-09-04T16:55:00.000Z', kind: 'runtime-response', source: 'https://agent.example/api/polymarket/readiness', summary: 'Sanitized readiness response captured during the assessment.' }],
    checks: POLYDESK_ALIGNMENT_CHECKS.map(check => ({ id: check.id, status: 'pass' as const, summary: check.requirement, evidenceIds: ['runtime-readiness'] })),
    findings: POLYDESK_CONFORMANCE_CONTROLS.map(control => ({ control, status: 'pass' as const, summary: `${control} control produced the expected bounded response.`, evidenceIds: ['runtime-readiness'] })),
  }
}

test('creates a deterministic evidence-linked report at the 25 USDT launch price', () => {
  const first = buildPolyDeskConformanceAuditReport(validInput())
  const second = buildPolyDeskConformanceAuditReport(validInput())
  assert.equal(first.reportId, second.reportId)
  assert.match(first.reportId, /^pcia_[a-f0-9]{32}$/)
  assert.equal(first.verdict, 'CONFORMANT')
  assert.deepEqual(first.counts, { pass: 6, fail: 0, notTested: 0 })
  assert.equal(first.price.amountUsdt, POLYDESK_CONFORMANCE_AUDIT_PRICE_USDT)
})

test('requires remediation for a failed control', () => {
  const input = validInput()
  input.findings[2] = { ...input.findings[2], status: 'fail' }
  assert.throws(() => buildPolyDeskConformanceAuditReport(input), /requires remediation/)
  input.findings[2].remediation = 'Require an exact signed mandate before every financial action.'
  assert.equal(buildPolyDeskConformanceAuditReport(input).verdict, 'NON_CONFORMANT')
})

test('marks an untested mandatory control incomplete', () => {
  const input = validInput()
  input.findings[4] = { ...input.findings[4], status: 'not-tested', evidenceIds: [] }
  assert.equal(buildPolyDeskConformanceAuditReport(input).verdict, 'INCOMPLETE')
})

test('rejects unknown evidence, duplicate controls, and credential fields', () => {
  const unknown = validInput(); unknown.findings[0].evidenceIds = ['missing-proof']
  assert.throws(() => buildPolyDeskConformanceAuditReport(unknown), /unknown evidence/)
  const duplicate = validInput(); duplicate.findings[1].control = 'payment'
  assert.throws(() => buildPolyDeskConformanceAuditReport(duplicate), /Duplicate control/)
  assert.throws(() => buildPolyDeskConformanceAuditReport({ ...validInput(), apiKey: 'forbidden' } as PolyDeskConformanceAuditInput), /must not contain credentials/)
})

test('requires safe URLs and evidence dated no later than the report', () => {
  const unsafe = validInput(); unsafe.platformUrl = 'http://agent.example'
  assert.throws(() => buildPolyDeskConformanceAuditReport(unsafe), /credential-free HTTPS URL/)
  const future = validInput(); future.evidence[0].capturedAt = '2026-09-04T18:00:00.000Z'
  assert.throws(() => buildPolyDeskConformanceAuditReport(future), /dated after the report/)
})

test('legacy broad controls cannot certify the new trading and memory flow', () => {
  const input = validInput()
  delete input.checks
  const report = buildPolyDeskConformanceAuditReport(input)
  assert.equal(report.schemaVersion, '1.1.0')
  assert.equal(report.verdict, 'INCOMPLETE')
  assert.equal(report.checks.filter(check => check.status === 'not-tested').length, POLYDESK_ALIGNMENT_CHECKS.length)
})

test('alignment failures change verdict and report identity', () => {
  const input = validInput()
  const original = buildPolyDeskConformanceAuditReport(input)
  input.checks![4] = { ...input.checks![4], status: 'fail', remediation: 'Block replay until exact finalized receipt reconciliation.' }
  const failed = buildPolyDeskConformanceAuditReport(input)
  assert.equal(failed.verdict, 'NON_CONFORMANT')
  assert.notEqual(failed.reportId, original.reportId)
  delete input.checks![4].remediation
  assert.throws(() => buildPolyDeskConformanceAuditReport(input), /require remediation/)
})

test('scope exclusions require evidence and cannot hide omitted checks', () => {
  const input = validInput()
  input.checks![6] = { id: 'sibyl-owner-isolation', status: 'not-applicable', summary: 'Assessed version has no receipt-memory integration; architecture evidence establishes this scope.', evidenceIds: ['runtime-readiness'] }
  assert.equal(buildPolyDeskConformanceAuditReport(input).verdict, 'CONFORMANT')
  input.checks![6].evidenceIds = []
  assert.throws(() => buildPolyDeskConformanceAuditReport(input), /require evidence/)
  input.checks![6].evidenceIds = ['missing']
  assert.throws(() => buildPolyDeskConformanceAuditReport(input), /unknown evidence/)
})

test('duplicate alignment results are rejected', () => {
  const input = validInput()
  input.checks![1] = input.checks![0]
  assert.throws(() => buildPolyDeskConformanceAuditReport(input), /duplicate alignment/)
})
