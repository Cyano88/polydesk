# Legacy delivery incident classification — 2026-09-12

The 12 reviewed incidents were completed reports from September 3–5 that predate the researchStatus field. Nine contain legacy findings; three explicitly record that ZeroScout could not obtain a model-backed directional assessment. The old absence check also mislabeled three completed reports as exhausted solely because they had six attempts.

The monitor now distinguishes LEGACY_REPORT_PRESENT from UNKNOWN. Recognition requires the expected response schema/action/success flag, matching persisted decision and analysis identifiers, a nonempty provider summary and provider ID, a recognized trade stance, and matching well-formed proof references in both evidence locations. Existing explicit status values remain authoritative; unknown explicit values are not silently inferred. The known legacy provider-unavailable summary or error flag is classified UNAVAILABLE even when a proof reference exists.

Nine format-only incidents resolve with resolutionBasis=LEGACY_FORMAT_RECOGNIZED. The original incident reasons remain as history. The three unavailable-research incidents stay open with RESEARCH_UNAVAILABLE. This does not certify source quality or rewrite the research as AVAILABLE. Buyer acceptance and execution rules are unchanged.

Validation: eight monitor regression tests passed, including rejection of incomplete/mismatched legacy records and preservation of explicit provider failures. The classifier was also checked against a private read-only snapshot of all 12 actual records: 9 LEGACY_REPORT_PRESENT, 3 UNAVAILABLE, zero recovery-eligible records, and unchanged original JSON. No private report or credential is included in the test fixtures. Server typecheck passed; build and deployment verification are recorded separately.

No correction, research rerun, payment, trade, incident acknowledgement or external notification is requested by this release. Only the scheduled operator monitor's classification and incident resolution are changed.
