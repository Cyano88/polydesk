const HASH_PAYLINK_HOSTS = new Set([
  'hashpaylink.com',
  'app.hashpaylink.com',
])

export function trustedHashPayLinkUrl(value: string, pathPrefix?: string) {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || !HASH_PAYLINK_HOSTS.has(url.hostname)
      || (pathPrefix && !url.pathname.startsWith(pathPrefix))
    ) {
      return ''
    }
    return url.toString()
  } catch {
    return ''
  }
}

