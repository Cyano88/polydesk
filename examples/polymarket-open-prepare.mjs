const [marketUrl, outcome, maxSpendUsdc, wallet, orderType = 'FAK', selector = ''] = process.argv.slice(2)

if (!marketUrl || !outcome || !maxSpendUsdc || !wallet) {
  console.error('Usage: node examples/polymarket-open-prepare.mjs <market-url> <outcome> <max-spend-usdc> <deposit-wallet> [FAK|FOK] [market-slug|token-id]')
  process.exit(1)
}

const baseUrl = String(process.env.POLYDESK_BASE_URL || 'https://polydesk.trade').replace(/\/+$/, '')
const body = {
  externalOrderId: `open:${Date.now()}`,
  marketUrl,
  outcome,
  maxSpendUsdc,
  wallet,
  orderType: orderType.toUpperCase(),
  ...(selector ? (/^\d+$/.test(selector) ? { tokenId: selector } : { marketSlug: selector }) : {}),
}

const response = await fetch(`${baseUrl}/api/polymarket-open/prepare`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const result = await response.json().catch(() => ({ ok: false, error: 'PolyDesk returned a non-JSON response.' }))
console.log(JSON.stringify({ httpStatus: response.status, ...result }, null, 2))
process.exitCode = response.ok ? 0 : 1
