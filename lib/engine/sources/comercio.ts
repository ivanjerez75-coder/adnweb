import * as cheerio from "cheerio";
import { registrableDomain } from "../redirect";
import type { ComercioData, LocalData, PageDoc, SiteData, SitemapData } from "../types";

/** Medios de pago reconocibles en el texto (o en las tecnologías detectadas). */
const PAGOS: { nombre: string; re: RegExp }[] = [
  { nombre: "Visa", re: /\bvisa\b/i },
  { nombre: "Mastercard", re: /\bmaster\s?card\b/i },
  { nombre: "PayPal", re: /\bpay\s?pal\b/i },
  { nombre: "Bizum", re: /\bbizum\b/i },
  { nombre: "Apple Pay", re: /\bapple\s?pay\b/i },
  { nombre: "Google Pay", re: /\bgoogle\s?pay\b|\bgpay\b/i },
  { nombre: "Stripe", re: /\bstripe\b/i },
  { nombre: "Klarna", re: /\bklarna\b/i },
  { nombre: "Transferencia bancaria", re: /\btransferencia\s+bancaria\b|\btransfer[eè]ncia\s+banc[aà]ria\b/i },
  { nombre: "Contra reembolso", re: /\bcontra\s*-?\s*reembolso\b|\bcontrareembors\b/i },
];

const LINK_RULES: { campo: "envios" | "devoluciones"; texto: RegExp; ruta: RegExp }[] = [
  {
    campo: "envios",
    texto: /\benv[ií]os?\b|\bshipping\b|\benviaments?\b|gastos\s+de\s+env[ií]o/i,
    ruta: /env[ií]os?|shipping|enviaments?/i,
  },
  {
    campo: "devoluciones",
    texto: /\bdevoluci[oó]n(?:es)?\b|\breturns?\b|\bdevolucions?\b|\bdevoluci[oó]\b/i,
    ruta: /devoluci[oó]n(?:es)?|devolucion(?:es)?|returns?(?:[-_/.]|$)|devolucions?/i,
  },
];

const MAX_HORARIO = 120;
const HORARIO_TEXTO_RE = /\bhorari[os]?(?:\s+de\s+(?:apertura|atenci[oó]n|tienda|oficina))?\s*:\s*([^\n]{4,200})/i;
const DIAS: Record<string, string> = {
  monday: "Lun", tuesday: "Mar", wednesday: "Mié", thursday: "Jue", friday: "Vie", saturday: "Sáb", sunday: "Dom",
  mo: "Lun", tu: "Mar", we: "Mié", th: "Jue", fr: "Vie", sa: "Sáb", su: "Dom",
};

const BLOCK_TAGS = "a, p, li, div, br, h1, h2, h3, h4, h5, h6, td, th, tr, section, footer, header, address";

interface Doc {
  url: string;
  $: cheerio.CheerioAPI | null;
  text: string;
}

const recortar = (s: string, max = MAX_HORARIO) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

function ownChecker(home: SiteData | null): (url: string) => boolean {
  let root: string | null = null;
  try {
    root = home ? registrableDomain(new URL(home.finalUrl).hostname) : null;
  } catch {
    root = null;
  }
  return (url: string) => {
    if (!root) return true;
    try {
      return registrableDomain(new URL(url).hostname) === root;
    } catch {
      return false;
    }
  };
}

/** Documentos propios: HTML (con enlaces) y, si no hay HTML, el texto plano de la home y las páginas. */
function documentos(home: SiteData | null, paginas: PageDoc[] | null, htmlByUrl: Map<string, string>): Doc[] {
  const isOwn = ownChecker(home);
  const docs: Doc[] = [];
  const seen = new Set<string>();
  for (const [url, html] of htmlByUrl) {
    if (!isOwn(url)) continue;
    seen.add(url);
    const $ = cheerio.load(html);
    const alts = $("img[alt]")
      .map((_, el) => $(el).attr("alt") ?? "")
      .get()
      .join(" ");
    $("script, style, noscript, template, svg").remove();
    $(BLOCK_TAGS).after("\n");
    const text = `${$("body").text().replace(/[ \t\r\f\v]+/g, " ").replace(/ ?\n[ \n]*/g, "\n")}\n${alts}`;
    docs.push({ url, $, text });
  }
  const plain = (url: string, text: string) => {
    if (seen.has(url) || !text.trim()) return;
    seen.add(url);
    docs.push({ url, $: null, text });
  };
  for (const p of home?.pages ?? []) plain(p.url, p.text);
  for (const p of paginas ?? []) plain(p.url, p.extractos.map((e) => e.cita).join("\n"));
  return docs;
}

const rutaDe = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return "";
  }
};

/**
 * Señales de tienda (envíos, devoluciones, medios de pago, catálogo aproximado) a partir de lo ya
 * leído: HTML de la home y de las páginas, su texto, las tecnologías y el sitemap. Pura.
 */
