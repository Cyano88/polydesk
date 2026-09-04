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

const footballExample = `curl -X POST https://polydesk.trade/api/a2mcp/worldcup-live-scores \\
  -H "content-type: application/json" \\
  -d '{"team":"Real Madrid"}'`

const newsExample = `curl -X POST https://polydesk.trade/api/a2mcp/worldcup-market-news \\
  -H "content-type: application/json" \\
  -d '{"team":"Real Madrid","type":"prematch"}'`

export default function DocsOkxAI() {
  return (
    <article className="space-y-10">
      <DocHeader
        title="Buy one result or delegate the complete mission."
        description="PolyDesk Agent #5427 lets an agent buy one direct result, delegate one bounded trading task, or subscribe to recurring trading access without rebuilding PolyDesk infrastructure."
      />

      <Section title="Service map">
        <Table
          headers={['Service', 'Price', 'Endpoint']}
          rows={[
            ['PolyDesk Trading Agent #38484', '0.1 USDT / task', 'OKX A2A task'],
            ['PolyDesk Trading Membership #38496', '5 USDT / month, 3-day trial', 'OKX A2A task'],
            ['Polymarket LP Scout', '0.3 USDT', <Code>/api/a2mcp/okx/polymarket-lp-scout</Code>],
            ['Football Match Live Data', '0.1 USDT', <Code>/api/a2mcp/worldcup-live-scores</Code>],
            ['Football News Brief', '0.1 USDT', <Code>/api/a2mcp/worldcup-market-news</Code>],
            ['Verified Polymarket Funding', '0.1 USDT', <Code>/api/a2mcp/polymarket-funding-link</Code>],
            ['Governed Polymarket Trader', '0.1 USDT', <Code>/api/a2mcp/polymarket-portfolio-watch</Code>],
            ['Smart Market OOS Trader', '0.3 USDT', <Code>/api/a2mcp/polymarket-smart-trader</Code>],
          ]}
        />
        <Note>The one-off task and membership coordinate the same bounded mission. The six A2MCP services remain independent pay-per-call tools for agents that need only one result.</Note>
      </Section>

      <Section title="A2A governed trading">
        <p><strong>PolyDesk Trading Agent #38484</strong> provides one bounded mission for 0.1 USDT. <strong>PolyDesk Trading Membership #38496</strong> provides recurring access for 5 USDT per month with a 3-day trial. Both take a public watched wallet or exact BUY, the buyer owner EOA, and written spend, price and expiry limits.</p>
        <p>PolyDesk verifies the owner-derived Deposit Wallet, returns funding or collateral approval when required, and otherwise delivers one bounded Polymarket BUY signal. Paying for the service through OKX Agentic Wallet does not by itself prove that wallet can grant Polymarket approvals or sign the order; placement requires a compatible EVM signer controlling the verified Deposit Wallet.</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Publish a task with an explicit Polymarket BUY cap.</li>
          <li>PolyDesk waits for <Code>job_accepted</Code>.</li>
          <li>Select <Code>TRADE</Code>, <Code>POSITION</Code>, or <Code>AUTO_BEST_FIT</Code>.</li>
          <li>Complete the single returned readiness action, if any.</li>
          <li>The buyer validates the short-lived signal and places it with a compatible EVM signer under the written limits.</li>
          <li>Read the public open or realized PnL receipt.</li>
        </ol>
        <Note>AUTO_BEST_FIT ranks execution quality under explicit spread, depth, price and time rules. It is not a profit forecast. PolyDesk never receives wallet keys or reusable CLOB credentials.</Note>
      </Section>

      <Section title="Infrastructure roles">
        <Table
          headers={['Infrastructure', 'Role in this flow']}
          rows={[
            ['Polymarket', 'Provides markets, order books, positions, and public execution evidence.'],
            ['Sportmonks', 'Provides source-backed football fixtures, scores, events, and news.'],
            ['ZeroScout', 'Verifies and stores the intelligence attached to paid LP Scout results.'],
            ['Hash PayLink', 'Provides funding checkout, payment verification, settlement status, and receipts.'],
            ['OKX.AI', 'Distributes Agent #5427, its direct tools, and its governed A2A tasks.'],
            ['X Layer', 'Settles pay-per-use USDT payments for marketplace services.'],
          ]}
        />
      </Section>

      <Section title="How to call a service">
        <p>Discover the current, versioned contract at <Code>/.well-known/polydesk.json</Code> or <Code>/api/a2mcp/services</Code>. It declares service IDs, request schemas, prices, payment headers, recovery routes, custody boundaries, and return-routing rules.</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Choose the exact endpoint from the service map.</li>
          <li>Send the documented request and read the HTTP 402 challenge.</li>
          <li>Pay with OKX buyer tooling and replay the same request with the original business inputs.</li>
          <li>Store the returned machine-readable result or verified receipt.</li>
        </ol>
        <Note>OKX Agentic Wallet is the verified reference buyer. Another platform may orchestrate the same endpoints only if its payment adapter satisfies the issued challenge. PolyDesk does not accept arbitrary webhook or return URLs; asynchronous results use declared status and receipt endpoints.</Note>
      </Section>

      <Section title="Try the football services">
        <p>Both calls validate provider coverage before issuing a payment challenge. The team filter is optional; unsupported teams return a non-billable not-found response instead of unrelated data.</p>
        <CodeBlock lang="bash">{footballExample}</CodeBlock>
        <CodeBlock lang="bash">{newsExample}</CodeBlock>
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
          <li>Use the free validator. Call the governed marketplace endpoint only when the result is <Code>APPROVE</Code>.</li>
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
