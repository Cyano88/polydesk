import type { ChainKey } from './lib/chains'

export type LayoutOutletContext = {
  selectedNet: ChainKey
  onNetworkSelect: (key: ChainKey) => void
  onPayChainChange: (key: ChainKey) => void
  onPayWalletStateChange: (state: { connected: boolean; disconnect?: () => void }) => void
  onPaySuccessVisibleChange: (visible: boolean) => void
}
