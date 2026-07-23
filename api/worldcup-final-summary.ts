import type { Request, Response } from 'express'

export const WORLD_CUP_2026_FINAL_SUMMARY = {
  tournament: 'FIFA World Cup 2026',
  status: 'completed',
  completedOn: '2026-07-19',
  podium: [
    { position: 1, team: 'Spain' },
    { position: 2, team: 'Argentina' },
    { position: 3, team: 'England' },
  ],
  final: {
    home: 'Spain',
    away: 'Argentina',
    score: '1-0',
    decided: 'after extra time',
  },
  bronzeFinal: {
    home: 'France',
    away: 'England',
    score: '4-6',
  },
  sources: [
    {
      label: 'FIFA final tournament standings',
      url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/final-tournament-standings',
    },
    {
      label: 'FIFA final report',
      url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/spain-argentina-final-report-highlights',
    },
  ],
} as const

export const FOOTBALL_DATA_ROADMAP = {
  status: 'coming_soon',
  competitions: [
    'English Premier League',
    'La Liga',
    'Bundesliga',
    'Serie A',
    'Ligue 1',
  ],
  message: "Live scores and data for Europe's five major domestic leagues are coming soon.",
} as const

export function createWorldCupFinalDeliverable(generatedAt = new Date()) {
  return {
    ok: true,
    service: 'World Cup 2026 Final Standings',
    availability: {
      live: false,
      reason: 'The FIFA World Cup 2026 has ended.',
    },
    result: WORLD_CUP_2026_FINAL_SUMMARY,
    roadmap: FOOTBALL_DATA_ROADMAP,
    generatedAt: generatedAt.toISOString(),
  }
}

export default function worldCupFinalSummaryHandler(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  return res.json(createWorldCupFinalDeliverable())
}
