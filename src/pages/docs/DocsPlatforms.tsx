import { Code, CodeBlock, DocHeader, Note, Section, Table } from './components'

const discoveryExample = `curl https://polydesk.trade/.well-known/polydesk.json
curl https://polydesk.trade/api/v1/capabilities
curl https://polydesk.trade/api/v1/openapi.json
curl "https://polydesk.trade/api/v1/markets?q=Manchester%20United"`

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
        <Note>Three core A2A products cover one-off trading, managed monitoring and integration audits. LP Scout and Football Live Data remain specialist paid services. Check each route for price, network and supported actions.</Note>
      </Section>

      <Section title="Public API foundation">
        <p>The v1 API provides free capability discovery and market search without wallet login. Read <Code>/api/v1/openapi.json</Code> for the implemented contract. Results include request IDs and structured follow-up actions; market candidates never authorize a trade.</p>
        <p>Use <Code>q</Code> for concise keywords and optional <Code>intent</Code> for the original request. Review truncation, market rules and schedule-verification requirements before selecting a candidate. Unknown or repeated query parameters are rejected.</p>
        <Note>Partner-scoped free market-discovery jobs are available with provisioned credentials. Partner research reservations bind to the existing paid Base service. MCP, external subscriptions and unified fee-inclusive previews are planned. They are not enabled v1 endpoints. Existing paid HTTP capabilities retain their own contracts; an A2MCP route name does not imply an MCP server.</Note>
      </Section>

      <Section title="Paid research for agents and platforms">
        <p>Installing the PolyDesk skill is free. Backend ANALYZE costs 0.30 native USDC on Base, subject to review of the live payment challenge. A partner key does not pay this fee. Public marketplace buyers use the canonical x402 endpoint without a partner key.</p>
        <p>Direct partners reserve with <Code>POST /api/v1/research-jobs</Code>, a stable <Code>Idempotency-Key</Code> and their bearer credential. Send the same ANALYZE body, credential and returned <Code>X-PolyDesk-Research-Job</Code> header to the Base payment endpoint. Research starts only after verified settlement. Read the saved job after a disconnect; reconcile the original payment instead of paying again.</p>
        <p>After explicit buyer agreement, record acceptance with <Code>POST /api/v1/research-jobs/&#123;id&#125;/acceptance</Code>, the original analysis hash, exact correction revision hash (or null), and limitation acknowledgement. Acceptance survives restart and stays scoped to the partner application. It never authorizes trading.</p>
        <p>Show findings and original JSON before review. Report defects through the job correction endpoint under the original payment. Further correction rounds reference the latest published revision hash and preserve earlier findings. Follow the returned eligibility and prompts; pending corrections block acceptance. A correction request does not issue a refund. Research payment and acceptance never authorize a trade.</p>
        <p><a href="/skills/polydesk/references/paid-research.md">Read the payment, gas checks, recovery and follow-up contract</a>.</p>
      </Section>

      <Section title="Partner jobs and recovery">
        <p>Ask the PolyDesk operator to provision an application-scoped partner key. Keep it server-side. Use <Code>POST /api/v1/jobs</Code> with a stable <Code>Idempotency-Key</Code> and <Code>Authorization: Bearer</Code> credential. The supported capability is <Code>market-discovery</Code>, with an <Code>input</Code> object containing <Code>q</Code> and optional <Code>intent</Code>.</p>
        <p>Save the returned job ID. Read <Code>GET /api/v1/jobs/&#123;id&#125;</Code> after a disconnect. Retry creation with the same key and inputs to recover a lost response; changed inputs conflict. Use <Code>POST /api/v1/jobs/&#123;id&#125;/resume</Code> to resume interrupted free searches after the 60-second lease expires. Three attempts are allowed. Completed jobs return their saved result.</p>
        <Note>These jobs are free public market searches. They do not buy AI research or authorize trading. Storage is persistent; polling reads status and does not restart work. Keys grant access only to their own tenant and application.</Note>
      </Section>

      <Section title="Signing and costs">
        <p>Onchain OS is the reference signer. Authenticate its Agentic Wallet in your own agent environment only when that signer is needed. Public discovery requires no wallet login, and paid research is optional for the existing independently approved preparation path.</p>
        <p>Off-chain order signing requires no blockchain gas. Funding, approvals and other on-chain operations may require gas or verified sponsorship. Before execution, check the trading balance or sell inventory, all applicable service and trading fees, and who pays gas. Unknown costs or failed sponsorship must block continuation until a fresh approved plan is available.</p>
        <p>Research payment, delivery acceptance and exact trade approval remain separate decisions. Present findings first, then offer acceptance or correction; offer a trade preview, decline or further research afterwards.</p>
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
        <p>Hash PayLink handles its integrated funding checkout and receipts. Base research uses CDP x402 USDC settlement; OKX tasks follow their marketplace payment contract. Polymarket remains the execution and public market-state boundary.</p>
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
