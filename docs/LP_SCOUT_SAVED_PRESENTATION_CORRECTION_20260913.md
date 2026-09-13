# Saved LP Scout presentation correction

This read-only report projection corrects the existing paid report without changing its stored activity, payment, or research JSON. The report API returns the original scout payload and a hash alongside a versioned evidence view (lp-evidence-v1).

The report page displays eight retained rejection records, the 80 scanned / zero passed counts, and the limitation that 72 rejection records are missing. It explains that spread eligibility is separate from overall safety, derives only rejection reasons supported by retained fields, and labels observations as historical. It does not invent the missing records, refresh market data, or claim an exhaustive scan.

The original JSON is expandable on the same report page. Text export includes the corrected scope, rejection explanations, and AI status. Original scout signals now remain visible when AI signals are absent. AI verification status is displayed separately from archive completion.

Validation: eight evidence/capability tests passed; server TypeScript and production frontend build passed. No new payment, research invocation, acceptance, trade, or message to Stacey was made. ZeroScout completion remains separate from this presentation fix.
