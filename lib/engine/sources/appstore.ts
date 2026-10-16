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
const COUNTRIES = ["us", "es"];

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

/** Une resultados de varias tiendas: una app por trackViewUrl, con el mayor número de valoraciones. */
function merge(apps: (AppStoreData | null)[]): AppStoreData[] {
  const byUrl = new Map<string, AppStoreData>();
  for (const a of apps) {
    if (!a) continue;
    const prev = byUrl.get(a.url);
    if (!prev || a.ratingCount > prev.ratingCount) byUrl.set(a.url, a);
  }
  return [...byUrl.values()];
}

/** Primero las apps cuyo nombre empieza por el de la empresa; después, las más valoradas. */
function best(apps: AppStoreData[], companyName: string): AppStoreData | null {
  const name = companyName.trim().toLowerCase();
  const prefix = (a: AppStoreData) => (name && a.name.toLowerCase().startsWith(name) ? 1 : 0);
  return [...apps].sort((a, b) => prefix(b) - prefix(a) || b.ratingCount - a.ratingCount)[0] ?? null;
}

function sellerDomain(r: ItunesResult): string | null {
  if (typeof r.sellerUrl !== "string") return null;
  try {
    return getDomain(new URL(r.sellerUrl).hostname, { allowPrivateDomains: true })?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function fetchAppStore(
  input: { appIds: string[]; companyName: string; domains: string[] },
  fetcher: Fetcher,
): Promise<AppStoreData | null> {
  if (input.appIds.length > 0) {
    const lookup = `${ITUNES}/lookup?id=${input.appIds.slice(0, 5).join(",")}`;
    let linked = best(merge((await itunes(lookup, fetcher)).map((r) => toApp(r, true))), input.companyName);
    // Apps que solo existen en la tienda española.
    if (!linked) linked = best(merge((await itunes(`${lookup}&country=es`, fetcher)).map((r) => toApp(r, true))), input.companyName);
    if (linked) return linked;
  }

  const domains = new Set(input.domains.map((d) => d.toLowerCase()));
  const term = `${ITUNES}/search?term=${encodeURIComponent(input.companyName)}&entity=software&limit=10`;
  const searches = await Promise.allSettled(COUNTRIES.map((c) => itunes(`${term}&country=${c}`, fetcher)));
  const results = searches.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const found = best(
    merge(results.filter((r) => { const d = sellerDomain(r); return d !== null && domains.has(d); }).map((r) => toApp(r, false))),
    input.companyName,
  );
  // Si una tienda falló y la otra no encontró nada, no se puede afirmar que no haya app.
  if (!found && searches.some((s) => s.status === "rejected")) {
    const failure = searches.find((s): s is PromiseRejectedResult => s.status === "rejected");
    throw failure?.reason instanceof Error ? failure.reason : new Error("App Store no responde");
  }
  return found;
}
