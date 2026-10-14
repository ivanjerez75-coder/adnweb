import * as cheerio from "cheerio";
import type { SiteData, SitePage, Technology } from "../types";

export interface ParsedPage {
  page: SitePage;
  links: string[];
  lang: string | null;
  hreflangs: string[];
  socialLinks: Record<string, string>;
  ctas: string[];
  jsonLdTypes: string[];
  prices: string[];
  hasAppLinks: boolean;
  mentionsTestimonials: boolean;
  mentionsFreeOrTrial: boolean;
  textLength: number;
}

const SOCIAL_HOSTS: Record<string, string> = {
  "twitter.com": "x",
  "x.com": "x",
  "linkedin.com": "linkedin",
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "youtube.com": "youtube",
  "tiktok.com": "tiktok",
  "github.com": "github",
};

const CTA_RE =
  /\b(empieza|empezar|comienza|prueba|probar|regístrate|registrarse|sign up|get started|start|try|comprar|buy|añadir al carrito|add to cart|suscríbete|subscribe|demo|contact sales|habla con ventas|descargar|download|reservar|book)\b/i;
const PRICE_RE = /[$€£]\s?\d{1,4}(?:[.,]\d{2})?|\d{1,4}(?:[.,]\d{2})?\s?(?:€|EUR|USD|\$)/g;
const TESTIMONIALS_RE =
  /(testimonios|testimonials|reseñas|reviews|opiniones|casos de éxito|case studies|trusted by|confían en)/i;
const FREE_RE =
  /\b(plan gratuito|prueba gratuita|prueba gratis|empieza gratis|gratis para siempre|free plan|free trial|try (it )?(for )?free|start for free|free forever|get started for free)\b/i;
const PRICING_PATH_RE = /\/(pricing|precios|tarifas|planes|plans)(\/|$)/i;
const BLOG_PATH_RE = /\/(blog|noticias|news|articulos|recursos)(\/|$)/i;

const KEY_PAGE_KINDS: [string, RegExp][] = [
  ["precios", PRICING_PATH_RE],
  ["blog", /^\/(blog|noticias|news|articulos|recursos)\/?$/i],
  ["about", /\/(about|about-us|nosotros|sobre-nosotros|quienes-somos|empresa|company)(\/|$)/i],
  ["producto", /\/(product|producto|productos|features|funcionalidades)(\/|$)/i],
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

function collectTypes(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (typeof type === "string" && !out.includes(type)) out.push(type);
    if (Array.isArray(obj["@graph"])) collectTypes(obj["@graph"], out);
  }
}

export function parsePage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectTypes(JSON.parse($(el).text()), jsonLdTypes);
    } catch {
      // JSON-LD mal formado: se ignora
    }
  });

  $("script, style, noscript, svg").remove();

  const title = clean($("title").first().text());
  const description = clean(
    $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "",
  );
  const headings = $("h1, h2, h3")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter(Boolean)
    .slice(0, 30);
  const text = clean($("body").text());

  const links: string[] = [];
  const socialLinks: Record<string, string> = {};
  let hasAppLinks = false;
  $("a[href]").each((_, el) => {
    let abs: URL;
    try {
      abs = new URL($(el).attr("href") ?? "", pageUrl);
    } catch {
      return;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
    const host = bareHost(abs.hostname);
    const network = SOCIAL_HOSTS[host];
    if (network && !socialLinks[network]) socialLinks[network] = abs.toString();
    if (host === "apps.apple.com" || host === "play.google.com") hasAppLinks = true;
    abs.hash = "";
    const href = abs.toString();
    if (!links.includes(href)) links.push(href);
  });

  const ctas = Array.from(
    new Set(
      $("a, button")
        .map((_, el) => clean($(el).text()))
        .get()
        .filter((t) => t.length > 0 && t.length <= 40 && CTA_RE.test(t)),
    ),
  );

  const lang = $("html").attr("lang")?.toLowerCase().split("-")[0] || null;
  const hreflangs = Array.from(
    new Set(
      $('link[rel="alternate"][hreflang]')
        .map((_, el) => ($(el).attr("hreflang") ?? "").toLowerCase().split("-")[0])
        .get()
        .filter((h) => h && h !== "x"),
    ),
  );

  return {
    page: { url: pageUrl, title, description, headings, text: text.slice(0, 8000) },
    links,
    lang,
    hreflangs,
    socialLinks,
    ctas,
    jsonLdTypes,
    prices: Array.from(new Set(text.match(PRICE_RE) ?? [])).slice(0, 20),
    hasAppLinks,
    mentionsTestimonials: TESTIMONIALS_RE.test(text),
    mentionsFreeOrTrial: FREE_RE.test(text),
    textLength: text.length,
  };
}

export function pickKeyPages(links: string[], homeUrl: string, max = 5): string[] {
  const homeHost = bareHost(new URL(homeUrl).hostname);
  const picked: string[] = [];
  const usedKinds = new Set<string>();
  for (const link of links) {
    if (picked.length >= max) break;
    const url = new URL(link);
    if (bareHost(url.hostname) !== homeHost || url.pathname === "/") continue;
    const kind = KEY_PAGE_KINDS.find(([, re]) => re.test(url.pathname))?.[0];
    if (!kind || usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    picked.push(link);
  }
  return picked;
}

export function buildSiteData(finalUrl: string, pages: ParsedPage[], technologies: Technology[]): SiteData {
  const allLinks = pages.flatMap((p) => p.links);
  const homeHost = bareHost(new URL(finalUrl).hostname);
  const sameHostPaths = [...pages.map((p) => p.page.url), ...allLinks]
    .map((u) => new URL(u))
    .filter((u) => bareHost(u.hostname) === homeHost)
    .map((u) => u.pathname);
  const socialLinks: Record<string, string> = {};
  for (const p of pages) {
    for (const [network, url] of Object.entries(p.socialLinks)) socialLinks[network] ??= url;
  }

  return {
    finalUrl,
    pages: pages.map((p) => p.page),
    languages: Array.from(
      new Set(pages.flatMap((p) => [p.lang, ...p.hreflangs]).filter((l): l is string => Boolean(l))),
    ),
    socialLinks,
    ctas: Array.from(new Set(pages.flatMap((p) => p.ctas))).slice(0, 20),
    hasPricingPage: sameHostPaths.some((path) => PRICING_PATH_RE.test(path)),
    pricesFound: Array.from(new Set(pages.flatMap((p) => p.prices))).slice(0, 20),
    hasBlog: sameHostPaths.some((path) => BLOG_PATH_RE.test(path)),
    hasTestimonials: pages.some((p) => p.mentionsTestimonials),
    hasFreePlanOrTrial: pages.some((p) => p.mentionsFreeOrTrial),
    hasAppLinks: pages.some((p) => p.hasAppLinks),
    jsonLdTypes: Array.from(new Set(pages.flatMap((p) => p.jsonLdTypes))),
    textLength: pages.reduce((sum, p) => sum + p.textLength, 0),
    technologies,
  };
}