export function extractComercio(
  home: SiteData | null,
  paginas: PageDoc[] | null,
  htmlByUrl: Map<string, string>,
  sitemap: SitemapData | null,
): ComercioData {
  const isOwn = ownChecker(home);
  const docs = documentos(home, paginas, htmlByUrl);
  const out: ComercioData = { envios: null, devoluciones: null, pagos: [], catalogoAprox: null };

  // Enlaces propios cuyo texto o ruta habla de envíos o devoluciones.
  for (const d of docs) {
    if (!d.$) continue;
    d.$("a[href]").each((_, el) => {
      const a = d.$!(el);
      let abs: URL;
      try {
        abs = new URL((a.attr("href") ?? "").trim(), d.url);
      } catch {
        return;
      }
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      if (!isOwn(abs.toString())) return;
      abs.hash = "";
      const label = `${a.text()} ${a.attr("title") ?? ""} ${a.attr("aria-label") ?? ""}`.replace(/\s+/g, " ").trim();
      const ruta = rutaDe(abs.toString());
      for (const r of LINK_RULES) {
        if (out[r.campo] === null && (r.texto.test(label) || r.ruta.test(ruta))) out[r.campo] = abs.toString();
      }
    });
  }
  // Respaldo: páginas leídas o candidatas del sitemap con la ruta adecuada.
  const urls = [...(paginas ?? []).map((p) => p.url), ...(sitemap?.candidatas ?? [])].filter(isOwn);
  for (const r of LINK_RULES) {
    if (out[r.campo] === null) out[r.campo] = urls.find((u) => r.ruta.test(rutaDe(u))) ?? null;
  }

  // Medios de pago: texto (incluidos los alt de los logos) y tecnologías detectadas.
  const texto = [...docs.map((d) => d.text), ...(home?.technologies ?? []).map((t) => t.name)].join("\n");
  out.pagos = PAGOS.filter((p) => p.re.test(texto)).map((p) => p.nombre);

  if (sitemap) out.catalogoAprox = sitemap.productos ?? null;
  return out;
}

// ---------- Horario ----------

const dia = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const k = v.replace(/^https?:\/\/schema\.org\//i, "").trim().toLowerCase();
  return DIAS[k] ?? null;
};
const hora = (v: unknown): string | null => (typeof v === "string" && /^\d{1,2}:\d{2}/.test(v.trim()) ? v.trim().slice(0, 5) : null);

/** "Mo-Fr 09:00-18:00" → "Lun-Vie 09:00-18:00". */
const traducirDias = (s: string) => s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (m) => DIAS[m.toLowerCase()] ?? m);

function horarioDeNodo(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) horarioDeNodo(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const oh = o.openingHours;
  if (typeof oh === "string" && oh.trim()) out.push(traducirDias(oh.trim()));
  else if (Array.isArray(oh)) {
    const xs = oh.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => traducirDias(x.trim()));
    if (xs.length > 0) out.push(xs.join("; "));
  }
  const spec = o.openingHoursSpecification;
  if (spec) {
    const partes: string[] = [];
    for (const s of Array.isArray(spec) ? spec : [spec]) {
      if (!s || typeof s !== "object") continue;
      const r = s as Record<string, unknown>;
      const dias = (Array.isArray(r.dayOfWeek) ? r.dayOfWeek : [r.dayOfWeek]).map(dia).filter((x): x is string => x !== null);
      const abre = hora(r.opens);
      const cierra = hora(r.closes);
      if (dias.length > 0 && abre && cierra) partes.push(`${dias.join(", ")} ${abre}-${cierra}`);
    }
    if (partes.length > 0) out.push(partes.join("; "));
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === "openingHours" || k === "openingHoursSpecification") continue;
    if (v && typeof v === "object") horarioDeNodo(v, out);
  }
}

/** Horario declarado en el JSON-LD de un HTML, o null. */
export function horarioJsonLd(html: string): string | null {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      horarioDeNodo(JSON.parse($(el).text()), out);
    } catch {
      // JSON-LD inválido: se ignora
    }
  });
  return out[0] ? recortar(out[0]) : null;
}

/** Línea "Horario: …" con alguna hora o día, o null. */
export function horarioTexto(text: string): string | null {
  for (const line of text.split("\n")) {
    const m = HORARIO_TEXTO_RE.exec(line);
    if (!m) continue;
    const valor = m[1].trim();
    if (/\d/.test(valor) || /lunes|martes|viernes|s[aá]bado|domingo|dilluns|divendres/i.test(valor)) return recortar(valor);
  }
  return null;
}

/** Horario de apertura: JSON-LD primero; si no, una línea "Horario:" de la home o de la página de contacto. Pura. */
export function extractLocal(home: SiteData | null, paginas: PageDoc[] | null, htmlByUrl: Map<string, string>): LocalData {
  const isOwn = ownChecker(home);
  for (const [url, html] of htmlByUrl) {
    if (!isOwn(url)) continue;
    const h = horarioJsonLd(html);
    if (h) return { horario: h };
  }
  const homeUrl = home?.finalUrl;
  const docs = documentos(home, paginas, htmlByUrl).filter(
    (d) => d.url === homeUrl || (home?.pages ?? []).some((p) => p.url === d.url) || /contact|contacto|contacte|ubicaci|donde|horari/i.test(rutaDe(d.url)),
  );
  for (const d of docs) {
    const h = horarioTexto(d.text);
    if (h) return { horario: h };
  }
  return { horario: null };
}
