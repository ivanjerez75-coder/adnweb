import type { FetchedPage, PageGetter } from "../safe-fetch";
import type { SitemapData, SitemapSection } from "../types";

const MAX_SITEMAP_FILES = 4; // raíz + 3 hijos
const MAX_TOTAL_BYTES = 5_000_000;
const MAX_URLS = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SECTION_RES: [SitemapSection, RegExp][] = [
  ["blog", /\/(blog|noticias|news|articulos|recursos)(\/|$)/i],
  ["ayuda", /\/(help|ayuda|support|soporte|faq)(\/|$)/i],
  ["precios", /\/(pricing|precios|tarifas|planes|plans)(\/|$)/i],
  ["empleo", /\/(careers|jobs|empleo|trabaja-con-nosotros|join-us)(\/|$)/i],
  ["docs", /\/(docs|documentation|documentacion|developers)(\/|$)/i],
];

const LANGUAGE_CODES = new Set([
  "es", "en", "fr", "de", "it", "pt", "nl", "pl", "ru", "ja", "zh", "ko", "sv", "da", "no", "fi",
  "tr", "ar", "ca", "eu", "gl", "cs", "ro", "hu", "el", "he", "id", "th", "vi", "uk",
]);

export interface SitemapUrl {
  loc: string;
  lastmod: string | null;
  hreflangs: string[];
}

export interface ParsedSitemap {
  kind: "index" | "urlset";
  children: string[];
  urls: SitemapUrl[];
}

const decode = (s: string) => s.replace(/&amp;/g, "&").trim();

export function parseSitemapXml(xml: string): ParsedSitemap {
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const children = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<]+?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)].map((m) => decode(m[1]));
    return { kind: "index", children, urls: [] };
  }
  const urls: SitemapUrl[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = m[1];
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    urls.push({
      loc: decode(loc),
      lastmod: block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1] ?? null,
      hreflangs: [...block.matchAll(/hreflang=["']([a-zA-Z-]+)["']/g)].map((h) => h[1].toLowerCase()),
    });
  }
  return { kind: "urlset", children: [], urls };
}

export function sitemapsFromRobots(robots: string, origin: string): string[] {
  const out: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const value = line.match(/^\s*sitemap:\s*(\S+)/i)?.[1];
    if (!value) continue;
    try {
      const url = new URL(value, origin);
      if (url.protocol === "http:" || url.protocol === "https:") out.push(url.toString());
    } catch {
      // línea inválida
    }
  }
  return out.slice(0, 3);
}

export function summarizeSitemap(urls: SitemapUrl[], now: Date): SitemapData {
  const sections = new Set<SitemapSection>();
  const languages = new Set<string>();
  let latest = 0;
  let recentBlogPosts = 0;

  for (const u of urls) {
    let path: string;
    try {
      path = new URL(u.loc).pathname;
    } catch {
      continue;
    }
    const urlSections = SECTION_RES.filter(([, re]) => re.test(path)).map(([s]) => s);
    urlSections.forEach((s) => sections.add(s));

    const first = path.split("/").filter(Boolean)[0]?.toLowerCase().split("-")[0];
    if (first && LANGUAGE_CODES.has(first)) languages.add(first);
    for (const h of u.hreflangs) {
      const l = h.split("-")[0];
      if (LANGUAGE_CODES.has(l)) languages.add(l);
    }

    const t = u.lastmod ? Date.parse(u.lastmod) : NaN;
    if (Number.isFinite(t) && t <= now.getTime() + DAY_MS) {
      latest = Math.max(latest, t);
      if (urlSections.includes("blog") && now.getTime() - t <= 90 * DAY_MS) recentBlogPosts++;
    }
  }

  return {
    urlCount: urls.length,
    sections: SECTION_RES.map(([s]) => s).filter((s) => sections.has(s)),
    languages: [...languages].sort(),
    lastModified: latest ? new Date(latest).toISOString().slice(0, 10) : null,
    recentBlogPosts,
  };
}

export async function fetchSitemap(siteUrl: string, get: PageGetter, now: Date): Promise<SitemapData | null> {
  const origin = new URL(siteUrl).origin;
  let requests = 0;
  let failures = 0;

  const tryGet = async (url: string): Promise<FetchedPage | null> => {
    requests++;
    try {
      return await get(url);
    } catch {
      failures++;
      return null;
    }
  };

  let queue: string[] = [];
  const robots = await tryGet(`${origin}/robots.txt`);
  if (robots && robots.status < 400) queue = sitemapsFromRobots(robots.text, origin);
  if (queue.length === 0) queue = [`${origin}/sitemap.xml`];

  const seen = new Set<string>();
  const urls: SitemapUrl[] = [];
  let bytes = 0;
  let parsedAny = false;

  while (queue.length > 0 && seen.size < MAX_SITEMAP_FILES && bytes < MAX_TOTAL_BYTES && urls.length < MAX_URLS) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const file = await tryGet(next);
    if (!file || file.status >= 400 || /\.gz$/i.test(next)) continue;
    bytes += file.text.length;
    const parsed = parseSitemapXml(file.text);
    if (parsed.kind === "index") {
      parsedAny = true;
      queue.push(...parsed.children.filter((c) => /^https?:\/\//i.test(c)));
    } else if (parsed.urls.length > 0) {
      parsedAny = true;
      urls.push(...parsed.urls.slice(0, MAX_URLS - urls.length));
    }
  }

  if (!parsedAny) {
    if (requests > 0 && failures === requests) throw new Error("No se pudo leer el sitemap");
    return null;
  }
  return summarizeSitemap(urls, now);
}
