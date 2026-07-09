import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import { arbitrum, polygon } from 'viem/chains'
import App from './App'
import { PrivyLoginProvider } from './lib/PrivyLoginProvider'
import { arcChain, baseMainnet } from './lib/chains'
import { POLYDESK_WALLET_LIST } from './lib/privyLoginOptions'
import './styles.css'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  privyAppId ? (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet'],
        allowOAuthInEmbeddedBrowsers: true,
        defaultChain: baseMainnet,
        supportedChains: [baseMainnet, arcChain, arbitrum, polygon],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        appearance: {
          theme: 'dark',
          landingHeader: 'PolyDesk',
          loginMessage: 'Team will never ask for this code',
          walletList: [...POLYDESK_WALLET_LIST],
          walletChainType: 'ethereum-only',
        },
      }}
    >
      <PrivyLoginProvider>{app}</PrivyLoginProvider>
    </PrivyProvider>
  ) : (
    app
  ),
)
