const address = String(process.argv[2] ?? '').trim().toLowerCase()
if (!/^0x[a-f0-9]{40}$/.test(address)) {
  throw new Error('Provide one valid EVM address to check.')
}

const explicit = String(process.env.POLYDESK_OKX_REWARD_EXCLUDED_WALLETS ?? '')
  .toLowerCase()
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

const categories: string[] = []
if (explicit.includes(address)) categories.push('explicit')
for (const [category, value] of Object.entries({
  seller: process.env.OKX_X402_SELLER_ADDRESS,
  payTo: process.env.OKX_X402_PAY_TO,
  treasury: process.env.TREASURY_ADDRESS,
  payout: process.env.POLYDESK_OKX_REWARDS_PAYOUT_ADDRESS,
})) {
  if (String(value ?? '').trim().toLowerCase() === address) categories.push(category)
}

console.log(JSON.stringify({
  ok: true,
  address: `${address.slice(0, 6)}...${address.slice(-4)}`,
  eligible: categories.length === 0,
  excludedCategories: categories,
  exclusionsDisclosed: false,
}, null, 2))
