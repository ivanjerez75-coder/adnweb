import type { FetchedPage, PageGetter } from "../safe-fetch";
import type { SitemapData, SitemapSection } from "../types";
import { sectionOf } from "./sections";

const MAX_SITEMAP_FILES = 4; // raíz + 3 hijos
const MAX_TOTAL_BYTES = 5_000_000;
const MAX_URLS = 50_000;
/** El PageGetter corta las respuestas en 2 MB: un archivo de ese tamaño puede venir incompleto. */
const POSSIBLY_TRUNCATED_CHARS = 1_999_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SECTIONS: SitemapSection[] = ["blog", "ayuda", "precios", "empleo", "docs"];

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
  /** Sitemaps hijos: los de un índice, o los loc .xml / .xml.gz de un urlset (no son páginas). */
  children: string[];
  urls: SitemapUrl[];
}

const NS = "(?:[\\w-]+:)?";

/** Un loc que apunta a otro sitemap (.xml o .xml.gz), no a una página. */
const SITEMAP_FILE_RE = /\.xml(?:\.gz)?$/i;

const pathnameOf = (u: string): string => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

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
  const children: string[] = [];
  for (const m of xml.matchAll(tagRe("url", "gi"))) {
    if (urls.length >= maxUrls) break;
    const block = m[1];
    const loc = readTag(block, "loc");
    if (!loc) continue;
    // Algunos urlset listan otros sitemaps como si fueran páginas: se tratan como hijos.
    if (SITEMAP_FILE_RE.test(pathnameOf(loc))) {
      if (!children.includes(loc)) children.push(loc);
      continue;
    }
    urls.push({
      loc,
      lastmod: readTag(block, "lastmod"),
      hreflangs: [...block.matchAll(/hreflang=["']([a-zA-Z-]+)["']/g)].map((h) => h[1].toLowerCase()),
    });
  }
  return { kind: "urlset", children, urls };
}

/**
 * Todas las líneas Sitemap http(s) de robots.txt, sin duplicados y sin tope: el tope de archivos
 * lo aplica fetchSitemap, que marca el resultado como incompleto si alguna queda sin leer.
 */
export function sitemapsFromRobots(robots: string, origin: string): string[] {
  const out: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const value = line.match(/^\s*sitemap:\s*(\S+)/i)?.[1];
    if (!value) continue;
    try {
      const url = new URL(value, origin);
      const href = url.toString();
      if ((url.protocol === "http:" || url.protocol === "https:") && !out.includes(href)) out.push(href);
    } catch {
      // línea inválida
    }
  }
  return out;
}

/**
 * Resume las URLs leídas. `complete` indica que se leyó el sitemap entero (sin archivos
 * pendientes, fallidos, .gz ni cortados por un tope); solo entonces una ausencia prueba algo.
 */
export function summarizeSitemap(urls: SitemapUrl[], now: Date, complete = true): SitemapData {
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
    const found = sectionOf(path)?.section;
    const urlSection = found && (SECTIONS as string[]).includes(found) ? (found as SitemapSection) : null;
    if (urlSection) sections.add(urlSection);

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
      if (urlSection === "blog" && now.getTime() - t <= 90 * DAY_MS) recentBlogPosts++;
    }
  }

  return {
    urlCount: urls.length,
    sections: SECTIONS.filter((s) => sections.has(s)),
    languages: [...languages].sort(),
    lastModified: latest ? new Date(latest).toISOString().slice(0, 10) : null,
    recentBlogPosts,
    complete: complete && urls.length > 0,
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

/** Si no caben todos los sitemaps (de robots.txt, de un índice o de un urlset), primero los de blog. */
const blogFirst = (children: string[]) => [
  ...children.filter((c) => /blog/i.test(c)),
  ...children.filter((c) => !/blog/i.test(c)),
];

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
  if (robots && robots.status < 400) queue = blogFirst(sitemapsFromRobots(robots.text, origin));
  if (queue.length === 0) queue = [`${origin}/sitemap.xml`];

  const seen = new Set<string>();
  const urls: SitemapUrl[] = [];
  let bytes = 0;
  let files = 0;
  let parsedAny = false;
  let complete = true;

  while (queue.length > 0 && files < MAX_SITEMAP_FILES && bytes < MAX_TOTAL_BYTES && urls.length < MAX_URLS) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    if (/\.gz$/i.test(pathnameOf(next))) {
      complete = false; // comprimido: no se lee
      continue;
    }
    files++;
    const file = await tryGet(next);
    if (!file || file.status >= 400) {
      complete = false;
      continue;
    }
    if (bytes + file.text.length > MAX_TOTAL_BYTES) {
      complete = false;
      break;
    }
    bytes += file.text.length;
    if (file.text.length >= POSSIBLY_TRUNCATED_CHARS) complete = false;
    const parsed = parseSitemapXml(file.text, MAX_URLS - urls.length);
    // Hijos de un índice o loc .xml de un urlset: mismos topes y misma regla de completitud.
    queue.push(...blogFirst(parsed.children.filter(isHttpUrl)));
    if (parsed.urls.length > 0) {
      parsedAny = true;
      for (const u of parsed.urls) urls.push(u);
    }
  }
  // Sitemaps declarados (en robots.txt, índices o urlset) sin leer por el tope de archivos, de bytes o de URLs.
  if (queue.some((u) => !seen.has(u)) || urls.length >= MAX_URLS) complete = false;

  // Solo cuenta como comprobado si se leyó alguna URL: un índice con todos sus hijos fallidos o .gz no prueba nada.
  if (!parsedAny) {
    if (requests > 0 && failures === requests) throw new Error("No se pudo leer el sitemap");
    return null;
  }
  return summarizeSitemap(urls, now, complete);
}
