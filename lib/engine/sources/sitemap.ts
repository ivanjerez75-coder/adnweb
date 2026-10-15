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

/** Segmento completo de idioma: "es", "en-us", "pt-br". Rechaza "no-te-pierdas", "it-services", "id-card". */
const LANGUAGE_SEGMENT_RE = /^([a-z]{2})(?:-[a-z]{2})?$/i;

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

const NS = "(?:[\\w-]+:)?";

/** Elemento XML con o sin prefijo de espacio de nombres y con atributos opcionales. */
const tagRe = (name: string, flags: string) =>
  new RegExp(`<${NS}${name}\\b[^>]*>([\\s\\S]*?)<\\/${NS}${name}\\s*>`, flags);

const ENTITIES: Record<string, string> = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Texto de un elemento hijo: admite CDATA (sin decodificar) y entidades XML. */
function readTag(block: string, name: string): string | null {
  const raw = block.match(tagRe(name, "i"))?.[1];
  if (raw === undefined) return null;
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const text = (cdata ? cdata[1] : decodeXml(raw)).trim();
  return text || null;
}

export function parseSitemapXml(xml: string, maxUrls = MAX_URLS): ParsedSitemap {
  if (new RegExp(`<${NS}sitemapindex\\b`, "i").test(xml)) {
    const children: string[] = [];
    for (const m of xml.matchAll(tagRe("sitemap", "gi"))) {
      const loc = readTag(m[1], "loc");
      if (loc) children.push(loc);
    }
    return { kind: "index", children, urls: [] };
  }
  const urls: SitemapUrl[] = [];
  for (const m of xml.matchAll(tagRe("url", "gi"))) {
    if (urls.length >= maxUrls) break;
    const block = m[1];
    const loc = readTag(block, "loc");
    if (!loc) continue;
    urls.push({
      loc,
      lastmod: readTag(block, "lastmod"),
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

    const segment = LANGUAGE_SEGMENT_RE.exec(path.split("/").filter(Boolean)[0] ?? "");
    const first = segment?.[1].toLowerCase();
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

const isHttpUrl = (u: string): boolean => {
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
};

const pathnameOf = (u: string): string => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

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
    if (!file || file.status >= 400 || /\.gz$/i.test(pathnameOf(next))) continue;
    if (bytes + file.text.length > MAX_TOTAL_BYTES) break;
    bytes += file.text.length;
    const parsed = parseSitemapXml(file.text, MAX_URLS - urls.length);
    if (parsed.kind === "index") {
      parsedAny = true;
      queue.push(...parsed.children.filter(isHttpUrl));
    } else if (parsed.urls.length > 0) {
      parsedAny = true;
      for (const u of parsed.urls) urls.push(u);
    }
  }

  if (!parsedAny) {
    if (requests > 0 && failures === requests) throw new Error("No se pudo leer el sitemap");
    return null;
  }
  return summarizeSitemap(urls, now);
}
