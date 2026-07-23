import type { Request, Response } from 'express'
import { findAgentActivity, listAgentActivity } from './agent-activity.js'

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  const activityId = String(req.query.id ?? '').trim()
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(activityId)) {
    return res.status(400).json({ ok: false, error: 'A valid activity ID is required.' })
  }

  const scout = await findAgentActivity(activityId)
  if (!scout || scout.type !== 'scout_returned') {
    return res.status(404).json({ ok: false, error: 'LP Scout activity was not found.' })
  }

  const related = (await listAgentActivity(scout.agentSlug, 80)).filter(item => (
    item.id === scout.id
    || asObject(item.result).sourceActivityId === scout.id
  ))

  return res.json({ ok: true, activity: related })
}
