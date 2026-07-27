import { Link } from 'react-router-dom'
import { Code, CodeBlock, DocHeader, Note, Section, Table } from './components'

export default function DocsOverview() {
  return (
    <article className="space-y-10">
      <DocHeader
        title="PolyDesk documentation"
        description="PolyDesk gives agents current Polymarket research, verified football context, safe account funding, and a buyer-controlled route from a public signal to a governed trade receipt."
      />

      <Section title="What PolyDesk does">
        <Table
          headers={['Capability', 'What an agent receives']}
          rows={[
            ['Football data', 'Provider-truth fixtures, scores, events, and matched Polymarket trade metadata.'],
            ['Football news', 'Current source-linked headlines and related active Polymarket event slugs where confidently matched.'],
            ['LP research', 'Maker-oriented limit-order research for active reward markets.'],
            ['Verified funding', 'Owner EOA to Deposit Wallet verification before any checkout is created.'],
            ['Governed trading', 'Watch, pick, or copy; check readiness; apply deterministic limits; submit directly; verify the fill.'],
          ]}
        />
      </Section>

      <Section title="The trust boundary">
        <p>PolyDesk accepts public market inputs, public wallet addresses, signed orders, and bounded mandates. It does not accept private keys, seed phrases, CLOB secrets, or CLOB passphrases.</p>
        <Note>The buyer agent remains the signer and submits approved orders directly to Polymarket. PolyDesk verifies the policy and the terminal public evidence.</Note>
      </Section>

      <Section title="Discover the machine catalog">
        <p>Start with the public catalog. It lists the five supported services, exact endpoints, prices, inputs, outputs, free preparation steps, and safety boundary.</p>
        <CodeBlock>{`curl https://polydesk.trade/api/a2mcp/services`}</CodeBlock>
      </Section>

      <Section title="Choose the shortest path">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Need reusable information? Call Football Match Live Data, Football News Brief, or LP Scout.</li>
          <li>Need to fund a buyer account? Call Verified Polymarket Funding with the owner EOA.</li>
          <li>Need to trade? Read <Code>/api/polymarket-agent-flow</Code> and follow its single <Code>nextAction</Code>.</li>
        </ol>
        <p><Link className="font-medium text-blue-700 hover:underline" to="/docs/okx-ai">Continue to the OKX.AI service guide →</Link></p>
      </Section>
    </article>
  )
}
