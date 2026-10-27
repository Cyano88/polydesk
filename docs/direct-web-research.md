# PolyDesk direct source retrieval

Ordinary market research now calls Tavily directly for cited web evidence, then sends screened excerpts to the existing direct 0G research adapter. ZeroScout is not called. Retrieval/excerpt logic is adapted from the project's former ZeroScout service; the existing result shape is preserved.

Reuse the existing Tavily key. The adapter accepts POLYDESK_SEARCH_API_KEY, TAVILY_API_KEY or the original ZEROSCOUT_GENERAL_SEARCH_API_KEY (in that priority order); no new key is required. The value must be available to the PolyDesk Render service, not only to the former ZeroScout host. This is separate from POLYDESK_0G_API_KEY. Do not put either key in frontend variables or chat. No new library installation is required.

Each uncached research lookup makes three bounded searches: resolution authority, current evidence and contradictory evidence. Deterministic queries avoid an extra paid model call. Advanced search uses up to five results per query. The in-memory cache lasts ten minutes, is capped at 256 entries, and is scoped by a credential hash. No automatic retries. Tavily sees public market search terms; wallet, payment and trade-side fields are not included in search bodies. This retrieval path is not enabled for VeilDesk's private worker.

The host is fixed to https://api.tavily.com/search. Redirects are rejected, response bodies capped at 1 MB, and each call times out after 25 seconds. Sources retain URLs and reported publication times. Retrieval time never substitutes for an unknown publication time. Existing source screening excludes duplicate links, stale/future/undated material from current evidence and unsuitable source types; recency alone is not factual verification. Retrieved text remains untrusted input.

No key or retrieval failure produces an evidence gap through the existing engine, not fabricated articles. Search results do not create archive proofs or trade authorization.

Validation: direct retrieval tests cover payload minimization, caching, date preservation, filtering, missing credentials, malformed requests, HTTP failures, oversized bodies and invalid sources. Together with the existing research engine, 58 tests passed; server type-check passed. A live retrieval test remains pending the search key.

API reference: https://docs.tavily.com/documentation/api-reference/endpoint/search