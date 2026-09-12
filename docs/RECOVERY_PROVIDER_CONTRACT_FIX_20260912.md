# Recovery provider contract repair

The authorized X Layer recovery retained its original payment and report but attempt 2 returned UNAVAILABLE. Render logs identified HTTP 400: the direct-trade provider requires exact market/outcome, side, mandate and execution context. The saved request had the buyer mandate, but PolyDesk omitted mandate and execution from the outgoing AI context.

Restored the normalized saved mandate and freshly observed execution snapshot to the provider context. Directional-evidence instructions continue to classify buyer limits and book checks separately from the research thesis. Research-only A2A calls retain researchOnly=true and mandate=null. No additional service payment or trade authorization is introduced.

Updated regression assertions to verify the provider context while preserving research-only behavior and stale-source screening. This repair does not alter historical request hashes, reports or correction versions.
