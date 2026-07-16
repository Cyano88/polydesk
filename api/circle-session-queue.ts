const commandTails = new Map<string, Promise<void>>()

export async function withCircleSessionLock<T>(key: string, command: () => Promise<T>): Promise<T> {
  const previous = commandTails.get(key) ?? Promise.resolve()
  let releaseCurrent!: () => void
  const current = new Promise<void>(resolve => {
    releaseCurrent = resolve
  })
  const tail = previous.catch(() => undefined).then(() => current)
  commandTails.set(key, tail)
  await previous.catch(() => undefined)

  try {
    return await command()
  } finally {
    releaseCurrent()
    if (commandTails.get(key) === tail) commandTails.delete(key)
  }
}
