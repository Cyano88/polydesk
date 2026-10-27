import { z } from 'zod';
import {createHash} from 'node:crypto';
import { fixtureEvidence } from './polydesk-source-excerpt.js';

export const polyDeskGeneralResearchRequestSchema = z.object({
  schema: z.literal('zeroscout.polydesk-general-research.request'),
  schemaVersion: z.literal('1.0.0'),
  query: z.string().trim().min(2).max(180),
  requestedOutcome: z.string().trim().min(1).max(120).optional(),
  requestedSide: z.enum(['BUY', 'SELL']).optional(),
  market: z.object({
    conditionId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    question: z.string().trim().min(2).max(500),
    description: z.string().trim().max(8_000).optional(),
    resolutionRules: z.string().trim().min(2).max(12_000),
    resolutionSource: z.string().trim().max(500).optional(),
  }).strict(),
}).strict();

export type PolyDeskGeneralResearchRequest = z.infer<typeof polyDeskGeneralResearchRequestSchema>;

export type PolyDeskGeneralResearchArticle = {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  retrievedAt: string;
  evidenceRole: 'RESOLUTION_AUTHORITY' | 'EXTERNAL_SOURCE';
};

export type PolyDeskGeneralResearchResult = {
  articles: PolyDeskGeneralResearchArticle[];
  searchQueries: string[];
  retrievalProvider: 'Tavily Search';
};

type CacheEntry = { expiresAt: number; result: PolyDeskGeneralResearchResult };

const cache = new Map<string, CacheEntry>();

const DEFAULT_SEARCH_BASE_URL = 'https://api.tavily.com';
const DEFAULT_CACHE_MS = 10 * 60 * 1000;

type ResearchQueryRole = 'RESOLUTION_AUTHORITY' | 'CURRENT_CONFIRMING' | 'CURRENT_CONTRADICTORY';
type ResearchQuery = { role: ResearchQueryRole; query: string };

const RESEARCH_QUERY_ROLES: ResearchQueryRole[] = [
  'RESOLUTION_AUTHORITY',
  'CURRENT_CONFIRMING',
  'CURRENT_CONTRADICTORY',
];

const tavilyResultSchema = z.object({
  title: z.string().optional().default(''),
  url: z.string().url(),
  content: z.string().optional().default(''),
  raw_content: z.string().nullable().optional(),
  published_date: z.string().nullable().optional(),
  score: z.number().optional().default(0),
});

const tavilyResponseSchema = z.object({
  results: z.array(tavilyResultSchema).default([]),
});

type RankedCandidate = z.infer<typeof tavilyResultSchema> & { queryRole: ResearchQueryRole };

function cleanText(value: string, max = 500): string {
  const withoutControls = Array.from(value, (character) => {
    const code = character.codePointAt(0) || 0;
    return code <= 0x1f || code === 0x7f ? ' ' : character;
  }).join('');
  return withoutControls
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function keywordTerms(value: string): string[] {
  const stopWords = new Set([
    'about', 'after', 'before', 'could', 'from', 'have', 'into', 'market', 'official',
    'question', 'resolution', 'resolves', 'rules', 'shall', 'should', 'that', 'their',
    'there', 'these', 'this', 'those', 'through', 'under', 'will', 'with', 'would',
  ]);
  const seen = new Set<string>();
  return cleanText(value, 3_000)
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu)
    ?.filter((term) => !stopWords.has(term))
    .filter((term) => {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    })
    .slice(0, 14) ?? [];
}

function sourceHost(value: string | undefined): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return cleanText(value, 120);
  }
}

function isExcludedEvidenceUrl(url: string, resolutionSource: string | undefined): boolean {
  const host = sourceHost(url).toLowerCase();
  const resolutionHost = sourceHost(resolutionSource).toLowerCase();
  if (resolutionHost && host === resolutionHost) return false;
  const excludedHosts = [
    'facebook.com',
    'instagram.com',
    'polymarket.com',
    'reddit.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'youtube.com',
  ];
  return excludedHosts.some((excluded) => host === excluded || host.endsWith('.' + excluded));
}

export function buildPolyDeskResearchQueries(input: PolyDeskGeneralResearchRequest): string[] {
  const query = cleanText(input.query, 180);
  const question = cleanText(input.market.question, 300);
  const ruleTerms = keywordTerms(input.market.resolutionRules).slice(0, 8).join(' ');
  const authority = sourceHost(input.market.resolutionSource);
  return [...new Set([
    [query, 'latest verified update'].filter(Boolean).join(' '),
    [question, authority, 'official evidence'].filter(Boolean).join(' '),
    [ruleTerms, 'confirmation contradiction primary source'].filter(Boolean).join(' '),
  ].map((value) => cleanText(value, 300)).filter(Boolean))];
}

function deterministicResearchQueries(input: PolyDeskGeneralResearchRequest): ResearchQuery[] {
  const seeds = buildPolyDeskResearchQueries(input);
  return [
    { role: 'RESOLUTION_AUTHORITY', query: seeds[1] || seeds[0] },
    { role: 'CURRENT_CONFIRMING', query: seeds[0] || seeds[1] },
    { role: 'CURRENT_CONTRADICTORY', query: seeds[2] || seeds[0] },
  ].filter((entry): entry is ResearchQuery => Boolean(entry.query));
}

