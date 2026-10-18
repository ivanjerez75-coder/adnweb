import * as cheerio from "cheerio";
import type { JobBoardRef, JobPlatform, JsonLdOrg, SiteData, SitePage, Technology } from "../types";
import { isSectionPath, sectionOf } from "./sections";

export interface ParsedPage {
  page: SitePage;
  links: string[];
  lang: string | null;
  hreflangs: string[];
  socialLinks: Record<string, string>;
  ctas: string[];
  jsonLdTypes: string[];
  jsonLdOrg: JsonLdOrg | null;
  prices: string[];
  hasAppLinks: boolean;
  mentionsTestimonials: boolean;
  mentionsFreeOrTrial: boolean;
  textLength: number;
  companyName: string | null;
  jobBoards: JobBoardRef[];
  appStoreIds: string[];
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
// Importe con separador de miles (1.299 / 1,299 / 12 000) o sin él, y decimales opcionales.
// El lookbehind evita cortar "1.299 €" en "299 €".
const PRICE_RE =
  /[$€£]\s?(?:\d{1,3}(?:[.,\s]\d{3})+|\d{1,6})(?:[.,]\d{2})?(?!\d)|(?<![\d.,])(?:\d{1,3}(?:[.,\s]\d{3})+|\d{1,6})(?:[.,]\d{2})?\s?(?:€|EUR|USD|\$)/g;
const TESTIMONIALS_RE =
  /(testimonios|testimonials|reseñas|reviews|opiniones|casos de éxito|case studies|trusted by|confían en|loved by|what our customers say|customer stories|wall of love|lo que dicen|clientes satisfechos)/i;
/**
 * Gratis en contexto de precios ("free plan", "it's free", "gratuito", "$0", "0 €"…).
 * No cuenta "free shipping", "freelance", "envío gratis" ni importes como "$0.99" o "10 €".
 */
const FREE_RE = new RegExp(
  [
    String.raw`\b(?:plan gratuito|prueba gratuita|prueba gratis|empieza gratis|gratis para siempre|free plan|free trial|try (?:it )?(?:for )?free|start for free|free forever|get started for free|free tier|is free|it[’']s free|for free)\b`,
    String.raw`(?<!\b(?:env[ií]os?|entregas?|devoluci[oó]n(?:es)?|shipping)\s)\b(?:gratis|gratuit[oa]s?)\b`,
    String.raw`\$\s?0(?![.,]?\d)`,
    String.raw`€\s?0(?![.,]?\d)`,
    String.raw`(?<![\d.,])0(?:[.,]00)?\s?€`,
  ].join("|"),
  "i",
);
const BLOG_SUBDOMAIN_RE = /^(blog|blogs|noticias|news|articulos|recursos)\./i;

/**
 * Código de idioma saneado ("pt-BR" → "pt"). Descarta lo que no sea un código de 2-3 letras
 * ("x-default", "es; ignora las reglas…"): este valor llega al prompt.
 */
function languageCode(value: string | undefined): string | null {
  const code = (value ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

/** Ruta de una página de precios ("/pricing", "/es/precios"; no "/blog/pricing-tips" ni "/help/pricing"). */
export const isPricingPath = (pathname: string) => isSectionPath(pathname, "precios");

const KEY_PAGE_KINDS: [string, (pathname: string) => boolean][] = [
  ["precios", isPricingPath],
  [
    "blog",
    (path) => {
      // Solo el índice del blog ("/blog", "/es/blog"); en Shopify, "/blogs/<nombre>".
      const s = sectionOf(path);
      return s?.section === "blog" && (s.rest.length === 0 || (path.toLowerCase().includes("/blogs/") && s.rest.length === 1));
    },
  ],
  ["about", (path) => isSectionPath(path, "about")],
  ["producto", (path) => isSectionPath(path, "producto")],
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

interface JsonLdInfo {
  types: string[];
  orgNames: string[];
  sameAs: string[];
  org: JsonLdOrg | null;
}

const ORG_TYPES = new Set(["Organization", "Corporation", "Company", "OnlineStore", "OnlineBusiness", "LocalBusiness", "NGO"]);

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Dirección como texto: admite string o PostalAddress. */
function addressText(v: unknown): string | undefined {
  const text = str(v);
  if (text) return text;
  if (!v || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  const country = a.addressCountry && typeof a.addressCountry === "object" ? (a.addressCountry as Record<string, unknown>).name : a.addressCountry;
  const parts = [a.streetAddress, a.postalCode, a.addressLocality, a.addressRegion, country].map(str).filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : undefined;
}

function walkJsonLd(node: unknown, out: JsonLdInfo): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walkJsonLd(n, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const rawType = obj["@type"];
  const types = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];
  for (const t of types) if (!out.types.includes(t)) out.types.push(t);
  if (types.some((t) => ORG_TYPES.has(t))) {
    if (typeof obj.name === "string" && obj.name.trim()) out.orgNames.push(obj.name.trim());
    const sameAs = Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs];
    for (const s of sameAs) if (typeof s === "string") out.sameAs.push(s);
    if (!out.org) {
      const org: JsonLdOrg = {};
      const name = str(obj.name);
      const legalName = str(obj.legalName);
      const address = addressText(obj.address);
      const foundingDate = str(obj.foundingDate);
      const links = sameAs.filter((s): s is string => typeof s === "string" && s.trim() !== "");
      if (name) org.name = name;
      if (legalName) org.legalName = legalName;
      if (address) org.address = address;
      if (foundingDate) org.foundingDate = foundingDate;
      if (links.length) org.sameAs = links;
      if (Object.keys(org).length) out.org = org;
    }
  }
  if (Array.isArray(obj["@graph"])) walkJsonLd(obj["@graph"], out);
}

const JOB_HOSTS: Record<string, JobPlatform> = {
  "boards.greenhouse.io": "greenhouse",
  "job-boards.greenhouse.io": "greenhouse",
  "jobs.lever.co": "lever",
  "jobs.ashbyhq.com": "ashby",
};
const GREENHOUSE_EMBED_RE = /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/gi;
const TITLE_SEPARATOR_RE = /\s+[—–|\-:·]\s+/;

function titlePrefix(title: string): string | null {
  const first = title.split(TITLE_SEPARATOR_RE)[0]?.trim();
  return first ? first.slice(0, 60) : null;
}

export function parsePage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);

  const jsonLd: JsonLdInfo = { types: [], orgNames: [], sameAs: [], org: null };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walkJsonLd(JSON.parse($(el).text()), jsonLd);
    } catch {
      // JSON-LD mal formado: se ignora
    }
  });
  const ogSiteName = clean($('meta[property="og:site_name"]').attr("content") ?? "");

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
  const jobBoards: JobBoardRef[] = [];
  const appStoreIds: string[] = [];
  const addJobBoard = (platform: JobPlatform, token: string) => {
    if (/^[a-z0-9_.-]+$/i.test(token) && token !== "embed" && !jobBoards.some((j) => j.platform === platform && j.token === token)) {
      jobBoards.push({ platform, token });
    }
  };
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
    const jobPlatform = JOB_HOSTS[abs.hostname.toLowerCase()];
    const firstSegment = abs.pathname.split("/").filter(Boolean)[0];
    if (jobPlatform && firstSegment) addJobBoard(jobPlatform, firstSegment);
    if (host === "apps.apple.com") {
      const id = abs.pathname.match(/\/id(\d+)/)?.[1];
      if (id && !appStoreIds.includes(id)) appStoreIds.push(id);
    }
    abs.hash = "";
    const href = abs.toString();
    if (!links.includes(href)) links.push(href);
  });
  for (const m of html.matchAll(GREENHOUSE_EMBED_RE)) addJobBoard("greenhouse", m[1]);
  for (const s of jsonLd.sameAs) {
    try {
      const u = new URL(s);
      const network = SOCIAL_HOSTS[bareHost(u.hostname)];
      if (network && !socialLinks[network]) socialLinks[network] = u.toString();
    } catch {
      // URL de sameAs inválida: se ignora
    }
  }

  const ctas = Array.from(
    new Set(
      $("a, button")
        .map((_, el) => clean($(el).text()))
        .get()
        .filter((t) => t.length > 0 && t.length <= 40 && CTA_RE.test(t)),
    ),
  );

  const lang = languageCode($("html").attr("lang"));
  const hreflangs = Array.from(
    new Set(
      $('link[rel="alternate"][hreflang]')
        .map((_, el) => languageCode($(el).attr("hreflang")))
        .get()
        .filter((h): h is string => h !== null),
    ),
  );

  return {
    page: { url: pageUrl, title, description, headings, text: text.slice(0, 8000) },
    links,
    lang,
    hreflangs,
    socialLinks,
    ctas,
    jsonLdTypes: jsonLd.types,
    jsonLdOrg: jsonLd.org,
    prices: Array.from(new Set(text.match(PRICE_RE) ?? [])).slice(0, 20),
    hasAppLinks,
    mentionsTestimonials: TESTIMONIALS_RE.test(text),
    mentionsFreeOrTrial: FREE_RE.test(text),
    textLength: text.length,
    companyName: jsonLd.orgNames[0] ?? (ogSiteName || null) ?? titlePrefix(title),
    jobBoards,
    appStoreIds,
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
    const kind = KEY_PAGE_KINDS.find(([, test]) => test(url.pathname))?.[0];
    if (!kind || usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    picked.push(link);
  }
  return picked;
}

