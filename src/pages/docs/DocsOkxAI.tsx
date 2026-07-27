import { Code, CodeBlock, DocHeader, Note, Section, Table } from './components'

const flowExample = `curl -X POST https://polydesk.trade/api/polymarket-agent-flow \\
  -H "content-type: application/json" \\
  -d '{
    "action": "PREPARE",
    "selectionMode": "AUTO_BEST_FIT",
    "watchedWallet": "0xPUBLIC_WALLET",
    "ownerAddress": "0xBUYER_OWNER_EOA",
    "maxSpendUsdc": "5",
    "orderType": "FAK",
    "selectionPolicy": {
      "maximumPrice": 0.65,
      "maximumSpread": 0.05,
      "minimumDepthUsdc": 10,
      "minimumHoursToResolution": 24,
      "maximumBookAgeSeconds": 30
    }
  }'`

export default function DocsOkxAI() {
  return (
    <article className="space-y-10">
      <DocHeader
        title="OKX.AI marketplace services"
        description="PolyDesk Agent #5427 exposes five focused x402 services. Information products are reusable JSON. Funding and trading services fail before payment when preflight checks do not pass."
      />

      <Section title="Service map">
        <Table
          headers={['Service', 'Price', 'Endpoint']}
          rows={[
            ['Polymarket LP Scout', '0.3 USDT', <Code>/api/a2mcp/okx/polymarket-lp-scout</Code>],
            ['Football Match Live Data', '0.1 USDT', <Code>/api/a2mcp/football-live-data</Code>],
            ['Football News Brief', '0.1 USDT', <Code>/api/a2mcp/football-news-brief</Code>],
            ['Verified Polymarket Funding', '0.1 USDT', <Code>/api/a2mcp/polymarket-funding-link</Code>],
            ['Governed Polymarket Trader', '0.1 USDT', <Code>/api/a2mcp/polymarket-agent-flow</Code>],
          ]}
        />
        <Note>Prices shown here match the intended marketplace configuration. An unpaid call returns an OKX x402 challenge only after service-specific preflight succeeds.</Note>
      </Section>

      <Section title="How x402 calls work">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Call the service without a payment header.</li>
          <li>Read the HTTP 402 challenge and non-empty <Code>accepts</Code> entry for USDT on X Layer.</li>
          <li>Pay with OKX buyer tooling and replay the exact request body.</li>
          <li>Consume the HTTP 200 machine-readable deliverable.</li>
        </ol>
      </Section>

      <Section title="Copy-paste governed trader preparation">
        <p>This free call selects a public position under explicit execution-quality rules, derives the buyer Deposit Wallet from its owner EOA, checks live readiness, and returns exactly one next action.</p>
        <CodeBlock lang="bash">{flowExample}</CodeBlock>
        <p>The response will direct the agent to <Code>FUND</Code>, <Code>APPROVE_COLLATERAL</Code>, or <Code>SIGN</Code>. It never describes execution-quality ranking as a profit forecast.</p>
      </Section>

      <Section title="Complete the governed trade">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Sign the exact market order locally.</li>
          <li>Request and sign the mandate message from <Code>/api/polymarket-governed-open/authorize</Code>.</li>
          <li>Use the free validator. Pay the governed x402 endpoint only when the result is <Code>APPROVE</Code>.</li>
          <li>Submit the returned exact payload directly to Polymarket.</li>
          <li>Send the <Code>executionId</Code>, Polymarket <Code>orderId</Code>, and Polygon <Code>transactionHash</Code> to <Code>/api/polymarket-agent-flow/complete</Code>.</li>
          <li>Sign the returned completion message and replay it. The receipt becomes publicly readable at <Code>/api/polymarket-agent-flow/receipt/&#123;executionId&#125;</Code>.</li>
        </ol>
      </Section>

      <Section title="What the receipt proves">
        <p>The terminal receipt binds the decision, order, and mandate hashes to a successful Polygon transaction, an allowlisted Polymarket V2 exchange, the exact order ID, and a matching public BUY for the exact outcome token within the approved bounds.</p>
      </Section>
    </article>
  )
}
