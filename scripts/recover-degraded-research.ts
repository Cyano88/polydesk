import 'dotenv/config'
import { recoverySummary } from '../api/recovery-summary.js'
import { executeSettledSmartTraderDelivery } from '../api/polymarket-smart-trader.js'

const [transaction, payer, confirmation] = process.argv.slice(2)
if (!/^0x[0-9a-fA-F]{64}$/.test(transaction || '') || !/^0x[0-9a-fA-F]{40}$/.test(payer || '') || confirmation !== '--execute') {
  throw new Error('Usage: recover-degraded-research <settlement transaction> <payer> --execute')
}
// Operator-only: no public route, signing, new payment, or caller-supplied request.
const result = await executeSettledSmartTraderDelivery(transaction, payer, undefined, { allowDegradedResearchRemediation: true })
const summary = recoverySummary(result)
console.log(JSON.stringify(summary))
if (summary.deliveryStatus !== 'completed') process.exitCode = 1
