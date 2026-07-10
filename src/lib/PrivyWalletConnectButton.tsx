import { type ReactNode } from 'react'
import { useConnectWallet, useLinkAccount, usePrivy, type ConnectWalletModalOptions } from '@privy-io/react-auth'

type PrivyWalletConnectButtonProps = {
  className?: string
  disabled?: boolean
  options?: ConnectWalletModalOptions
  onError?: (message: string) => void
  children: ReactNode
}

export function PrivyWalletConnectButton({
  className,
  disabled,
  options,
  onError,
  children,
}: PrivyWalletConnectButtonProps) {
  const { authenticated, ready } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { linkWallet } = useLinkAccount()

  function handleClick() {
    if (!ready || disabled) return
    try {
      if (authenticated) {
        linkWallet(options)
      } else {
        connectWallet(options)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open wallet connection.'
      onError?.(message)
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('privyDebug') === '1') {
        console.warn('[privy-wallet-connect:error]', error)
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !ready}
      className={className}
    >
      {children}
    </button>
  )
}
