// Observed CLOB rejection conflicts with the current official contract registry.
// Remove only after this exact route has been verified against the provider.
export const ADAPTER_ROUTE_CONFLICT = 'PROVIDER_ADAPTER_ROUTE_CONFLICT'
export function polymarketRouteIssue(conditionId: string): string | null {
  return conditionId.toLowerCase() === '0xb28000f3db74c4e892a9b8bafb5b66d1a7815aeee9689864a1ec644f32bb4c9b'
    ? ADAPTER_ROUTE_CONFLICT : null
}
