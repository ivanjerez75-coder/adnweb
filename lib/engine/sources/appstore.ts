import { getDomain } from "tldts";
import type { AppStoreData, Fetcher } from "../types";

interface ItunesResult {
  trackName?: unknown;
  averageUserRating?: unknown;
  userRatingCount?: unknown;
  trackViewUrl?: unknown;
  sellerUrl?: unknown;
}

const ITUNES = "https://itunes.apple.com";

async function itunes(url: string, fetcher: Fetcher): Promise<ItunesResult[]> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`App Store respondió ${res.status}`);
  const json = (await res.json()) as { results?: unknown };
  return Array.isArray(json.results) ? (json.results as ItunesResult[]) : [];
}

function toApp(r: ItunesResult, linkedFromSite: boolean): AppStoreData | null {
  if (typeof r.trackName !== "string" || typeof r.trackViewUrl !== "string") return null;
  return {
    name: r.trackName,
    rating: typeof r.averageUserRating === "number" ? Math.round(r.averageUserRating * 10) / 10 : null,
    ratingCount: typeof r.userRatingCount === "number" ? r.userRatingCount : 0,
    url: r.trackViewUrl,
    linkedFromSite,
  };
}

const best = (apps: (AppStoreData | null)[]) =>
  apps.filter((a): a is AppStoreData => a !== null).sort((a, b) => b.ratingCount - a.ratingCount)[0] ?? null;

function sellerDomain(r: ItunesResult): string | null {
  if (typeof r.sellerUrl !== "string") return null;
  try {
    return getDomain(new URL(r.sellerUrl).hostname, { allowPrivateDomains: true });
  } catch {
    return null;
  }
}

export async function fetchAppStore(
  input: { appIds: string[]; companyName: string; rootDomain: string },
  fetcher: Fetcher,
): Promise<AppStoreData | null> {
  if (input.appIds.length > 0) {
    const linked = best((await itunes(`${ITUNES}/lookup?id=${input.appIds.slice(0, 5).join(",")}`, fetcher)).map((r) => toApp(r, true)));
    if (linked) return linked;
  }
  const results = await itunes(
    `${ITUNES}/search?term=${encodeURIComponent(input.companyName)}&entity=software&limit=10`,
    fetcher,
  );
  return best(results.filter((r) => sellerDomain(r) === input.rootDomain).map((r) => toApp(r, false)));
}
