import { Code, CodeBlock, DocHeader, Note, Section, Table } from './components'

const discoveryExample = `curl https://polydesk.trade/.well-known/polydesk.json
curl https://polydesk.trade/api/a2mcp/services`

const paymentExample = `# 1. Send the original JSON request and inspect the 402 response.
curl -i -X POST <service-endpoint> \\
  -H "content-type: application/json" \\
  --data @request.json

# 2. After the buyer approves and signs the challenge, replay the same request.
curl -i -X POST <service-endpoint> \\
  -H "content-type: application/json" \\
  -H "PAYMENT-SIGNATURE: <signed-payment>" \\
  --data @request.json`

export default function DocsPlatforms() {
  return (
    <article className="space-y-10">
      <DocHeader
        title="Integrate PolyDesk without replacing your product."
        description="Keep your interface, users, identity, and signing flow. PolyDesk supplies typed Polymarket services, bounded decisions, and portable evidence."
      />

      <Section title="Start with discovery">
        <p>Read the versioned manifest at runtime. Select a declared product or compatibility capability and use its published endpoint and request schema.</p>
        <CodeBlock lang="bash">{discoveryExample}</CodeBlock>
        <Note>Products are the three customer-facing offers. Capabilities are implementation routes and should not be marketed as additional PolyDesk products.</Note>
      </Section>

      <Section title="Minimum platform contract">
        <Table
          headers={['Your platform', 'PolyDesk']}
          rows={[
            ['Owns user identity, interface, consent, and signer access.', 'Validates typed inputs, market state, readiness, and limits.'],
            ['Shows each payment or financial authorization before signing.', 'Returns a payment challenge or one bounded next action.'],
            ['Preserves request IDs and polls declared status or receipt URLs.', 'Publishes machine-readable state and terminal evidence.'],
            ['Stores an operator-approved integration source.', 'Resolves email and human return links from an allowlist.'],
          ]}
        />
      </Section>

      <Section title="Payment and replay">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Send the complete business request once.</li>
          <li>On HTTP <Code>402</Code>, inspect <Code>PAYMENT-REQUIRED</Code> and present it to the buyer.</li>
          <li>Sign only after approval, then replay the unchanged business inputs with <Code>PAYMENT-SIGNATURE</Code>.</li>
          <li>Store the returned result, status URL, and receipt URL.</li>
        </ol>
        <CodeBlock lang="bash">{paymentExample}</CodeBlock>
        <Note>Never send private keys, seed phrases, or reusable Polymarket CLOB credentials. A service payment is not trading authorization.</Note>
      </Section>

      <Section title="Financial actions">
        <p>Funding and trading remain separate from service payment. PolyDesk may return <Code>FUND</Code>, <Code>APPROVE_COLLATERAL</Code>, or <Code>SIGN</Code>; your compatible EVM signer must authorize the exact action under the buyer's written limits.</p>
        <p>Hash PayLink remains the hosted funding, payment verification, settlement-status, and receipt boundary. Polymarket remains the execution and public market-state boundary.</p>
      </Section>

      <Section title="Production checklist">
        <Table
          headers={['Control', 'Required behavior']}
          rows={[
            ['Schema', 'Reject unknown or ambiguous inputs before payment whenever possible.'],
            ['Idempotency', 'Reuse the original request identifier for retries and paid replay.'],
            ['Authorization', 'Bind outcome, side, amount, price, expiry, and signer to one mandate.'],
            ['Delivery', 'Poll declared state; do not infer completion from payment or elapsed time.'],
            ['Evidence', 'Store terminal receipts and public execution references.'],
            ['Return routing', 'Configure your HTTPS destination with the PolyDesk operator; caller-supplied URLs are rejected.'],
          ]}
        />
      </Section>

      <Section title="Current reference integration">
        <p>OKX Agentic Wallet is the verified reference buyer, and PolyDesk Agent #5427 is the current marketplace distribution channel. Other platforms can implement the same contract with a compatible payment adapter and buyer-controlled signer.</p>
      </Section>
    </article>
  )
}
