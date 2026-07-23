import type { Request } from 'express'
import { verifiedPrivyUser } from './privy-circle-link.js'

type VerifiedPrivyIdentity = Awaited<ReturnType<typeof verifiedPrivyUser>>
type VerifyPrivyIdentity = (req: Request) => Promise<VerifiedPrivyIdentity>

export function stableWalletSlugFromEmail(email: string) {
  const clean = email.trim().toLowerCase()
  if (!clean) return ''
  let hash = 5381
  for (let index = 0; index < clean.length; index += 1) {
    hash = ((hash << 5) + hash + clean.charCodeAt(index)) >>> 0
  }
  return `wallet-${hash.toString(36)}`
}

export async function authorizeLpScoutPayer(
  req: Request,
  requestedAgentSlug: string,
  verify: VerifyPrivyIdentity = verifiedPrivyUser,
) {
  const identity = await verify(req)
  const authorizedAgentSlug = stableWalletSlugFromEmail(identity.email ?? '')
  if (!authorizedAgentSlug) {
    throw Object.assign(new Error('A verified Privy email is required for LP Scout payment.'), { status: 403 })
  }
  if (requestedAgentSlug !== authorizedAgentSlug) {
    throw Object.assign(new Error('The signed-in identity does not control this paying agent wallet.'), { status: 403 })
  }
  return { ...identity, agentSlug: authorizedAgentSlug }
}
