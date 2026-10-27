import {runPolymarketTaskResearch,type SmartTraderDependencies} from './polymarket-smart-trader.js'

// PolyDesk owns its research dependencies. The calling provider owns purchase authorization.
export function createPolydeskResearchService(dependencies?:SmartTraderDependencies){
  return (raw:unknown)=>runPolymarketTaskResearch(raw,dependencies)
}
