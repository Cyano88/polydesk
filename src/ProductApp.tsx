import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import { arbitrum, polygon } from 'viem/chains'
import App from './App'
import { PRIVY_APP_ID, PRIVY_AUTH_ENABLED } from './lib/authMode'
import { PrivyLoginProvider } from './lib/PrivyLoginProvider'
import { arcChain, baseMainnet } from './lib/chains'
import { POLYDESK_WALLET_LIST } from './lib/privyLoginOptions'

export default function ProductApp() {
  const requiresPrivy = /^\/(?:polydesk|rewards)(?:\/|$)/.test(window.location.pathname)
  const [privyTheme, setPrivyTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('polydesk-theme') === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    const syncTheme = () => setPrivyTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const privyConfig = useMemo<PrivyClientConfig>(() => ({
    loginMethods: ['email', 'wallet'],
    allowOAuthInEmbeddedBrowsers: true,
    defaultChain: baseMainnet,
    supportedChains: [baseMainnet, arcChain, arbitrum, polygon],
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'users-without-wallets',
      },
    },
    appearance: {
      theme: privyTheme,
      logo: privyTheme === 'dark'
        ? '/brand/polydesk-privy-dark-180x90.png'
        : '/brand/polydesk-privy-light-180x90.png',
      landingHeader: 'PolyDesk',
      loginMessage: 'Team will never ask for this code',
      emailDomain: 'PolyDesk',
      walletList: [...POLYDESK_WALLET_LIST],
      walletChainType: 'ethereum-only',
    },
  }), [privyTheme])

  const app = (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )

  if (!PRIVY_AUTH_ENABLED || !requiresPrivy) return app

  return (
    <PrivyProvider appId={PRIVY_APP_ID!} config={privyConfig}>
      <PrivyLoginProvider>{app}</PrivyLoginProvider>
    </PrivyProvider>
  )
}
