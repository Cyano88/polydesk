import { Link } from 'react-router-dom'
import { Code, CodeBlock, DocHeader, Note, Section, Table } from './components'

const publicWatchExample = `https://polydesk.trade/polydesk?service=portfolio&portfolio=watch`

export default function DocsOverview() {
  return (
    <article className="space-y-12">
      <DocHeader
        title="Use PolyDesk"
        description="Browse live Polymarket opportunities, inspect accounts, ask the Agent, research LP markets, fund a verified account, and keep a record of each action. Sign in only when an action needs your wallet or private account state."
      />

      <Section title="Start with the product">
        <p>These are the main PolyDesk surfaces, in the same order you see them in the app.</p>
        <Table
          headers={['Surface', 'What it does', 'Sign-in boundary']}
          rows={[
            [<Link className="font-semibold text-gray-950 hover:underline" to="/polydesk?service=pulse">Pulse</Link>, 'Shows current market and football signals with the information needed to decide what to inspect next.', 'Public to browse.'],
            [<Link className="font-semibold text-gray-950 hover:underline" to="/polydesk?service=portfolio&portfolio=trading&wallet=positions">Overview</Link>, 'Brings your Polymarket balance, positions, orders, and account readiness into one workspace.', 'Connect when viewing your own account.'],
            [<Link className="font-semibold text-gray-950 hover:underline" to="/polydesk?agent=1">Agent</Link>, 'Turns a plain-language request into the shortest supported PolyDesk flow or exact service link.', 'Public guidance; wallet actions remain buyer-controlled.'],
            [<Link className="font-semibold text-gray-950 hover:underline" to="/polydesk?service=lp-scout">LP Scout</Link>, 'Researches active Polymarket liquidity opportunities and prepares a reviewable quote rather than promising a reward.', 'Browse first; pay only when requesting the report.'],
            [<Link className="font-semibold text-gray-950 hover:underline" to="/polydesk?service=portfolio&portfolio=watch">Watch</Link>, 'Reads a public Polymarket account so you can inspect its positions before deciding whether to act.', 'Public address lookup; sign in only to save private preferences or alerts.'],
            [<Link className="font-semibold text-gray-950 hover:underline" to="/polydesk?service=portfolio&portfolio=external">Tip</Link>, 'Prepares a verified funding route for another Polymarket account without asking for its private keys.', 'Checkout requires the payer to authorize payment.'],
            [<Link className="font-semibold text-gray-950 hover:underline" to="/polydesk?service=activity">Activity</Link>, 'Keeps the user-facing trail for research, funding, trades, and receipts that PolyDesk can verify.', 'Public proofs can be opened directly; private account history requires its owner.'],
            [<Link className="font-semibold text-gray-950 hover:underline" to="/rewards">Rewards</Link>, 'Explains eligible campaigns and verified-use requirements when a campaign is open.', 'Claims require wallet verification. Claims are currently disabled.'],
          ]}
        />
        <Note>Browsing does not require a landing-page login. PolyDesk asks for authentication only at the point where ownership, signing, payment, a saved alert, or private account data must be verified.</Note>
      </Section>

      <Section title="A simple first visit">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open <strong>Pulse</strong> and choose a market or football signal.</li>
          <li>Use <strong>Watch</strong> to inspect a public account, or open <strong>LP Scout</strong> for liquidity research.</li>
          <li>Ask the <strong>Agent</strong> when you want PolyDesk to route you to the correct flow.</li>
          <li>Connect your wallet only when you want to view your Overview, authorize funding, sign a trade, save an alert, or claim an eligible reward.</li>
          <li>Return to <strong>Activity</strong> for the receipt or public proof produced by a completed action.</li>
        </ol>
      </Section>

      <Section title="Where Hash PayLink fits">
        <p>PolyDesk is the market workspace. Hash PayLink is the payment and checkout infrastructure used when a PolyDesk action needs funding, x402 payment verification, settlement status, or a receipt.</p>
        <Table
          headers={['PolyDesk step', 'Hash PayLink responsibility']}
          rows={[
            ['LP Scout report', 'Creates and verifies the hosted agent checkout before PolyDesk releases the paid report.'],
            ['Polymarket funding', 'Presents the supported payment route only after PolyDesk verifies the owner-derived Deposit Wallet.'],
            ['Payment status', 'Returns authoritative checkout and settlement state to PolyDesk.'],
            ['Receipt', 'Provides the payment proof PolyDesk binds to the resulting activity or report.'],
          ]}
        />
        <Note>PolyDesk never asks for a seed phrase, private key, or reusable Polymarket CLOB credential. The checkout opens on an allowlisted Hash PayLink origin, and the payer authorizes the payment there.</Note>
      </Section>

      <Section title="Public account lookup">
        <p>Watch accepts a public Polymarket address. Open the page below, paste the address, and review the returned positions before taking any action.</p>
        <CodeBlock>{publicWatchExample}</CodeBlock>
      </Section>

      <Section title="For agents and developers">
        <p>The public machine catalog lists the five direct services, their exact inputs and outputs, prices, free preparation calls, and safety boundaries.</p>
        <CodeBlock>{`curl https://polydesk.trade/api/a2mcp/services`}</CodeBlock>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Need information only? Use Football Match Live Data, Football News Brief, or LP Scout.</li>
          <li>Need account funding? Use Verified Polymarket Funding with the owner EOA.</li>
          <li>Need a governed trade? Read <Code>/api/polymarket-agent-flow</Code> and follow its single <Code>nextAction</Code>.</li>
        </ol>
        <p><Link className="font-medium text-blue-700 hover:underline" to="/docs/okx-ai">Continue to the OKX.AI service guide →</Link></p>
      </Section>

      <Section title="Trust boundary">
        <p>PolyDesk accepts public market inputs, public wallet addresses, signed orders, and bounded mandates. It does not accept private keys, seed phrases, CLOB secrets, or CLOB passphrases.</p>
        <Note>The buyer remains the signer. PolyDesk checks the requested action against the written limits and verifies the terminal public evidence.</Note>
      </Section>
    </article>
  )
}
