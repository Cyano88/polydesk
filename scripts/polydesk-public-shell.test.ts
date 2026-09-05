import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const app = read('../src/App.tsx')
const productApp = read('../src/ProductApp.tsx')
const integrations = read('../src/pages/Integrations.tsx')
const docsLayout = read('../src/pages/docs/DocsLayout.tsx')
const docsPlatforms = read('../src/pages/docs/DocsPlatforms.tsx')
const docsOkx = read('../src/pages/docs/DocsOkxAI.tsx')
const report = read('../src/pages/LPScoutReport.tsx')
const manifest = read('../api/a2mcp-services.ts')

test('public browser surface contains only foundation, integration, docs, continuation and evidence routes', () => {
  assert.match(app, /path="\/" element=\{<About \/>\}/)
  assert.match(app, /path="\/integrations" element=\{<Integrations \/>\}/)
  assert.match(app, /path="\/docs" element=\{<DocsLayout \/>\}/)
  assert.match(app, /path="\/docs\/platforms"|path="platforms"/)
  assert.match(app, /path="\/continue\/lp-scout"/)
  assert.match(app, /path="\/report\/lp-scout\/:activityId"/)
  assert.match(app, /path="\/polydesk" element=\{<Navigate to="\/integrations" replace \/>\}/)
  assert.match(app, /path="\/rewards" element=\{<Navigate to="\/integrations" replace \/>\}/)
  assert.doesNotMatch(app, /pages\/(?:PolyDesk|Pulse|OkxRewards)|PolyDeskLayout/)
  assert.doesNotMatch(productApp, /PrivyProvider|requiresPrivy/)
})

test('platform onboarding is canonical and does not promise a consumer web app', () => {
  assert.match(integrations, /to='\/docs\/platforms'/)
  assert.match(docsLayout, /Platform quickstart/)
  assert.match(docsPlatforms, /PAYMENT-REQUIRED/)
  assert.match(docsPlatforms, /PAYMENT-SIGNATURE/)
  assert.match(docsPlatforms, /A service payment is not trading authorization/)
  assert.match(manifest, /technicalGuide: baseUrl \+ '\/docs\/platforms'/)
  assert.match(manifest, /docs: '\/docs\/platforms'/)
  assert.doesNotMatch(docsOkx, /Use the PolyDesk web app|reference experience/)
})

test('public reports provide evidence without an embedded consumer order ticket', () => {
  assert.match(report, /PolyDesk LP Scout Report/)
  assert.match(report, /Open proof/)
  assert.doesNotMatch(report, /PolymarketLimitOrderTicket|Place limit order/)
})

test('retired consumer modules are deleted rather than left as a second product surface', () => {
  for (const path of [
    '../src/layouts/PolyDeskLayout.tsx',
    '../src/pages/PolyDesk.tsx',
    '../src/pages/Pulse.tsx',
    '../src/pages/TelegramPaymentLinks.tsx',
    '../src/components/PolymarketLimitOrderTicket.tsx',
    '../src/lib/PrivyLoginProvider.tsx',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, path)
  }
})
