import { createHmac } from 'node:crypto'
import { OKXFacilitatorClient, type OKXConfig } from '@okxweb3/x402-core'

// Only the read-only capabilities call is overridden. Verify/settle stay in the SDK.
export class DiagnosticOkxFacilitator extends OKXFacilitatorClient {
  constructor(private readonly credentials: OKXConfig, private readonly request: typeof fetch = fetch) { super(credentials) }
  override async getSupported(): ReturnType<OKXFacilitatorClient['getSupported']> {
    const path = '/api/v6/pay/x402/supported'
    const timestamp = new Date().toISOString()
    const signature = createHmac('sha256', this.credentials.secretKey).update(timestamp + 'GET' + path).digest('base64')
    let response: Response
    try {
      response = await this.request((this.credentials.baseUrl || 'https://web3.okx.com') + path, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: {
          'OK-ACCESS-KEY': this.credentials.apiKey, 'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': this.credentials.passphrase,
          'Content-Type': 'application/json',
        },
      })
    } catch { throw new Error('OKX_X402_SUPPORTED_TRANSPORT_UNAVAILABLE') }
    let body: Record<string, unknown>
    try { body = await response.json() as Record<string, unknown> }
    catch { throw new Error(`OKX_X402_SUPPORTED_HTTP_${response.status}_NON_JSON`) }
    // Never expose upstream message, request headers, key, signature or arbitrary code strings.
    const rawCode = body && typeof body === 'object' ? body.code : undefined
    const code = (typeof rawCode === 'string' || typeof rawCode === 'number') && /^\d{1,8}$/.test(String(rawCode)) ? String(rawCode) : undefined
    if (!response.ok || (code !== undefined && code !== '0')) {
      throw new Error(`OKX_X402_SUPPORTED_HTTP_${response.status}_CODE_${code || 'UNKNOWN'}`)
    }
    return (body.data ?? body) as Awaited<ReturnType<OKXFacilitatorClient['getSupported']>>
  }
}
