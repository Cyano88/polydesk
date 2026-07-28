import type { Request, Response } from 'express'
import a2mcpPolymarketPortfolioWatchHandler from './a2mcp-polymarket-portfolio-watch.js'
import { preparePolymarketCopy } from './polymarket-copy-prepare.js'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function publicOrigin(req: Request) {
  const configured = String(
    process.env.PUBLIC_APP_URL
    || process.env.VITE_PUBLIC_APP_URL
    || process.env.RENDER_EXTERNAL_URL
    || '',
  ).trim()
  if (configured) return configured.replace(/\/+$/, '')
  const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'polydesk.trade').split(',')[0].trim()
  return `${protocol}://${host}`.replace(/\/+$/, '')
}

export function flowDescriptor(req: Request) {
  const origin = publicOrigin(req)
  const freeMarketplaceAccess = (req as Request & { payment?: { kind?: string } }).payment?.kind === 'okx_marketplace_free'
  return {
    ok: true,
    service: 'PolyDesk Governed Polymarket Trader',
    version: '2026-07-27',
    promise: 'Turn a public Polymarket signal or an explicit market choice into a bounded, buyer-signed trade and a verifiable receipt.',
    custody: 'PolyDesk never receives the buyer private key or reusable CLOB credentials.',
    steps: [
      {
        step: 1,
        action: 'WATCH_OR_PICK',
        endpoint: `${origin}/api/polymarket-agent-flow`,
        input: 'action=WATCH plus a public watched wallet, or action=PREPARE with a watched wallet and selectionMode.',
        output: 'Exact public positions or BUY signals. AUTO_BEST_FIT ranks execution quality, not expected profit.',
      },
      {
        step: 2,
        action: 'VERIFY_ACCOUNT_AND_READINESS',
        endpoint: `${origin}/api/polymarket-agent-flow`,
        output: 'The owner EOA-derived Deposit Wallet, live market/order-book checks, and exactly one nextAction.',
      },
      {
        step: 3,
        action: 'FUND_IF_REQUIRED',
        endpoint: `${origin}/api/a2mcp/polymarket-funding-link`,
        rule: 'A checkout is created only after the supplied wallet matches the deterministic owner-derived Deposit Wallet.',
      },
      {
        step: 4,
        action: freeMarketplaceAccess ? 'AUTHORIZE_AND_RUN' : 'AUTHORIZE_AND_PAY_SERVICE',
        authorizeEndpoint: `${origin}/api/polymarket-governed-open/authorize`,
        validateEndpoint: `${origin}/api/polymarket-governed-open/validate`,
        executionEndpoint: freeMarketplaceAccess
          ? `${origin}/api/a2mcp/polymarket-portfolio-watch`
          : `${origin}/api/a2mcp/polymarket-agent-flow`,
        output: 'APPROVE, ESCALATE, or BLOCK. Only APPROVE returns the exact direct-submit payload.',
      },
      {
        step: 5,
        action: 'SUBMIT_AND_COMPLETE',
        submission: 'The buyer agent submits the exact signed order directly to Polymarket.',
        completeEndpoint: `${origin}/api/polymarket-agent-flow/complete`,
        receiptPattern: `${origin}/api/polymarket-agent-flow/receipt/{executionId}`,
      },
    ],
    prepareActions: {
      WATCH: {
        method: 'POST',
        required: ['wallet'],
        note: 'Reads public positions and recent BUY signals.',
      },
      PREPARE: {
        method: 'POST',
        required: ['watchedWallet', 'selectionMode', 'maxSpendUsdc'],
        selectionModes: ['TRADE', 'POSITION', 'AUTO_BEST_FIT'],
        buyerBoundRequired: ['ownerAddress'],
        analysisOnly: 'Set analysisOnly=true to rank without creating a buyer-bound plan.',
      },
    },
    nextActions: ['FUND', 'APPROVE_COLLATERAL', 'SIGN', 'PAY_SERVICE', 'SUBMIT', 'COMPLETE'],
  }
}

export default async function polymarketAgentFlowHandler(req: Request, res: Response) {
  if (req.method === 'GET') return res.status(200).json(flowDescriptor(req))
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }

  const body = isRecord(req.body) ? req.body : {}
  const action = String(body.action || 'PREPARE').trim().toUpperCase()
  if (action === 'WATCH') {
    req.body = { ...body, wallet: body.wallet || body.watchedWallet }
    return a2mcpPolymarketPortfolioWatchHandler(req, res)
  }
  if (action !== 'PREPARE') {
    return res.status(400).json({
      ok: false,
      error: 'action must be WATCH or PREPARE.',
      flow: flowDescriptor(req),
    })
  }

  const { action: _action, ...prepareInput } = body
  const result = await preparePolymarketCopy(prepareInput)
  if (!result.ok) {
    const { status, ...responseBody } = result
    return res.status(status).json(responseBody)
  }
  const freeMarketplaceAccess = (req as Request & { payment?: { kind?: string } }).payment?.kind === 'okx_marketplace_free'
  return res.status(result.status).json({
    ...result.data,
    service: 'PolyDesk Governed Polymarket Trader',
    flowEndpoint: `${publicOrigin(req)}/api/polymarket-agent-flow`,
    executionEndpoint: freeMarketplaceAccess
      ? `${publicOrigin(req)}/api/a2mcp/polymarket-portfolio-watch`
      : `${publicOrigin(req)}/api/a2mcp/polymarket-agent-flow`,
    access: freeMarketplaceAccess
      ? { model: 'free', feeUsdt: '0' }
      : { model: 'paid' },
  })
}