async function searchTavily(query: ResearchQuery, apiKey: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(DEFAULT_SEARCH_BASE_URL + '/search', {
    redirect: 'error',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query.query,
      search_depth: 'advanced',
      topic: query.role === 'RESOLUTION_AUTHORITY' ? 'general' : 'news',
      max_results: 5,
      include_answer: false,
      include_raw_content: 'text',
      include_images: false,
      include_published_date: true,
      auto_parameters: false,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error('Search retrieval unavailable'); }
  if (!response.body) throw new Error('Search response missing');
  const reader=response.body.getReader(); const parts:Buffer[]=[]; let bytes=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>1_000_000)throw new Error('Search response too large');parts.push(Buffer.from(value));} }
  finally {await reader.cancel().catch(()=>{});}
  const payload:unknown=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (!response.ok) throw new Error('Search retrieval failed with ' + response.status + '.');
  return tavilyResponseSchema.parse(payload).results;
}

function hasPublicationDate(candidate: z.infer<typeof tavilyResultSchema>): boolean {
  return Boolean(candidate.published_date && Number.isFinite(Date.parse(candidate.published_date)));
}

function rankRoleCandidates(candidates: RankedCandidate[], role: ResearchQueryRole, resolutionHost: string) {
  return [...candidates].sort((a, b) => {
    if (role === 'RESOLUTION_AUTHORITY' && resolutionHost) {
      const aAuthority = sourceHost(a.url).toLowerCase() === resolutionHost ? 1 : 0;
      const bAuthority = sourceHost(b.url).toLowerCase() === resolutionHost ? 1 : 0;
      if (aAuthority !== bAuthority) return bAuthority - aAuthority;
    }
    if (role !== 'RESOLUTION_AUTHORITY') {
      const aDated = hasPublicationDate(a) ? 1 : 0;
      const bDated = hasPublicationDate(b) ? 1 : 0;
      if (aDated !== bDated) return bDated - aDated;
    }
    return b.score - a.score;
  });
}

export function configuredSearchKey(env=process.env): string | undefined {
  // Accept the existing setup during migration; no ZeroScout HTTP call is involved.
  return [env.POLYDESK_SEARCH_API_KEY,env.TAVILY_API_KEY,env.ZEROSCOUT_GENERAL_SEARCH_API_KEY]
    .map(value=>value?.trim()).find(Boolean);
}
export function polyDeskGeneralResearchConfigured(env=process.env): boolean {
  return Boolean(configuredSearchKey(env));
}

export async function fetchPolyDeskGeneralResearch(
  raw: PolyDeskGeneralResearchRequest,
  {env=process.env,fetchImpl=fetch,now=Date.now}:{env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch;now?:()=>number}={},
): Promise<PolyDeskGeneralResearchResult> {
  const input=polyDeskGeneralResearchRequestSchema.parse(raw);
  const apiKey=configuredSearchKey(env);
  if(!apiKey)throw new Error('PolyDesk search key is not configured');  const cacheKey = [
    createHash('sha256').update(apiKey).digest('hex'),
    input.market.conditionId.toLowerCase(),
    cleanText(input.query, 180).toLowerCase(),
    input.requestedSide || '',
    cleanText(input.requestedOutcome || '', 120).toLowerCase(),
  ].join('|');
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) return cached.result;

  const searchQueries = deterministicResearchQueries(input);
  const batches = await Promise.all(searchQueries.map(async (query) => ({
    query,
    results: await searchTavily(query, apiKey, fetchImpl),
  })));
  const candidates: RankedCandidate[] = [];
  for (const batch of batches) {
    for (const candidate of batch.results) {
      if (isExcludedEvidenceUrl(candidate.url, input.market.resolutionSource)) continue;
      if (!/^https?:\/\//i.test(candidate.url)) continue;
      const description = fixtureEvidence(input.market.question, candidate,
        sourceHost(candidate.url).toLowerCase() === sourceHost(input.market.resolutionSource).toLowerCase());
      if (!description) continue;
      candidates.push({ ...candidate, raw_content: description, content: description, queryRole: batch.query.role });
    }
  }
  const retrievedAt = new Date(now()).toISOString();
  const resolutionHost = sourceHost(input.market.resolutionSource).toLowerCase();
  const selected: RankedCandidate[] = [];
  const selectedUrls = new Set<string>();
  for (const role of RESEARCH_QUERY_ROLES) {
    const candidate = rankRoleCandidates(candidates.filter((entry) => entry.queryRole === role), role, resolutionHost)
      .find((entry) => !selectedUrls.has(entry.url.toLowerCase()));
    if (!candidate) continue;
    selected.push(candidate);
    selectedUrls.add(candidate.url.toLowerCase());
  }
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (selected.length >= 8) break;
    const key = candidate.url.toLowerCase();
    if (selectedUrls.has(key)) continue;
    selected.push(candidate);
    selectedUrls.add(key);
  }
  const articles = selected
    .map((candidate) => ({
      title: cleanText(candidate.title, 500) || sourceHost(candidate.url) || 'Retrieved web source',
      description: cleanText(candidate.raw_content || candidate.content, 1_500),
      source: sourceHost(candidate.url) || 'Web source',
      url: candidate.url,
      publishedAt: cleanText(candidate.published_date || '', 80),
      retrievedAt,
      evidenceRole: resolutionHost && sourceHost(candidate.url).toLowerCase() === resolutionHost
        ? 'RESOLUTION_AUTHORITY' as const
        : 'EXTERNAL_SOURCE' as const,
    }))
    .filter((article) => article.description.length > 0);
  if (!articles.length) throw new Error('PolyDesk search returned no usable cited sources.');

  const result: PolyDeskGeneralResearchResult = {
    articles,
    searchQueries: searchQueries.map((entry) => entry.query),
    retrievalProvider: 'Tavily Search',
  };
  const cacheMs = DEFAULT_CACHE_MS;
  if(cache.size>=256)cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { expiresAt: now() + cacheMs, result });
  return result;
}
