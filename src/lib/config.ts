export const paylinkOrigin =
  (import.meta.env.VITE_PUBLIC_PAYLINK_ORIGIN as string | undefined)?.replace(/\/$/, '') || 'https://hashpaylink.com'

export const hashPayLinkBaseUrl =
  (import.meta.env.HASH_PAYLINK_BASE_URL as string | undefined)?.replace(/\/$/, '') || paylinkOrigin
