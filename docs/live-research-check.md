# Live research acceptance

Run from PolyDesk's deployed build with its existing server environment:

```sh
node --import tsx scripts/verify-live-research.mjs --live CONDITION_ID Yes BUY
```

Use an exact public market condition ID and outcome. The explicit `--live` flag acknowledges live public-data requests and paid inference. This operator-only script is not an HTTP endpoint, marketplace purchase, or authorization bypass for customers. It creates no service payment or trade.

The check invokes the actual `runPolymarketTaskResearch` engine with production dependencies. Success requires the exact market/outcome, a live two-sided order book, retrieved sources, available 0G research, a nonempty report, no fabricated archive proof, and research-only output with no buyer screening mandate or order authority. An `INSUFFICIENT` assessment can pass: evidence gaps must not be converted into a recommendation merely to make a test green.

Output contains counts, actual compute verification metadata, and a report digest, not credentials, prompt text or report prose. The process exits nonzero on failure and has a two-minute deadline. It does not retry. Run a bounded check on Render when local networking is unreliable; a successful local adapter call alone is not full-engine acceptance.

This check does not verify an authenticated customer purchase, encrypted transport, TEE attestation, ZEC settlement, or production sign-in. VeilDesk's separately gated private provider must satisfy those requirements before accepting paid private research.

## GLM-5.3 response controls

The adapter explicitly requests low reasoning for glm-5.3, using the top-level reasoning_effort and matching vLLM chat-template setting. GLM-5.3 does not support disabling reasoning and otherwise defaults to max. Sources: https://docs.z.ai/guides/llm/glm-5.3 and https://recipes.vllm.ai/zai-org/GLM-5.3 . Other configured models keep the prior request settings. The 3,000-token cap, 60-second inference timeout, strict result schema and no automatic retry policy are unchanged.

Choose a currently active market with a verified two-sided book before running this acceptance check. A valid model report on an outcome lacking a bid or ask will correctly fail the separate live-order-book checkpoint. Research-only consumers can still receive evidence gaps on such markets; acceptance failure does not grant or remove trade authority.
