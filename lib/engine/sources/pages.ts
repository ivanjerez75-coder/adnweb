import * as cheerio from "cheerio";
import type { PageGetter } from "../safe-fetch";
import type { PageDoc, SiteData, SitemapData } from "../types";
import { registrableDomain } from "../redirect";
import { isPriorityPath } from "./sections";

const MAX_CITA = 200;
const MIN_CITA = 30;
const MAX_PAGES = 15;
const NOISE = "script, style, noscript, template, svg, nav, footer, form, iframe, [hidden], [aria-hidden='true']";
const BLOCKS = "p, li, h1, h2, h3, h4, blockquote, figcaption, dd";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Frases o párrafos literales (30–200 caracteres) del contenido principal; nunca se reescriben. */
export function extractPassages(html: string, max = 25): string[] {
  const $ = cheerio.load(html);
  $(NOISE).remove();
  const main = $("main").first();
  const body = $("body").first();
  const root = main.length ? main : body.length ? body : $.root().children();
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (text: string) => {
    const t = clean(text);
    if (t.length < MIN_CITA || t.length > MAX_CITA || seen.has(t)) return false;
    seen.add(t);
    out.push(t);
    return true;
  };
  for (const el of root.find(BLOCKS).toArray()) {
    if (out.length >= max) break;
    const $el = $(el);
    if ($el.find(BLOCKS).length > 0) continue; // el contenedor se lee por sus hijos
    const text = clean($el.text());
    if (text.length <= MAX_CITA) {
      add(text);
      continue;
    }
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (out.length >= max) break;
      add(sentence);
    }
  }
  return out.slice(0, max);
}

const stripUrl = (u: string): URL | null => {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url;
  } catch {
    return null;
  }
};

/** Home primero y luego las secciones de negocio; solo el dominio registrable propio, sin duplicados. */
export function selectPages(home: SiteData, sitemap: SitemapData | null, max = MAX_PAGES): string[] {
  const homeUrl = stripUrl(home.finalUrl);
  if (!homeUrl) return [];
  const own = registrableDomain(homeUrl.hostname);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    if (out.length >= max) return;
    const url = stripUrl(u);
    if (!url || registrableDomain(url.hostname) !== own) return;
    const key = url.toString();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  const read = home.pages.map((p) => p.url);
  const candidates = sitemap?.candidatas ?? [];
  const isPriority = (u: string) => {
    const url = stripUrl(u);
    return !!url && isPriorityPath(url.pathname);
  };
  push(home.finalUrl);
  for (const u of [...read, ...candidates]) if (isPriority(u)) push(u);
  for (const u of read) push(u);
  return out;
}

/** Lee las páginas en paralelo y devuelve las que terminan antes de `timeoutMs`; ids p1…pN en orden de URL. */
export async function fetchPages(
  urls: string[],
  get: PageGetter,
  opts: { timeoutMs: number },
): Promise<PageDoc[]> {
  const ownRoot = (() => {
    try {
      return registrableDomain(new URL(urls[0]).hostname);
    } catch {
      return null;
    }
  })();
  const sameSite = (u: string) => {
    try {
      return ownRoot === null || registrableDomain(new URL(u).hostname) === ownRoot;
    } catch {
      return false;
    }
  };
  const done: (Omit<PageDoc, "id" | "extractos"> & { passages: string[] } | null)[] = urls.map(() => null);
  const reads = urls.map(async (url, i) => {
    try {
      const page = await get(url);
      if (page.status >= 400) return;
      if (!sameSite(page.url || url)) return; // redirección a otro dominio: no es la web analizada
      const $ = cheerio.load(page.text);
      done[i] = {
        url: page.url || url,
        titulo: clean($("title").first().text()),
        tieneDescripcion: clean($('meta[name="description" i]').first().attr("content") ?? "").length > 0,
        passages: extractPassages(page.text),
      };
    } catch {
      // página que falla: se omite
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, opts.timeoutMs);
    (timer as { unref?: () => void }).unref?.();
  });
  await Promise.race([Promise.all(reads), timeout]);
  clearTimeout(timer);

  const docs: PageDoc[] = [];
  for (const d of done) {
    if (!d) continue;
    const id = `p${docs.length + 1}`;
    docs.push({ id, url: d.url, titulo: d.titulo, tieneDescripcion: d.tieneDescripcion, extractos: d.passages.map((cita, k) => ({ id: `${id}-e${k + 1}`, cita })) });
  }
  return docs;
}
