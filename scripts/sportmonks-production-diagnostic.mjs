const apiKey = process.env.POLY_STREAM_API_KEY || process.env.SPORTS_API_KEY
const configuredLeagueIds = process.env.POLY_STREAM_LEAGUE_IDS || process.env.POLY_STREAM_LEAGUE_ID || ''

if (!apiKey) throw new Error('Sportmonks API key is not configured.')

function isoDate(offsetDays) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

const base = 'https://api.sportmonks.com/v3/football'
const requests = [
  ['leagues', `${base}/leagues`],
  ['range', `${base}/fixtures/between/${isoDate(-7)}/${isoDate(21)}?include=participants;state;scores;league&per_page=50`],
  ['configured-leagues', `${base}/fixtures/between/${isoDate(-7)}/${isoDate(21)}?include=participants;state;scores;league&per_page=50&filters=fixtureLeagues:${configuredLeagueIds}`],
]

for (const [name, rawUrl] of requests) {
  const url = new URL(rawUrl)
  url.searchParams.set('api_token', apiKey)
  const response = await fetch(url)
  const body = await response.json().catch(() => ({}))
  const data = Array.isArray(body.data) ? body.data : []
  console.log(JSON.stringify({
    name,
    status: response.status,
    count: data.length,
    configuredLeagueIds: name === 'leagues' ? configuredLeagueIds : undefined,
    leagueIds: [...new Set(data.map(item => item.league_id || item.id))].slice(0, 30),
    names: data.slice(0, 10).map(item => item.name),
    error: body.message || body.error || null,
  }))
}
