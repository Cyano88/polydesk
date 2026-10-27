export type VeilDeskResearchInput = {marketId: string; outcome: string; side: 'BUY' | 'SELL'};
export function createVeilDeskResearchService(options: {
  runResearch: (input: VeilDeskResearchInput) => Promise<unknown>;
}): (input: VeilDeskResearchInput) => Promise<Record<string, unknown>>;