export function buildSiteData(finalUrl: string, pages: ParsedPage[], technologies: Technology[]): SiteData {
  const allLinks = pages.flatMap((p) => p.links);
  const homeHost = bareHost(new URL(finalUrl).hostname);
  const isOwnHost = (host: string) => host === homeHost || host.endsWith(`.${homeHost}`);
  const ownUrls = [...pages.map((p) => p.page.url), ...allLinks]
    .map((u) => new URL(u))
    .filter((u) => isOwnHost(bareHost(u.hostname)));
  const sameHostPaths = ownUrls.map((u) => u.pathname);
  // Subdominio propio dedicado al blog (blog.<dominio>/, noticias.<dominio>/…).
  const hasBlogSubdomain = ownUrls.some((u) => BLOG_SUBDOMAIN_RE.test(bareHost(u.hostname)));
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
    hasPricingPage: sameHostPaths.some(isPricingPath),
    pricesFound: Array.from(new Set(pages.flatMap((p) => p.prices))).slice(0, 20),
    hasBlog: hasBlogSubdomain || sameHostPaths.some((path) => isSectionPath(path, "blog")),
    hasTestimonials: pages.some((p) => p.mentionsTestimonials),
    hasFreePlanOrTrial: pages.some((p) => p.mentionsFreeOrTrial),
    hasAppLinks: pages.some((p) => p.hasAppLinks),
    jsonLdTypes: Array.from(new Set(pages.flatMap((p) => p.jsonLdTypes))),
    textLength: pages.reduce((sum, p) => sum + p.textLength, 0),
    technologies,
    companyName: pages[0]?.companyName ?? null,
    jobBoards: pages
      .flatMap((p) => p.jobBoards)
      .filter((j, i, all) => all.findIndex((o) => o.platform === j.platform && o.token === j.token) === i),
    appStoreIds: Array.from(new Set(pages.flatMap((p) => p.appStoreIds))),
    jsonLdOrg: pages.find((p) => p.jsonLdOrg)?.jsonLdOrg ?? null,
  };
}
