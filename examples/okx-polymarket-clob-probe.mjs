import { execFileSync } from 'node:child_process'
import {
  AssetType,
  ClobClient,
  SignatureTypeV2,
} from '@polymarket/clob-client-v2'

const [ownerAddress, depositWalletAddress] = process.argv.slice(2)

if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress || '') || !/^0x[a-fA-F0-9]{40}$/.test(depositWalletAddress || '')) {
  console.error('Usage: node examples/okx-polymarket-clob-probe.mjs <owner-eoa> <deposit-wallet>')
  process.exit(1)
}

function jsonForCli(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)
}

function explicitDomainTypes(domain) {
  const known = {
    name: 'string',
    version: 'string',
    chainId: 'uint256',
    verifyingContract: 'address',
    salt: 'bytes32',
  }
  return Object.keys(domain)
    .filter(name => known[name])
    .map(name => ({ name, type: known[name] }))
}

function signTypedData({ domain, types, primaryType, message }) {
  const typedData = {
    domain,
    types: {
      EIP712Domain: explicitDomainTypes(domain),
      ...types,
    },
    primaryType,
    message,
  }
  const args = [
    'wallet',
    'sign-message',
    '--type',
    'eip712',
    '--message',
    jsonForCli(typedData),
    '--chain',
    '137',
    '--from',
    ownerAddress,
  ]
  if (process.env.OKX_FORCE === '1') args.push('--force')
  const output = execFileSync('onchainos', args, {
    encoding: 'utf8',
    windowsHide: true,
  })

  const parsed = JSON.parse(output)
  const signature = parsed?.data?.signature
  if (!parsed?.ok || !/^0x[a-fA-F0-9]+$/.test(signature || '')) {
    throw new Error(parsed?.error || 'OKX Agentic Wallet did not return an EIP-712 signature.')
  }
  return signature
}

const signer = {
  account: { address: ownerAddress },
  signTypedData,
}

const baseClient = new ClobClient({
  host: 'https://clob.polymarket.com',
  chain: 137,
  signer,
  signatureType: SignatureTypeV2.POLY_1271,
  funderAddress: depositWalletAddress,
  useServerTime: true,
  // createOrDeriveApiKey must be allowed to fall back to derivation when the
  // owner already has a key and the create endpoint returns an error object.
  throwOnError: false,
})

const credentials = await baseClient.createOrDeriveApiKey()
const authenticatedClient = new ClobClient({
  host: 'https://clob.polymarket.com',
  chain: 137,
  signer,
  creds: credentials,
  signatureType: SignatureTypeV2.POLY_1271,
  funderAddress: depositWalletAddress,
  useServerTime: true,
  throwOnError: true,
})
const collateral = await authenticatedClient.getBalanceAllowance({
  asset_type: AssetType.COLLATERAL,
})

console.log(JSON.stringify({
  ok: true,
  ownerAddress,
  depositWalletAddress,
  signatureType: Number(SignatureTypeV2.POLY_1271),
  credentialsDerived: Boolean(credentials?.key && credentials?.secret && credentials?.passphrase),
  collateral,
}, null, 2))
