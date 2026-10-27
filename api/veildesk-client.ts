import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type VeilDeskMandate = {
  schema: 'veildesk.mandate.v1'; id: string; mode: 'dry_run'; market: string;
  side: 'YES' | 'NO'; maxSpendUsd: string; limitPrice: string; expiresAt: number; approval: 'preview_only'
}

// Opt-in server-side integration. No browser keys, public route, market order or payment.
// sdkRoot points to a reviewed VeilDesk SDK installation, never to request input.
export async function createVeilDeskAdapter(options: { configPath: string; sdkRoot: string; stateDirectory: string; unpaidOnly?: boolean }) {
  if (![options.configPath, options.sdkRoot, options.stateDirectory].every(isAbsolute)) throw new Error('VeilDesk requires absolute operator-configured paths')
  const config = JSON.parse(await readFile(options.configPath, 'utf8'))
  if (options.unpaidOnly && config.capability && config.capability !== 'prediction.mandate.validate.v1') throw new Error('Only unpaid preview validation is enabled')
  const { createMandateClient } = await import(pathToFileURL(join(options.sdkRoot, 'src', 'mandate-client.mjs')).href)
  const { validateMandate } = await import(pathToFileURL(join(options.sdkRoot, 'src', 'mandate.mjs')).href)
  const client = await createMandateClient({ config, stateDirectory: options.stateDirectory })
  return {
    validatePreview: (mandate: unknown): void => { validateMandate(mandate) },
    submitPreview: (mandate: VeilDeskMandate): Promise<unknown> => client.submit(mandate),
    getPreview: (id: string): Promise<unknown> => client.get(id),
    submitPaymentHint: (id: string, txid: string): Promise<unknown> => client.submitPaymentHint(id, txid),
  }
}
