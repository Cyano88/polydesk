import { DocHeader, Section, Code } from './components'
export default function DocsVeilDesk() {
 return <><DocHeader title="VeilDesk by PolyDesk" description="Private preview mandates for prediction-market applications." />
 <Section title="SDK integration"><p>PolyDesk uses the VeilDesk SDK to encrypt preview mandates for its cloud provider and verify returned results. The provider checks mandate structure and bounds. It does not verify markets, produce research, settle ZEC or execute trades.</p></Section>
 <Section title="Authenticated API"><p>Send a Privy access token as a Bearer token to <Code>POST /api/veildesk/previews</Code>. Retrieve your result using <Code>GET /api/veildesk/previews/:id</Code>. Requests require a UUID, dry_run mode, market, side, maximum spend, limit price, expiry and preview_only approval. Retry with the exact same ID and contents.</p><p><a href="https://github.com/Cyano88/polydesk/blob/main/docs/VEILDESK_INTEGRATION.md" className="underline">Read the API and operator guide</a>.</p></Section>
 <Section title="Privacy"><p>PolyDesk receives your plaintext mandate over HTTPS, then encrypts it for the provider. The relay handles encrypted payloads; the provider can decrypt them. Only the authenticated owner can retrieve the result through PolyDesk. This does not conceal public trades or guarantee anonymity.</p></Section>
 <Section title="Agent interfaces"><p>The downloadable skill and local MCP tool expose capability discovery. They do not submit mandates. OKX.AI listing and shielded payment acceptance remain pending.</p></Section></>
}

