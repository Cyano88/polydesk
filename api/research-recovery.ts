import type { Request, Response } from 'express'
import { correctionOperator, CorrectionError } from './receipt-correction.js'
import { readPaidResearchRecord, isRemediableDegradedResearch, validServicePayment, recoveryScopeExpired, executeSettledSmartTraderDelivery } from './polymarket-smart-trader.js'
import { preflightZeroScoutIntelligenceAccess } from './zeroscout-intelligence.js'

export function createResearchRecoveryHandler(deps = {
  authorize: correctionOperator,
  read: readPaidResearchRecord,
  ready: () => preflightZeroScoutIntelligenceAccess({ analysisType: 'polydesk-smart-market-research', proofClass: 'polydesk_smart_market_research' }),
  execute: executeSettledSmartTraderDelivery,
}) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      deps.authorize(req.headers.authorization)
      const tx = String(req.params.transaction || '').toLowerCase()
      if (!/^0x[a-f0-9]{64}$/.test(tx) || /^0x0{64}$/.test(tx)
        || !req.body || Object.keys(req.body).length !== 1 || req.body.action !== 'RECOVER_RESEARCH') {
        throw new CorrectionError(400, 'INVALID_RECOVERY_REQUEST')
      }
      const record = await deps.read(tx)
      if (!record || record.payment.transaction.toLowerCase() !== tx || !validServicePayment(record.payment) || record.payment.amountAtomic !== '300000'
        || !isRemediableDegradedResearch(record)) throw new CorrectionError(409, 'RECEIPT_NOT_RECOVERABLE')
      if (recoveryScopeExpired(record)) throw new CorrectionError(409, 'RECOVERY_SCOPE_REVIEW_REQUIRED')
      await deps.ready()
      // Execute uses a durable atomic claim, original request hash and bounded attempts.
      // No payment authorization, new request parameters or trade input is accepted.
      await deps.execute(tx, record.payment.payer, undefined, { allowDegradedResearchRemediation: true })
      return res.json({ ok: true, additionalPaymentRequired: false, tradeAuthorized: false,
        statusUrl: `/api/a2mcp/polymarket-smart-trader/payment/${tx}`, followUpPrompts: ['Show results', 'Review delivery issue'] })
    } catch (error) {
      const status = error instanceof CorrectionError ? error.status : 503
      return res.status(status).json({ ok: false, error: error instanceof CorrectionError ? error.code : 'RECOVERY_UNCONFIRMED_CHECK_STATUS', retryPayment: false, additionalPaymentRequired: false })
    }
  }
}
