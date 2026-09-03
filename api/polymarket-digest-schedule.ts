export type PolymarketDigestFrequency = 'off' | 'daily' | 'weekly'

const WEEKDAYS = new Map([
  ['Sun', 0],
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
])

export function validDigestTimezone(value: unknown) {
  const timezone = String(value ?? '').trim()
  if (!timezone || timezone.length > 80) return ''
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return ''
  }
}

export function nextPolymarketDigestAt(input: {
  after: Date
  frequency: PolymarketDigestFrequency
  timezone: string
  hourLocal: number
  weekday: number
}) {
  if (input.frequency === 'off') return null
  const timezone = validDigestTimezone(input.timezone)
  const hourLocal = Math.trunc(input.hourLocal)
  const weekday = Math.trunc(input.weekday)
  if (!timezone || hourLocal < 0 || hourLocal > 23 || weekday < 0 || weekday > 6) return null
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const current = Object.fromEntries(formatter.formatToParts(input.after).map(part => [part.type, part.value]))
  const currentDate = `${current.year}-${current.month}-${current.day}`
  const currentWeekday = WEEKDAYS.get(current.weekday)
  const beforeTarget = Number(current.hour) < hourLocal
  const sameDateAllowed = input.frequency === 'daily'
    ? beforeTarget
    : currentWeekday === weekday && beforeTarget
  const start = Math.ceil((input.after.getTime() + 1) / 60_000) * 60_000
  const end = start + 8 * 24 * 60 * 60_000
  for (let cursor = start; cursor <= end; cursor += 60_000) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(cursor)).map(part => [part.type, part.value]))
    if (Number(parts.hour) !== hourLocal || Number(parts.minute) !== 0) continue
    const candidateDate = `${parts.year}-${parts.month}-${parts.day}`
    if (candidateDate === currentDate && !sameDateAllowed) continue
    if (input.frequency === 'weekly' && WEEKDAYS.get(parts.weekday) !== weekday) continue
    return new Date(cursor)
  }
  return null
}
