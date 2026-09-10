import assert from 'node:assert/strict'
import test from 'node:test'
import { feeInclusiveBudget, readTradeFees } from '../api/polymarket-native-fees.js'
const fees = { marketRate: 0.05, exponent: 1, takerOnly: true, makerBps: 50, takerBps: 100 }
const code = `0x${'ab'.repeat(32)}`
test('all-in cap contains independent market and builder reserves at executable precision', () => {
  const b = feeInclusiveBudget('4', fees, false)
  assert.equal(b.orderAmount, '3.77')
  assert.equal(b.marketFeeReserve, '0.1885')
  assert.equal(b.builderFeeReserve, '0.0377')
  assert.equal(b.requiredBalance, '3.9962')
  for (const maximum of ['0.02', '1', '4.000001', '1000.999999']) {
    const b = feeInclusiveBudget(maximum, fees, false)
    assert.ok(Number(b.requiredBalance) <= Number(maximum))
    for (const price of [0.001, 0.1, 0.3, 0.5, 0.99]) {
      const marketFee = Number(b.orderAmount) * fees.marketRate * (1-price)
      assert.ok(marketFee <= Number(b.marketFeeReserve))
    }
  }
})
test('post-only uses maker builder fee and no taker-only market fee', () => {
  const b = feeInclusiveBudget('4', fees, true)
  assert.equal(b.marketFeeReserve, '0')
  assert.equal(b.builderRateBps, 50)
  assert.equal(b.requiredBalance, '3.9999')
})
test('unknown and unsupported fee curves cannot be treated as zero fees', () => {
  for (const override of [{marketRate: NaN}, {exponent: 0}, {takerOnly: undefined}, {makerBps: 51}, {takerBps: 101}]) {
    assert.throws(() => feeInclusiveBudget('4', {...fees, ...override} as any, false))
  }
  assert.throws(() => feeInclusiveBudget('0.000001', fees, false))
})
test('provider fee verification requires exact token, enabled code and complete rates', async () => {
  const market = {t:[{t:'111'}], fd:{r:0.05,e:1,to:true}}
  const builder = {code,enabled:true,builder_maker_fee_rate_bps:0,builder_taker_fee_rate_bps:0}
  const fetcher = async (url: string) => url.includes('clob-markets') ? market : builder
  assert.equal((await readTradeFees(fetcher, 'condition', '111', code)).marketRate, 0.05)
  await assert.rejects(readTradeFees(fetcher, 'condition', '222', code))
  for (const override of [{enabled:false}, {code:'wrong'}, {builder_taker_fee_rate_bps:null}]) {
    await assert.rejects(readTradeFees(async url => url.includes('clob-markets') ? market : {...builder,...override}, 'condition','111',code))
  }
  await assert.rejects(readTradeFees(async () => { throw new Error('timeout') }, 'condition','111',code))
})