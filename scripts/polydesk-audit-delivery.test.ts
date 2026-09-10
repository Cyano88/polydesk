import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAuditReportCli } from './polydesk-integration-audit-operator.js'
import { POLYDESK_CONFORMANCE_CONTROLS } from '../api/polydesk-integration-conformance-audit.js'

const input = () => ({
  jobId: `0x${'1'.repeat(64)}`, buyerAgentId: '21', integrationName: 'Synthetic integration',
  platformUrl: 'https://example.com', assessedVersion: 'fixture-only', generatedAt: '2026-09-10T12:00:00Z',
  evidence: [{ id: 'scope', sha256: 'a'.repeat(64), capturedAt: '2026-09-10T11:00:00Z', kind: 'attached-file', summary: 'Synthetic scope evidence, not independent verification.' }],
  findings: POLYDESK_CONFORMANCE_CONTROLS.map(control => ({ control, status: 'not-tested', summary: 'Not tested.', evidenceIds: [] as string[] })),
})

test('bundle preserves exact original compilation, timestamps, boundaries and byte hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'polydesk-audit-bundle-'))
  try {
    const read = async () => JSON.stringify(input())
    const original = await runAuditReportCli(['--request', 'fixture.json'], read)
    const result = await runAuditReportCli(['--request', 'fixture.json', '--out-dir', join(root, 'delivery')], read)
    assert.ok('deliveryBundle' in result)
    const directory = result.deliveryBundle.outputDirectory
    const saved = JSON.parse(await readFile(join(directory, 'audit-report.json'), 'utf8'))
    assert.deepEqual(saved, original)
    assert.equal(saved.report.verdict, 'INCOMPLETE')
    assert.equal(saved.taskPaymentVerified, false)
    assert.equal(saved.marketplaceDelivered, false)
    const manifest = JSON.parse(await readFile(join(directory, 'delivery-manifest.json'), 'utf8'))
    assert.equal(manifest.jobId, original.report.jobId)
    assert.equal(manifest.buyerAgentId, original.report.buyerAgentId)
    assert.equal(manifest.reportId, original.report.reportId)
    for (const artifact of manifest.artifacts) {
      const bytes = await readFile(join(directory, artifact.name))
      assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256)
      assert.equal(bytes.length, artifact.bytes)
    }
    const summary = await readFile(join(directory, 'findings.md'), 'utf8')
    for (const control of original.report.controls) assert.ok(summary.includes(`### ${control.control}: ${control.status}`))
    for (const check of original.report.checks) assert.ok(summary.includes(`### ${check.id}: ${check.status}`))
    assert.match(summary, /not proof of payment/)
    assert.match(summary, /Review the remediation plan/)
    assert.match(summary, /not been independently verified/)
    await assert.rejects(runAuditReportCli(['--request', 'fixture.json', '--out-dir', directory], read), /EEXIST/)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'audit-report.json'), 'utf8')), original)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a failed control includes the specific remediation and links in readable output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'polydesk-audit-bundle-'))
  try {
    const fixture = input()
    const failure = { ...fixture.findings[0], status: 'fail', summary: 'A control failed.', evidenceIds: ['scope'], remediation: 'Fix the scoped control, then independently verify it.' }
    fixture.findings[0] = failure
    await runAuditReportCli(['--request', 'fixture.json', '--out-dir', join(root, 'delivery')], async () => JSON.stringify(fixture))
    const summary = await readFile(join(root, 'delivery/findings.md'), 'utf8')
    assert.match(summary, /NON_CONFORMANT/)
    assert.match(summary, /Fix the scoped control/)
    assert.match(summary, /Evidence: scope/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('untrusted Markdown in supplied summaries cannot replace generated verdict headings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'polydesk-audit-bundle-'))
  try {
    const fixture = input()
    fixture.findings[0].summary = '# CONFORMANT\n<script>unexpected</script>'
    await runAuditReportCli(['--request', 'fixture.json', '--out-dir', join(root, 'delivery')], async () => JSON.stringify(fixture))
    const summary = await readFile(join(root, 'delivery/findings.md'), 'utf8')
    assert.equal(summary.includes('\n# CONFORMANT'), false)
    assert.equal(summary.includes('<script>'), false)
    assert.match(summary, /Declared verdict: \*\*INCOMPLETE\*\*/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('invalid export flags are rejected before reading or creating files', async () => {
  for (const args of [ ['--request','x','--out-dir'], ['--request','x','--execute','x'], ['--request','x','--out-dir','--send'] ]) {
    await assert.rejects(runAuditReportCli(args, async () => { assert.fail('must not read') }), /Usage:/)
  }
})

test('an existing file path is not overwritten as an output directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'polydesk-audit-bundle-'))
  try {
    const target = join(root, 'preserve')
    await writeFile(target, 'original')
    await assert.rejects(runAuditReportCli(['--request', 'fixture', '--out-dir', target], async () => JSON.stringify(input())), /EEXIST/)
    assert.equal(await readFile(target, 'utf8'), 'original')
  } finally { await rm(root, { recursive: true, force: true }) }
})
