import assert from 'node:assert/strict'
import test from 'node:test'
import { runAuditReportCli } from './polydesk-integration-audit-operator.js'
import { POLYDESK_CONFORMANCE_CONTROLS } from '../api/polydesk-integration-conformance-audit.js'

test('audit operator produces an incomplete report without claiming verification or delivery', async () => {
  const result = await runAuditReportCli(['--request', 'fixture.json'], async () => JSON.stringify({
    jobId: `0x${'1'.repeat(64)}`, buyerAgentId: '8178', integrationName: 'Local fixture',
    platformUrl: 'https://example.com', generatedAt: '2026-09-09T12:00:00Z',
    evidence: [{ id: 'scope', sha256: 'a'.repeat(64), capturedAt: '2026-09-09T11:00:00Z', kind: 'attached-file', summary: 'Scope only.' }],
    findings: POLYDESK_CONFORMANCE_CONTROLS.map(control => ({ control, status: 'not-tested', summary: 'Not tested.', evidenceIds: [] })),
  }))
  assert.equal(result.serviceId, '40363')
  assert.equal(result.report.verdict, 'INCOMPLETE')
  assert.equal(result.evidenceIndependentlyVerified, false)
  assert.equal(result.marketplaceDelivered, false)
  assert.equal(result.tradeAuthorized, false)
})

test('audit operator rejects execution flags before reading input', async () => {
  for (const args of [[], ['--request'], ['--request', '--execute'], ['--request', 'fixture.json', '--execute']]) {
    await assert.rejects(runAuditReportCli(args, async () => { assert.fail('must not read') }), /Usage:/)
  }
})

test('audit operator rejects malformed and credential-bearing input', async () => {
  await assert.rejects(runAuditReportCli(['--request', 'fixture.json'], async () => '{'))
  await assert.rejects(runAuditReportCli(['--request', 'fixture.json'], async () => JSON.stringify({ apiKey: 'fixture' })), /credentials/)
})
