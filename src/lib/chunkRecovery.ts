const CHUNK_RECOVERY_KEY = 'polydesk:chunk-recovery:v1'
const CHUNK_RECOVERY_PARAM = 'pd-reload'

export function isChunkLoadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message)
}

export function recoverFromChunkLoadFailure(error: unknown) {
  if (!isChunkLoadFailure(error) || typeof window === 'undefined') return false
  const message = error instanceof Error ? error.message : String(error ?? '')

  try {
    if (window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) === message) return false
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, message)
    const url = new URL(window.location.href)
    url.searchParams.set(CHUNK_RECOVERY_PARAM, Date.now().toString())
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
  return true
}

export function clearChunkRecoveryMarker() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY)
    const url = new URL(window.location.href)
    if (!url.searchParams.has(CHUNK_RECOVERY_PARAM)) return
    url.searchParams.delete(CHUNK_RECOVERY_PARAM)
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    // Recovery storage and URL cleanup are optional.
  }
}
