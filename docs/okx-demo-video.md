# PolyDesk OKX.AI demo

## Winning frame

**Primary category:** Finance Copilot

**One-line promise:** PolyDesk turns live prediction-market liquidity data into a paid, bounded operator decision that another agent can buy on X Layer—without handing PolyDesk a trading key.

The demo proves one complete path:

`live market data → ranked decision → HTTP 402 → buyer-approved USDT payment → replayed report → settlement receipt`

Do not tour every PolyDesk feature. Mention the buyer-controlled signed-order workflow only after the core proof succeeds.

## Before recording

1. Run `npm run demo:okx:preflight`.
2. Confirm the OKX Marketplace entry for Agent `5427` points to the working endpoint.
3. Select an OKX Agentic Wallet with at least `0.3 USDT` on X Layer.
4. Obtain a fresh payment quote. Never reuse an old payment ID.
5. Rehearse the paid flow once and save the successful response and transaction link.
6. Close unrelated tabs, hide notifications, zoom the browser to 110%, and record at 1080p.

## 90-second recording

| Time | Screen | Voiceover |
| --- | --- | --- |
| 0–7s | OKX.AI Agent `5427`, with PolyDesk and LP Scout visible | “Prediction-market agents have plenty of data. What they lack is a fast, paid decision they can safely act on.” |
| 7–18s | `polydesk.trade` Pulse, showing the live ranked opportunity list | “PolyDesk reads current Polymarket markets, rewards and order-book conditions, then ranks opportunities by spread, depth, reward and execution risk.” |
| 18–28s | Return to LP Scout on OKX.AI and open **Use now** | “Any buyer agent can discover PolyDesk on OKX.AI and call the LP Scout service.” |
| 28–41s | Terminal: request the endpoint and show the fresh quote | “The endpoint responds with a real HTTP 402 challenge: 0.3 USDT on X Layer, using OKX Agent Payments.” |
| 41–53s | Show the OKX confirmation card, then approve | “The buyer sees the exact asset, amount and recipient before money moves. I approve this single service payment.” |
| 53–70s | Terminal: payment and automatic replay complete | “OKX signs and settles the payment, then replays the same request. PolyDesk does not receive the buyer’s private key or trading credentials.” |
| 70–83s | Show the returned report: top market, spread, depth, reward, minimum size, risk/checklist | “The deliverable is not a generic answer. It is a current operator report with the evidence and constraints needed for a liquidity decision.” |
| 83–90s | Show the confirmed X Layer transaction and archived 0G proof beside the report | “That is PolyDesk: live intelligence, buyer-approved payment and an independently auditable result—in one agent-to-agent flow.” |

## Recording commands

Run the read-only check:

```powershell
cd C:\Users\USER\Desktop\polydesk
npm.cmd run demo:okx:preflight
```

Obtain a **fresh** quote immediately before the paid rehearsal:

```powershell
onchainos payment quote "https://polydesk.trade/api/a2mcp/okx/polymarket-lp-scout?scoutMode=best&budget=5&agent=okx-demo" --method GET
```

Stop at the confirmation card and verify:

- service endpoint;
- `0.3 USDT`;
- X Layer (`eip155:196`);
- USDT token `0x779ded0c9e1022225f8e0630b35a9b54be713736`;
- seller address displayed by the fresh quote.

Only then confirm and pay using the fresh payment ID.

## Judge-visible result

Keep these fields visible and readable:

- report generation time;
- market title and URL;
- ranked score or recommendation;
- spread, depth/liquidity, reward and minimum size;
- execution-risk warning or checklist;
- payment amount and network;
- settlement transaction or receipt identifier.
- archived 0G proof link.

## Verified rehearsal evidence

- X Layer settlement: `0xce129ab9426f418719057c186398373ded74b624ed622b9d16bc99d10a0c3983`
- Settlement status: `SUCCESS`
- Settled amount: `0.3 USDT`
- Paid report: `https://polydesk.trade/report/lp-scout/c9e6b0d8-84d5-4c0e-9c99-cc6c4f7795e8?receipt=0cccbe35-403a-49c9-b82b-c4bcc613d647`
- 0G archive proof: `https://chainscan.0g.ai/tx/0x40da8cdb3f5343c0b701442950bc73b6cb00b9641e23410267b0d8336fd9b8c5`

The rehearsal response exposed a stale receipt label (`USDC` instead of
`USDT`). Commit `d5d2bd1` corrects this for the final recording purchase and
adds a regression test. Do not use the rehearsal report as the final close-up.

## Claims to avoid

- Do not call `122 sold` 122 customers or 122 organic purchases; say “122 recorded uses.”
- Do not imply that PolyDesk guarantees returns.
- Do not imply that PolyDesk trades with or stores the buyer’s private key.
- Do not call completed World Cup standings “live scores.”
- Do not show the Arc `0.01 USDC` web checkout while narrating the OKX `0.3 USDT` service.

## Submission caption

**PolyDesk — a paid prediction-market Finance Copilot on OKX.AI**

An agent discovers a live Polymarket liquidity opportunity, reviews an explicit 0.3 USDT X Layer payment, and receives a replayed operator report with market evidence, execution constraints and settlement proof. PolyDesk provides the decision layer; the buyer keeps trading authority.
