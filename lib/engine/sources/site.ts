import type { PageGetter } from "../safe-fetch";
import type { SiteData } from "../types";
import { buildSiteData, parsePage, pickKeyPages, type ParsedPage } from "./site-parse";
import { detectTech } from "./tech";

export class SiteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteUnavailableError";
  }
}

export async function fetchSite(url: string, get: PageGetter): Promise<SiteData> {
  const home = await get(url);
  if (home.status >= 400) {
    throw new SiteUnavailableError(`La web respondió con el código ${home.status}.`);
  }

  const homeParsed = parsePage(home.text, home.url);
  const technologies = detectTech(home.text, home.headers);

  const extras = await Promise.allSettled(pickKeyPages(homeParsed.links, home.url).map((u) => get(u)));
  const parsed: ParsedPage[] = [homeParsed];
  for (const result of extras) {
    if (result.status === "fulfilled" && result.value.status < 400) {
      parsed.push(parsePage(result.value.text, result.value.url));
    }
  }

  return buildSiteData(home.url, parsed, technologies);
}
