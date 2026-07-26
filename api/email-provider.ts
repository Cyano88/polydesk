const EMAIL_TIMEOUT_MS = 10_000
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

type SendEmailInput = {
  to: string
  fromEmail?: string
  fromName?: string
  subject: string
  text: string
  html: string
  context: string
}

function formatFrom(email?: string, name?: string) {
  if (!email) return ''
  return name ? `${name} <${email}>` : email
}

export async function sendTransactionalEmail(input: SendEmailInput) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim()
  if (!resendApiKey || !input.fromEmail) {
    throw new Error(`${input.context} email is not configured. Set RESEND_API_KEY and a verified FROM email.`)
  }
  const from = formatFrom(input.fromEmail, input.fromName)
  let lastStatus = 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS)
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'PolyDesk/1.0 (+https://polydesk.trade)',
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      })
      if (response.ok) return
      lastStatus = response.status
      if (!TRANSIENT_STATUS.has(response.status)) break
    } catch (error) {
      if (attempt > 0) {
        throw new Error(`${input.context} email provider is unavailable.`, { cause: error })
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(lastStatus
    ? `${input.context} email provider returned HTTP ${lastStatus}.`
    : `${input.context} email provider is unavailable.`)
}
