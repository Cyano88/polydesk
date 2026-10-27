// Internal provider adapter; deliberately not mounted as a public/free endpoint.
// The caller owns authenticated transport, payment gating and durable replay state.
// runResearch is runPolymarketTaskResearch in production; tests supply a fixture.
export function createVeilDeskResearchService({runResearch}) {
  if (typeof runResearch !== 'function') throw Error('Research implementation required');
  return async input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== 3 || !['marketId', 'outcome', 'side'].every(key => Object.hasOwn(input, key))
      || typeof input.marketId !== 'string' || !input.marketId.trim() || input.marketId.length > 320
      || typeof input.outcome !== 'string' || !input.outcome.trim() || input.outcome.length > 100
      || !['BUY', 'SELL'].includes(input.side)) throw Error('Invalid research input');
    let result;
    try { result = await runResearch({marketId: input.marketId, outcome: input.outcome, side: input.side}); }
    catch { throw Error('Research service unavailable'); }
    if (result?.ok !== true || result.data?.researchStatus !== 'AVAILABLE' || result.data?.schema !== 'polydesk-a2a-market-research-v1'
      || result.data.orderAuthorized !== false || result.data.orderSubmitted !== false)
      throw Error('Research service unavailable');
    // The shared engine's A2A guidance must not imply an accepted OKX task here.
    return typeof result.data.next === 'string' ? {...result.data,
      next: 'Review the evidence for this VeilDesk request. Trading requires separate authorization; this report grants no execution entitlement.'} : result.data;
  };
}
