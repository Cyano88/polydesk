import type { Request, Response } from 'express'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { isAddress } from 'viem'

const DEFAULT_HASH_PAYLINK_ORIGIN = 'https://hashpaylink.com'

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim()
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').replace(/,/g, '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return ''
  return Number(raw) > 0 ? raw : ''
}

function bearerToken(req: Request) {
  const header = req.headers.authorization ?? ''
  return header.match(/^Bearer\s+(.+)$/i)?.[1] ?? ''
}

function linkedEmail(user: User) {
  for (const account of user.linkedAccounts ?? []) {
    if (account.type === 'email' && 'address' in account && typeof account.address === 'string') {
      return account.address.toLowerCase()
    }
  }
  return ''
}

async function verifiedPrivySession(req: Request) {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    const error = new Error('Privy server auth is not configured.')
    ;(error as Error & { status?: number }).status = 503
    throw error
  }
  const token = bearerToken(req)
  if (!token) {
    const error = new Error('Sign in before creating a Naira funding checkout.')
    ;(error as Error & { status?: number }).status = 401
    throw error
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  const user = await client.getUserById(claims.userId)
  return { userId: claims.userId, email: linkedEmail(user) }
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }

    const serviceToken = process.env.HASH_PAYLINK_POLYDESK_SERVICE_TOKEN?.trim()
    if (!serviceToken) return res.status(503).json({ ok: false, error: 'Hash PayLink funding bridge is not configured.' })

    const session = await verifiedPrivySession(req)
    if (!session.email) return res.status(401).json({ ok: false, error: 'Sign in with email before creating a Naira funding checkout.' })

    const amount = cleanAmount(req.body?.amount)
    const destinationAddress = cleanText(req.body?.destination_address)
    const destinationNetwork = cleanText(req.body?.network, 'base').toLowerCase() === 'polygon' ? 'polygon' : 'base'
    const clientOrigin = cleanText(req.body?.client_origin, DEFAULT_HASH_PAYLINK_ORIGIN)
    if (!amount) return res.status(400).json({ ok: false, error: 'Enter a valid Naira amount.' })
    if (!isAddress(destinationAddress)) return res.status(400).json({ ok: false, error: 'Could not prepare a valid bridge address.' })

    const hashPayLinkOrigin = (process.env.HASH_PAYLINK_BASE_URL ?? process.env.VITE_PUBLIC_PAYLINK_ORIGIN ?? DEFAULT_HASH_PAYLINK_ORIGIN).replace(/\/+$/, '')
    const response = await fetch(`${hashPayLinkOrigin}/api/ng-pos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        action: 'createBankSend',
        owner_id: `polydesk:${session.userId}`,
        owner_email: session.email,
        owner_first_name: '',
        owner_last_name: '',
        display_name: 'PolyDesk funding',
        amount,
        flexible_amount: false,
        network: destinationNetwork,
        destination_address: destinationAddress,
        client_origin: clientOrigin,
      }),
    })
    const data = await response.json().catch(() => undefined) as {
      ok?: boolean
      error?: string
      link?: { payment_url?: string; link_id?: string }
    } | undefined
    if (!response.ok || !data?.ok || !data.link?.payment_url) {
      return res.status(response.status || 502).json({ ok: false, error: data?.error || 'Could not create Naira funding checkout.' })
    }
    return res.json({ ok: true, link: data.link })
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500
    return res.status(status).json({ ok: false, error: error instanceof Error ? error.message : 'Could not create Naira funding checkout.' })
  }
}
