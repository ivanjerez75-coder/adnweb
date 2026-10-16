import type { Fetcher, HackerNewsData } from "../types";

const HN = "https://hn.algolia.com/api/v1/search";

interface AlgoliaResponse {
  nbHits?: unknown;
  hits?: { title?: unknown; points?: unknown }[];
}

async function search(url: string, fetcher: Fetcher): Promise<AlgoliaResponse> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Hacker News respondió ${res.status}`);
  return (await res.json()) as AlgoliaResponse;
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export async function fetchHackerNews(domain: string, fetcher: Fetcher, now: Date): Promise<HackerNewsData> {
  const base = `${HN}?query=${encodeURIComponent(`"${domain}"`)}&restrictSearchableAttributes=url&tags=story`;
  const since = Math.floor(now.getTime() / 1000) - 365 * 24 * 60 * 60;
  const [all, lastYear] = await Promise.all([
    search(`${base}&hitsPerPage=1`, fetcher),
    search(`${base}&hitsPerPage=0&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}`, fetcher),
  ]);
  const hit = all.hits?.[0];
  return {
    total: count(all.nbHits),
    lastYear: count(lastYear.nbHits),
    top: hit && typeof hit.title === "string" ? { title: hit.title, points: count(hit.points) } : null,
  };
}
