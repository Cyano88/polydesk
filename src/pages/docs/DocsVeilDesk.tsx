import { DocHeader, Section, Code, CodeBlock, Table, Note } from './components'
export default function DocsVeilDesk() {
 return <article className="space-y-10">
 <DocHeader title="VeilDesk integrations" description="Private coordination for agent services: authenticated requests, encrypted delivery and request-bound shielded ZEC settlement." />
 <Section title="Who does what">
 <p>A buyer agent requests a service from PolyDesk. PolyDesk owns market research, retrieval and inference. VeilDesk authenticates and encrypts coordination, binds invoices to requests, verifies settlement evidence and returns encrypted results. Research never authorizes a trade.</p>
 <p><a className="underline" href="https://veildesk-relay.onrender.com/">Explore VeilDesk</a> · <a className="underline" href="https://veildesk-relay.onrender.com/demo.mp4">Watch the recorded pilot</a> · <a className="underline" href="https://github.com/Cyano88/veildesk">Source code</a></p>
 <Note>One controlled mainnet research purchase completed on 28 October 2026. Paid access is restricted to the enrolled pilot buyer. This is not an open paid research endpoint, a marketplace listing or an independently audited production service.</Note>
 </Section>
 <Section title="Choose the right integration">
 <Table headers={['Interface', 'Available scope', 'Access']} rows={[
 ['PolyDesk discovery and skill', 'Discover capabilities and validate encrypted-envelope structure. No research or payments.', 'GET /api/veildesk; /skills/veildesk/SKILL.md'],
 ['PolyDesk preview HTTP API', 'Submit and retrieve bounded, unpaid preview mandates. No research or execution.', 'Privy bearer token; preview API must be enabled.'],
 ['PolyDesk local MCP', 'veildesk_capabilities only. Discovery; no submission.', 'scripts/veildesk-mcp.ts in the PolyDesk repository.'],
 ['Standalone VeilDesk MCP', 'Capabilities, submit preview, get preview. No paid research or wallet tools.', 'scripts/mcp-server.mjs in the VeilDesk repository; enrolled client config.'],
 ['Standalone paid research SDK', 'Authenticated invoice, request-bound settlement verification, encrypted report retrieval.', 'Operator-enrolled buyer, pinned keys, durable state; controlled mainnet pilot.'],
 ['PolyDesk provider adapter', 'Runs the PolyDesk research engine for an authorized service request.', 'Internal provider worker, not a public purchase endpoint.'],
 ]} />
 </Section>
 <Section title="Discovery and envelope validation">
 <CodeBlock>{'curl https://polydesk.trade/api/veildesk'}</CodeBlock>
 <p>Read current capabilities before invoking an interface. <Code>POST /api/veildesk/validate</Code> accepts encrypted envelope fields only: version, id, direction, ephemeralPublicKey, salt, iv and ciphertext. A successful response validates structure, not signatures, decryption, delivery or payment. It always reports <Code>acceptedForResearch: false</Code>.</p>
 <p>The discovery manifest's available/unavailable lists describe this public discovery surface. The separately enrolled paid pilot does not make these public endpoints payment-capable. Do not send plaintext briefs or credentials to the envelope validator.</p>
 </Section>
 <Section title="Authenticated preview API">
 <p>Send a Privy access token as a Bearer token to <Code>POST /api/veildesk/previews</Code>. Retrieve the verified result or pending state using <Code>GET /api/veildesk/previews/:id</Code>. Check <Code>previewApi.enabled</Code> in discovery first.</p>
 <CodeBlock lang="json">{JSON.stringify({schema:'veildesk.mandate.v1',id:'<new UUID>',mode:'dry_run',market:'market-slug',side:'YES',maxSpendUsd:'1.00',limitPrice:'0.5',expiresAt:0,approval:'preview_only'},null,2)}</CodeBlock>
 <p>Replace expiry with a future Unix timestamp in milliseconds within one hour. Submit exactly these fields. The provider checks mandate structure and bounds; it does not verify the market, produce research, accept ZEC or execute an order.</p>
 <p>Submission returns 202 and the ID. Missing authentication returns 401; another owner's result returns 404; an already-owned ID returns 409. Retry uncertain requests with the exact same ID and contents. A 503 does not prove the request was never delivered.</p>
 <Note>This HTTP API receives plaintext over HTTPS. PolyDesk and the authorized provider can see the mandate. PolyDesk encrypts it for the relay and returns decrypted results only to the authenticated owner. It is not browser-to-provider encryption.</Note>
 </Section>
 <Section title="Paid service request: separately enrolled SDK">
 <p>The standalone VeilDesk <Code>createPaidResearchClient</Code> uses a private configuration and persistent state directory. Enrollment pins the buyer identity, provider signing/encryption keys, relay, network and payment ceiling. The paid capability is <Code>polydesk.research.mainnet-paid.v1</Code>.</p>
 <CodeBlock lang="json">{JSON.stringify({id:'<new UUID>',expiresAt:0,request:{schema:'veildesk.service-request.v1',service:'polydesk.market-research.v1',input:{marketId:'<market identifier>',outcome:'<outcome>',side:'BUY'},disclosure:'polydesk-provider-disclosure-v2',executionAuthorized:false}},null,2)}</CodeBlock>
 <p>Use a future expiry within one hour. BUY or SELL expresses the research perspective; it grants no trading authority. The buyer submits the signed purchase, authenticates the invoice, separately authorizes payment, then retrieves and verifies the encrypted result. <Code>submitPaymentHint</Code> supplies an existing transaction reference; it does not send ZEC.</p>
 <p>Wallet preparation and broadcast are separate operator actions. Neither a skill, a preview mandate, an invoice nor an MCP call grants permission to spend. Do not substitute PolyDesk's public preview endpoint for the paid SDK.</p>
 </Section>
 <Section title="Provider integration and deployment">
 <p>PolyDesk's internal research adapter validates the service input, invokes its research engine and requires an AVAILABLE report with no order authorized or submitted. PolyDesk owns its 0G inference and retrieval configuration. VeilDesk does not own or relocate that research flow.</p>
 <p>The preview API uses <Code>VEILDESK_PREVIEW_ENABLED</Code>, <Code>VEILDESK_CLIENT_CONFIG</Code>, <Code>VEILDESK_CLIENT_STATE</Code> and existing Privy settings. Keys stay server-side; durable state and ownership reservations must survive deployment. The vendored preview SDK and the paid provider runtime are separately pinned components.</p>
 <p><a className="underline" href="https://github.com/Cyano88/polydesk/blob/main/docs/VEILDESK_INTEGRATION.md">Read schemas, deployment settings, retry rules and verification commands</a>.</p>
 </Section>
 <Section title="Evidence and privacy boundaries">
 <p>The completed mainnet pilot paid 0.0002 ZEC for research plus a 0.0001 ZEC network fee. Receipt verification recorded four confirmations; the buyer authenticated and decrypted an 11,784-byte report. Repeated retrieval returned the identical result. No trade was authorized or submitted.</p>
 <p>Wallet freshness checks delayed completion to about 23 minutes after broadcast. The public summary is sanitized operator evidence, not public proof of a private transaction or an independent security audit. Wallet/indexer observations are trusted; providers see authorized requests; IP addresses, timing and public market activity are not concealed. No independent inference-attestation claim is made.</p>
 <p><a className="underline" href="https://github.com/Cyano88/veildesk/blob/main/docs/mainnet-research-pilot-2026-10-28.md">Read the pilot record and limitations</a>.</p>
 </Section>
 <Section title="Marketplace and expansion">
 <p>PolyDesk is the first working service integration. VeilDesk is not yet listed on OKX AI and has no VeilDesk marketplace agent/service ID to invoke. Broader provider enrollment, service adapters and marketplace ZEC-payment eligibility remain planned. Infrastructure references are not partnership announcements.</p>
 </Section>
 </article>
}
