import type { LoginModalOptions } from '@privy-io/react-auth'

export const POLYDESK_WALLET_LIST = [
  'detected_wallets',
  'metamask',
  'coinbase_wallet',
  'wallet_connect',
] as const

export const POLYDESK_LOGIN_OPTIONS: LoginModalOptions = {
  loginMethods: ['email', 'wallet'],
}
