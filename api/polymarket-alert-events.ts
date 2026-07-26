import { EventEmitter } from 'node:events'

export const polymarketAlertEvents = new EventEmitter()
polymarketAlertEvents.setMaxListeners(20)

export function registerPolymarketAlertAsset(assetId: string) {
  if (assetId) polymarketAlertEvents.emit('asset', assetId)
}
