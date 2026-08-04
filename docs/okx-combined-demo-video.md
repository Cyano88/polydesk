# PolyDesk combined OKX.AI demo

## Recommendation

Keep the existing 88-second LP Scout demo as verified evidence. Do not append a
second full demo. Produce one 115-120 second final cut:

`discover -> buy intelligence -> watch or pick -> verify account -> fund if required -> enforce mandate -> buyer signs -> submit -> public receipt`

The first half proves that agents already buy and consume PolyDesk intelligence.
The new ending proves that PolyDesk can turn that intelligence into a bounded,
buyer-controlled Polymarket action.

## Judge-facing promise

**PolyDesk helps a struggling Polymarket agent go from a public signal to a
funded, policy-approved trade without giving PolyDesk its private key.**

## Final cut

| Time | Screen | Voiceover |
| --- | --- | --- |
| 0-8s | PolyDesk #5427 and the recorded-use count | "Prediction-market agents can find signals. The difficult part is turning one into a safe, completed action." |
| 8-22s | Reuse the existing Pulse and LP Scout sequence | "PolyDesk reads live markets, rewards and order books, then ranks maker and limit-order opportunities by evidence and execution risk." |
| 22-42s | Reuse the existing quote, confirmation and payment sequence | "Another agent buys the report with an explicit X Layer payment. It sees the exact token, amount and recipient before signing." |
| 42-55s | Reuse the paid report, settlement and 0G proof | "The paid replay returns structured JSON, a persisted report and settlement proof that an agent can verify and reuse." |
| 55-62s | Clean transition card: From intelligence to action | "But useful intelligence should not end as another dashboard." |
| 62-76s | Call the free governed flow with WATCH or AUTO_BEST_FIT | "The buyer can watch a public wallet, select an existing position or ask PolyDesk for the best execution-quality fit under explicit limits." |
| 76-88s | Show derived Deposit Wallet and readiness result | "PolyDesk derives the expected Polymarket Deposit Wallet, rejects mismatched funding addresses and checks whether collateral is ready." |
| 88-98s | Show the single nextAction: FUND, APPROVE_COLLATERAL or SIGN | "The agent receives one next action. If funding is short, PolyDesk creates a verified checkout only for the derived wallet." |
| 98-108s | Show APPROVE, ESCALATE or BLOCK plus decision hash | "A deterministic mandate checks the market, amount, price cap, expiry and duplicate state before the service can be paid." |
| 108-118s | Show buyer-signed submission and public terminal receipt | "The buyer signs and submits the exact order. PolyDesk verifies the public fill and returns one receipt binding the decision, mandate, order and transaction." |

## Screens to capture for the extension

1. `GET /api/polymarket-agent-flow` showing the five lifecycle steps.
2. A free `WATCH` or `AUTO_BEST_FIT` response with one selected position.
3. Account readiness with the owner EOA and derived Deposit Wallet.
4. The returned `nextAction`.
5. The governed decision and decision hash.
6. The exact buyer-signed order handoff.
7. The public terminal receipt.

Use a real completed trade receipt if available. If the final receipt is not
available before recording, stop the demo at the signed handoff and label it
clearly as a rehearsal. Do not present a mocked fill as completed.

## Machine-readable evidence

- Existing paid result: `demo-assets/agent-result.json`
- Current production migration checks:
  `demo-assets/okx-agent-5427-migration-evidence.json`
- Existing visual master: `demo-assets/polydesk-okx-88s-master.mp4`
- Existing captions: `demo-assets/polydesk-okx-88s.srt`

## Marketplace drift

Do not record the final marketplace screens until OKX migrates the five listed
service records to `https://polydesk.trade`. The production endpoints are live,
but the current listing still points at retired routes. The update API currently
blocks endpoint and fee changes on service record `33343` because it is in use.

## Claims

- Say **123 recorded marketplace uses**, not 123 unique customers.
- Say **execution-quality fit**, not safest or most profitable trade.
- Say **buyer-signed trade**, not PolyDesk custody or unattended treasury.
- Say **fund if required**, not every trade requires a checkout.
- Say **confidently matched market link**, not every football item has a market.
- Never claim the governed receipt exists until a real public fill has been
  verified.
