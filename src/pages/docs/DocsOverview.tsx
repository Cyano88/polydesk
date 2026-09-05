import { Link } from 'react-router-dom'
import { CodeBlock, Note, Section, Table } from './components'

export default function DocsOverview() {
  return (
    <article className="space-y-12">
      <header className="border-b border-gray-200 pb-9 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">PolyDesk integration guide</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-5xl">Integrate governed Polymarket services.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300">
          PolyDesk gives agents and platforms typed access to bounded trading, managed portfolio operations, and independent integration audits.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="inline-flex min-h-11 items-center rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200" to="/docs/okx-ai">OKX.AI services</Link>
          <a className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/[0.06]" href="/.well-known/polydesk.json">Public manifest</a>
        </div>
      </header>

      <Section title="Choose the service boundary">
        <Table
          headers={['Service', 'Use it for', 'Boundary']}
          rows={[
            ['One-Off Polymarket Trade', 'One bounded mission from intelligence through approval, execution handoff, and receipt.', 'Ends after one result.'],
            ['Managed Polymarket Agent', 'Continuous portfolio monitoring, email alerts, scheduled summaries, and optionally authorized copy trades.', 'Monitoring alone grants no trading authority.'],
            ['Polymarket Integration Audit', 'Evidence-backed review of an external platform wallet, payment, authorization, execution, recovery, and receipt flow.', 'Assessment, not a security certification or profit guarantee.'],
          ]}
        />
      </Section>

      <Section title="Integration sequence">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Discover the versioned manifest and select one declared service.</li>
          <li>Send the typed request with the market, account, limits, and originating-platform identity.</li>
          <li>Receive read-only results immediately or present the required buyer approval for a financial action.</li>
          <li>Track the returned task or subscription state instead of inferring completion.</li>
          <li>Store the terminal receipt and public execution evidence.</li>
        </ol>
        <Note>Financial actions remain buyer-controlled. PolyDesk does not accept private keys, seed phrases, reusable CLOB credentials, or arbitrary return URLs.</Note>
      </Section>

      <Section title="Machine interfaces">
        <Table
          headers={['Interface', 'Purpose']}
          rows={[
            ['/.well-known/polydesk.json', 'Versioned discovery document for products, capabilities, safety boundaries, and endpoints.'],
            ['/api/a2mcp/services', 'Machine-readable service catalog.'],
            ['/api/polymarket-agent-flow', 'Declared governed-trade lifecycle and integration contract.'],
            ['OKX.AI Agent #5427', 'Marketplace discovery, task lifecycle, subscriptions, payment, and reputation.'],
          ]}
        />
        <CodeBlock>{"curl https://polydesk.trade/.well-known/polydesk.json\ncurl https://polydesk.trade/api/a2mcp/services\ncurl https://polydesk.trade/api/polymarket-agent-flow"}</CodeBlock>
      </Section>

      <Section title="Authorization and settlement">
        <p>Read-only intelligence can complete without wallet authority. Funding and trading return a bounded next step that the buyer or originating platform must explicitly approve.</p>
        <Table
          headers={['Layer', 'Responsibility']}
          rows={[
            ['PolyDesk', 'Validates the request, market state, account readiness, limits, and terminal evidence.'],
            ['Originating platform', 'Owns its user experience, identity, approval presentation, and allowlisted return destination.'],
            ['Hash PayLink', 'Provides funding checkout, payment verification, settlement status, and payment receipts.'],
            ['Polymarket', 'Provides market state, order books, positions, and public execution evidence.'],
          ]}
        />
      </Section>

      <Section title="Start integrating">
        <p>Use the public manifest for protocol discovery and the OKX.AI guide for the current marketplace service IDs, task shapes, subscription lifecycle, and verification flow.</p>
        <p><Link className="font-medium text-blue-700 hover:underline dark:text-blue-400" to="/docs/okx-ai">Continue to the OKX.AI service guide</Link></p>
        <p><Link className="font-medium text-blue-700 hover:underline dark:text-blue-400" to="/integrations">Review products and integration boundaries</Link></p>
      </Section>
    </article>
  )
}
