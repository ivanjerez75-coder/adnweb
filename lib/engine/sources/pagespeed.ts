import type { Fetcher, PageSpeedData } from "../types";

export function parsePageSpeedScore(json: unknown): number | null {
  const score = (json as { lighthouseResult?: { categories?: { performance?: { score?: unknown } } } })
    ?.lighthouseResult?.categories?.performance?.score;
  return typeof score === "number" ? Math.round(score * 100) : null;
}

export async function fetchPageSpeed(url: string, fetcher: Fetcher, apiKey?: string): Promise<PageSpeedData> {
  const run = async (strategy: "mobile" | "desktop") => {
    const params = new URLSearchParams({ url, strategy, category: "performance" });
    if (apiKey) params.set("key", apiKey);
    const res = await fetcher(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`PageSpeed respondió ${res.status}`);
    return parsePageSpeedScore(await res.json());
  };

  const [mobile, desktop] = await Promise.allSettled([run("mobile"), run("desktop")]);
  const result: PageSpeedData = {
    mobile: mobile.status === "fulfilled" ? mobile.value : null,
    desktop: desktop.status === "fulfilled" ? desktop.value : null,
  };
  if (result.mobile === null && result.desktop === null) throw new Error("PageSpeed no disponible");
  return result;
}
