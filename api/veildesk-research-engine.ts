import type {SmartTraderDependencies} from './polymarket-smart-trader.js'
import {createVeilDeskResearchService} from './veildesk-research-service.mjs'
import {createPolydeskResearchService} from './polydesk-research-service.js'

// Internal service binding, not an HTTP endpoint or a payment/OKX acceptance bypass.
// Mount only behind the VeilDesk provider's authenticated settlement gate.
export function createVeilDeskResearchEngine(dependencies?: SmartTraderDependencies) {
  return createVeilDeskResearchService({runResearch:createPolydeskResearchService(dependencies)})
}
