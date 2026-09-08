export function observeLiveBook(intent: {token_id: string; condition_id: string}, options?: {Socket?: unknown; now?: () => number}): Promise<Record<string, unknown>>;
