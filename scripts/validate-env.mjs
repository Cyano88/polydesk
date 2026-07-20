import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

const groups = [
  {
    name: 'app boot',
    required: [
      'VITE_PRIVY_APP_ID',
      'PRIVY_APP_ID',
      'PRIVY_APP_SECRET',
      'POLYMARKET_CHAIN_ID',
      'POLYMARKET_RELAYER_URL',
      'POLYMARKET_BUILDER_CODE',
      'POLYMARKET_BUILDER_API_KEY',
      'POLYMARKET_BUILDER_SECRET',
      'VITE_PUBLIC_PAYLINK_ORIGIN',
      'HASH_PAYLINK_BASE_URL',
    ],
    alternatives: [
      ['DATABASE_URL', 'POSTGRES_URL'],
      ['POLYMARKET_BUILDER_PASSPHRASE', 'POLYMARKET_BUILDER_PASS_PHRASE'],
    ],
    recommendedAlternatives: [
      ['POLYMARKET_RPC_URL', 'POLYGON_RPC_URL'],
    ],
  },
  {
    name: 'world cup feed',
    recommended: [
      'POLY_STREAM_LEAGUE_ID',
      'POLY_STREAM_SEASON',
      'POLYMARKET_MATCH_URLS',
      'POLYMARKET_MARKET_LOOKUP',
    ],
    optional: [
      'POLY_STREAM_BASE_URL',
    ],
  },
  {
    name: 'desk agent and lp scout',
    recommended: [
      'DEFAULT_AGENT_SLUG',
      'DEFAULT_AGENT_WALLET_ADDRESS',
      'AGENT_WALLET_SERVICE_SECRET',
      'X402_SELLER_ADDRESS',
      'X402_POLYMARKET_SCOUT_PRICE',
      'ZEROSCOUT_API_URL',
      'ZEROSCOUT_INTEGRATION_SECRET',
    ],
    optional: [
      'X402_FACILITATOR_URL',
    ],
  },
  {
    name: 'x402 receipt lookup',
    alternatives: [
      ['CIRCLE_X402_RECEIPT_API_KEY', 'CIRCLE_GATEWAY_API_KEY', 'CIRCLE_API_KEY'],
    ],
    optional: [
      'CIRCLE_GATEWAY_API_BASE',
    ],
  },
  {
    name: 'okx ai lp scout',
    required: [
      'PUBLIC_APP_URL',
      'OKX_X402_API_KEY',
      'OKX_X402_SECRET_KEY',
      'OKX_X402_PASSPHRASE',
      'OKX_X402_PAY_TO',
      'OKX_X402_POLYMARKET_LP_SCOUT_PRICE',
      'OKX_X402_STANDARD_SERVICE_PRICE',
    ],
    optional: [
      'OKX_X402_BASE_URL',
      'OKX_X402_SYNC_SETTLE',
    ],
  },
  {
    name: 'okx agentic marketplace',
    alternatives: [
      ['OKX_API_KEY', 'OKX_PAYMENT_API_KEY', 'OKX_X402_API_KEY'],
      ['OKX_SECRET_KEY', 'OKX_PAYMENT_SECRET_KEY', 'OKX_X402_SECRET_KEY'],
      ['OKX_PASSPHRASE', 'OKX_PAYMENT_PASSPHRASE', 'OKX_X402_PASSPHRASE'],
    ],
    optional: [
      'ONCHAINOS_BIN',
      'OKX_AGENTIC_DATA_PATH',
      'OKX_AGENTIC_BASE_URL',
    ],
  },
  {
    name: '0g archive',
    optional: [
      'OG_RPC_URL',
      'OG_INDEXER_RPC_URL',
      'OG_STORAGE_KEY',
      'OG_ARCHIVE_ADDRESS',
    ],
  },
]

function hasValue(name) {
  return Boolean(String(process.env[name] ?? '').trim())
}

function checkGroup(group) {
  const missingRequired = (group.required ?? []).filter(name => !hasValue(name))
  const missingAlternatives = (group.alternatives ?? []).filter(names => !names.some(hasValue))
  const missingRecommendedAlternatives = (group.recommendedAlternatives ?? []).filter(names => !names.some(hasValue))
  const missingRecommended = (group.recommended ?? []).filter(name => !hasValue(name))
  const missingOptional = (group.optional ?? []).filter(name => !hasValue(name))
  return { missingRequired, missingAlternatives, missingRecommendedAlternatives, missingRecommended, missingOptional }
}

let failed = false

for (const group of groups) {
  const result = checkGroup(group)
  console.log(`\n[${group.name}]`)

  if (result.missingRequired.length) {
    failed = true
    console.log(`missing required: ${result.missingRequired.join(', ')}`)
  }

  for (const names of result.missingAlternatives) {
    failed = true
    console.log(`missing one of: ${names.join(' or ')}`)
  }

  for (const names of result.missingRecommendedAlternatives) {
    console.log(`missing recommended one of: ${names.join(' or ')}`)
  }

  if (result.missingRecommended.length) {
    console.log(`missing recommended: ${result.missingRecommended.join(', ')}`)
  }

  if (result.missingOptional.length) {
    console.log(`missing optional: ${result.missingOptional.join(', ')}`)
  }

  if (
    !result.missingRequired.length
    && !result.missingAlternatives.length
    && !result.missingRecommendedAlternatives.length
    && !result.missingRecommended.length
    && !result.missingOptional.length
  ) {
    console.log('ok')
  }
}

if (hasValue('RELAYER_PRIVATE_KEY')) {
  console.log('\n[warning]')
  console.log('RELAYER_PRIVATE_KEY is present. Prefer OG_STORAGE_KEY for PolyDesk so broad Hash PayLink relayer keys do not move.')
}

if (failed) {
  console.error('\nPolyDesk env validation failed.')
  process.exit(1)
}

console.log('\nPolyDesk required env validation passed.')
