import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import App from './App'
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
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        appearance: {
          theme: 'dark',
          accentColor: '#0ea5e9',
          landingHeader: 'PolyDesk',
          loginMessage: 'Connect the wallet that controls your PolyDesk Polymarket wallet.',
        },
      }}
    >
      {app}
    </PrivyProvider>
  ) : (
    app
  ),
)
