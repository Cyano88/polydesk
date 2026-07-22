import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { rm } from 'node:fs/promises'

const storePath = `./tmp-telegram-funding-${process.pid}.json`
process.env.TELEGRAM_REQUEST_STORE = storePath
process.env.HASH_PAYLINK_BASE_URL = 'https://app.hashpaylink.com'
const { default: handler } = await import('../api/telegram-request.js')

function responseRecorder() {
  return {
    statusCode: 200, body: undefined as any,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

after(async () => { await rm(storePath, { force: true }) })

test('stores only the provider-verified Hash PayLink checkout for a funding card', async () => {
  const res = responseRecorder()
  await handler({ method: 'POST', headers: {}, body: {
    kind: 'polymarket-funding', mode: 'person', network: 'base',
    wallet: '0x2222222222222222222222222222222222222222',
    evmWallet: '0x2222222222222222222222222222222222222222',
    polymarketWallet: '0x2222222222222222222222222222222222222222',
    label: 'Polymarket', target: 'Sponsor', amount: '10',
    payUrl: 'https://app.hashpaylink.com/pay/c/chk_verified123?attempt=pat_verified123',
  } } as any, res as any)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.request.payUrl, 'https://app.hashpaylink.com/pay/c/chk_verified123?attempt=pat_verified123')
})

test('rejects an off-origin funding checkout', async () => {
  const res = responseRecorder()
  await handler({ method: 'POST', headers: {}, body: {
    kind: 'polymarket-funding', mode: 'person', network: 'base',
    wallet: '0x2222222222222222222222222222222222222222',
    polymarketWallet: '0x2222222222222222222222222222222222222222',
    label: 'Polymarket', target: 'Sponsor', amount: '10',
    payUrl: 'https://example.com/pay/c/chk_fake',
  } } as any, res as any)
  assert.equal(res.statusCode, 400)
})
