import { Link } from 'react-router-dom'
import { Code, CodeBlock, Note, Section, Table } from './components'

const publicWatchExample = `https://polydesk.trade/polydesk?service=portfolio&portfolio=watch`

export default function DocsOverview() {
  return (
    <article className="space-y-12">
      <header className="border-b border-gray-200 pb-9 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">PolyDesk product guide</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-5xl">From a live signal to a verified action.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300">PolyDesk helps you find what is happening on Polymarket, understand public positions, fund the correct account, and act without giving PolyDesk your private keys.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="inline-flex min-h-11 items-center rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200" to="/polydesk?service=pulse">Open Pulse</Link>
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/[0.06]" to="/polydesk?agent=1">Ask the Agent</Link>
        </div>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Browse first. Connect only when you want to use your own account, sign, pay, or save something.</p>
      </header>

      <Section title="Choose what you want to do">
        <Table
          headers={['Your goal', 'Start here']}
          rows={[
            ['Find a live market or football opportunity', <Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=pulse">Open Pulse</Link>],
            ['Understand what a public Polymarket account owns', <Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=portfolio&portfolio=watch">Open Watch</Link>],
            ['Research markets that may qualify for liquidity rewards', <Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=lp-scout">Open LP Scout</Link>],
            ['Fund your account or another verified account', <Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=portfolio&portfolio=external">Open Tip</Link>],
            ['Let PolyDesk direct you to the right tool', <Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?agent=1">Ask the Agent</Link>],
          ]}
        />
      </Section>

      <Section title="Start with the product">
        <p>These are the main PolyDesk surfaces, in the same order you see them in the app.</p>
        <Table
          headers={['Surface', 'What it does', 'Sign-in boundary']}
          rows={[
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=pulse">Pulse</Link>, 'Shows current market and football signals with the information needed to decide what to inspect next.', 'Public to browse.'],
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=portfolio&portfolio=trading&wallet=positions">Overview</Link>, 'Brings your Polymarket balance, positions, orders, and account readiness into one workspace.', 'Connect when viewing your own account.'],
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?agent=1">Agent</Link>, 'Turns a plain-language request into the shortest supported PolyDesk flow or exact service link.', 'Public guidance; wallet actions remain buyer-controlled.'],
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=lp-scout">LP Scout</Link>, 'Researches active Polymarket liquidity opportunities and prepares a reviewable quote rather than promising a reward.', 'Browse first; pay only when requesting the report.'],
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=portfolio&portfolio=watch">Watch</Link>, 'Reads a public Polymarket account so you can inspect its positions before deciding whether to act.', 'Public address lookup; sign in only to save private preferences or alerts.'],
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=portfolio&portfolio=external">Tip</Link>, 'Prepares a verified funding route for another Polymarket account without asking for its private keys.', 'Checkout requires the payer to authorize payment.'],
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/polydesk?service=activity">Activity</Link>, 'Keeps the user-facing trail for research, funding, trades, and receipts that PolyDesk can verify.', 'Public proofs can be opened directly; private account history requires its owner.'],
            [<Link className="font-semibold text-gray-950 hover:underline dark:text-white" to="/rewards">Rewards</Link>, 'Explains eligible campaigns and verified-use requirements when a campaign is open.', 'Claims require wallet verification. Claims are currently disabled.'],
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

      <Section title="Infrastructure behind PolyDesk">
        <p>PolyDesk combines focused product surfaces with infrastructure that has one clear responsibility in the workflow.</p>
        <Table
          headers={['Infrastructure', 'What PolyDesk uses it for']}
          rows={[
            ['Polymarket', 'Live markets, order books, public positions, and execution evidence.'],
            ['Sportmonks', 'Source-backed football fixtures, scores, events, and news.'],
            ['ZeroScout', 'Verified intelligence and stored proof for paid LP Scout results.'],
            ['Hash PayLink', 'Funding checkout, payment verification, settlement status, and receipts.'],
            ['OKX.AI', 'Agent #5427 discovery, direct services, and governed trading tasks.'],
            ['X Layer', 'USDT settlement for pay-per-use marketplace services.'],
          ]}
        />
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
        <p><Link className="font-medium text-blue-700 hover:underline dark:text-blue-400" to="/docs/okx-ai">Continue to the OKX.AI service guide</Link></p>
      </Section>

      <Section title="Plain-English glossary">
        <Table
          headers={['Term', 'Meaning']}
          rows={[
            ['Position', 'A YES or NO outcome that an account currently owns.'],
            ['Liquidity', 'Orders available for other people to buy or sell against.'],
            ['LP Scout', 'Research that checks market depth, spread, reward rules, and risk before you place liquidity orders.'],
            ['Deposit Wallet', 'The Polymarket funding address derived for a specific owner wallet. PolyDesk verifies the match before creating a checkout.'],
            ['Governed trade', 'A trade checked against written limits such as maximum spend, price, market, and expiry before it can proceed.'],
            ['Receipt', 'The payment or execution evidence returned after a completed action.'],
          ]}
        />
      </Section>

      <Section title="Trust boundary">
        <p>PolyDesk accepts public market inputs, public wallet addresses, signed orders, and bounded mandates. It does not accept private keys, seed phrases, CLOB secrets, or CLOB passphrases.</p>
        <Note>The buyer remains the signer. PolyDesk checks the requested action against the written limits and verifies the terminal public evidence.</Note>
      </Section>
    </article>
  )
}
