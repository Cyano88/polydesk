import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import App from './App'
import { PrivyLoginProvider } from './lib/PrivyLoginProvider'
import './styles.css'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined
const privyLogoUrl = `${window.location.origin}/brand/polydesk-privy-logo.png`

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
        loginMethodsAndOrder: {
          primary: ['email', 'wallet'] as never,
        },
        allowOAuthInEmbeddedBrowsers: true,
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        appearance: {
          theme: 'dark',
          accentColor: '#696FFD',
          logo: privyLogoUrl,
          landingHeader: 'PolyDesk',
          loginMessage: 'Team will never ask for this code',
          emailDomain: 'PolyDesk',
        },
      }}
    >
      <PrivyLoginProvider>{app}</PrivyLoginProvider>
    </PrivyProvider>
  ) : (
    app
  ),
)
