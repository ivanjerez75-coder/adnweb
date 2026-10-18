import * as cheerio from "cheerio";
import { registrableDomain } from "../redirect";
import type { LegalData, PageDoc, SiteData } from "../types";

const NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";
/** Entidades cuyo control es siempre una letra / siempre un dígito; el resto admite ambos. */
const CIF_LETTER_ONLY = new Set(["K", "P", "Q", "R", "S", "W", "N"]);
const CIF_DIGIT_ONLY = new Set(["A", "B", "E", "H"]);

/** Valida un CIF (letra + 7 dígitos + control), un NIF (8 dígitos + letra) o un NIE (XYZ + 7 dígitos + letra). */
export function validarCifNif(input: string): boolean {
  const s = (input ?? "").toUpperCase().replace(/[\s.\-]/g, "");

  if (/^\d{8}[A-Z]$/.test(s)) return NIF_LETTERS[Number(s.slice(0, 8)) % 23] === s[8];

  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) {
    const n = Number(`${"XYZ".indexOf(s[0])}${s.slice(1, 8)}`);
    return NIF_LETTERS[n % 23] === s[8];
  }

  // NIF especiales (K, L, M): 7 dígitos + letra calculada como un NIF.
  if (/^[KLM]\d{7}[A-Z]$/.test(s)) return NIF_LETTERS[Number(s.slice(1, 8)) % 23] === s[8];

  const m = s.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!m) return false;
  const [, kind, digits, control] = m;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else {
      sum += d;
    }
  }
  const c = (10 - (sum % 10)) % 10;
  const isLetter = /[A-J]/.test(control);
  if (CIF_LETTER_ONLY.has(kind)) return isLetter && control === CIF_CONTROL_LETTERS[c];
  if (CIF_DIGIT_ONLY.has(kind)) return !isLetter && control === String(c);
  return control === String(c) || control === CIF_CONTROL_LETTERS[c];
}

const BLOCK_TAGS = "a, p, li, div, br, h1, h2, h3, h4, h5, h6, td, th, tr, section, footer, header, address, button, label, small";

const LINK_RULES: { field: "avisoLegal" | "privacidad" | "cookies" | "condiciones"; text: RegExp; path: RegExp }[] = [
  {
    field: "avisoLegal",
    text: /aviso\s*legal|legal\s*notice|informaci[oó]n\s*legal|nota\s*legal|impressum/i,
    path: /aviso[-_]?legal|legal[-_]?notice|\/legal(?:\/|$|\.)|impressum|imprint/i,
  },
  {
    field: "privacidad",
    text: /privacidad|privacy|protecci[oó]n\s*de\s*datos|privacitat|rgpd|gdpr/i,
    path: /privacidad|privacy|proteccion[-_]?de[-_]?datos|privacitat|rgpd|gdpr/i,
  },
  { field: "cookies", text: /cookies?|galletas/i, path: /cookie/i },
  {
    field: "condiciones",
    text: /condiciones|t[eé]rminos|\bterms\b|\btos\b|condicions/i,
    path: /condiciones|terminos|terms|\btos\b|condicions/i,
  },
];

const SUFFIX = String.raw`(?:S\.?\s?L\.?\s?[UL]?\.?|S\.?\s?A\.?\s?U?\.?|S\.?\s?Coop\.?)`;
const WORD = String.raw`[A-ZÁÉÍÓÚÑ][\p{L}0-9&'’\-]*`;
const STOP = String.raw`(?!(?:CIF|NIF|NIE|VAT|Tel|Email|E-mail)\b)`;
const COMPANY_RE = new RegExp(String.raw`((?:${STOP}${WORD}[ \t]+){0,5}${STOP}${WORD},?[ \t]+${SUFFIX})(?![\p{L}])`, "u");
const ENTITY_RE = new RegExp(
  String.raw`((?:Fundaci[oó]n|Fundaci[oó]|Asociaci[oó]n|Associaci[oó])(?:[ \t]+(?:de[ \t]+la|de|del|la|el|per|para|pro))?(?:[ \t]+${STOP}${WORD}){1,4})`,
  "u",
);
const CIF_LABEL_RE =
  /(?<![A-Za-z])(?:C\.?I\.?F\.?|N\.?I\.?F\.?|N\.?I\.?E\.?|VAT)[ \t:.\-/]*(?:ES[ \t-]?)?([A-Za-z]?[ .-]?\d(?:[ .-]?\d){6,7}[ .-]?[A-Za-z0-9])/gi;
// "domicilio" basta; "sede social" y "dirección" solo cuentan si lo que sigue parece una dirección
// (calle/avenida/plaza… o código postal de 5 dígitos): evita "dirección de correo electrónico".
const ADDRESS_RE =
  /(domicilio(?:\s+social)?|sede\s+social|direcci[oó]n)[ \t]*:?[ \t]*(?:es[ \t]+)?(?:en[ \t]+)?([^\n]{8,140}?)(?=[ \t][-–·|][ \t]|\.[ \t\n]|\.?\s*$|[ \t](?:CIF|NIF|Tel|Email|E-mail|Correo)\b)/gim;
const STREET_RE = /^(?:calle|c\/|avda|avenida|plaza|pl\.|carrer|passeig)(?![\p{L}])|(?<!\d)\d{5}(?!\d)/iu;
function findAddress(text: string): string | null {
  for (const m of text.matchAll(ADDRESS_RE)) {
    const trigger = m[1].toLowerCase();
    if (trigger.startsWith("domicilio") || STREET_RE.test(m[2].trim())) return m[2].trim();
  }
  return null;
}
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif)$/i;
const PHONE_RE = /\b(?:tel[ée]fono|tel\.?|tlf\.?|phone)[ \t:.]*(\+?\d[\d .\-]{7,14}\d)/i;

interface Doc {
  url: string;
  $: cheerio.CheerioAPI | null;
  text: string;
}

function docText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, template, svg").remove();
  $(BLOCK_TAGS).after("\n");
  return $("body").text().replace(/[ \t\r\f\v]+/g, " ").replace(/ ?\n[ \n]*/g, "\n").trim();
}

const LEGAL_URL_RE = /aviso[-_]?legal|legal|privacidad|privacy|terms|condiciones|cookies/i;
const pathOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/** Identidad legal declarada en la web: enlaces legales, CIF válido, razón social, contacto. Pura. */
export function extractLegal(home: SiteData | null, paginas: PageDoc[] | null, htmlByUrl: Map<string, string>): LegalData {
  const out: LegalData = {
    avisoLegal: null, privacidad: null, cookies: null, condiciones: null, cif: null,
    razonSocial: null, email: null, telefono: null, direccion: null, fuentes: {},
  };
  const set = (field: Exclude<keyof LegalData, "fuentes">, value: string, source: string) => {
    if (out[field] !== null) return;
    out[field] = value;
    out.fuentes[field] = source;
  };

  // Documentos: la home primero, luego las páginas legales y el resto; texto plano solo si no hay HTML.
  // Solo cuenta lo publicado en el dominio registrable propio: un aviso legal de un tercero
  // (gestoría, plantilla, plataforma) no identifica a este negocio. Sus enlaces tampoco se registran.
  const ownRoot = (() => {
    try {
      return home ? registrableDomain(new URL(home.finalUrl).hostname) : null;
    } catch {
      return null;
    }
  })();
  const isOwn = (url: string) => {
    if (!ownRoot) return true;
    try {
      return registrableDomain(new URL(url).hostname) === ownRoot;
    } catch {
      return false;
    }
  };
  const docs: Doc[] = [];
  const seen = new Set<string>();
  for (const [url, html] of htmlByUrl) {
    if (!isOwn(url)) continue;
    seen.add(url);
    const $ = cheerio.load(html);
    docs.push({ url, $, text: docText($) });
  }
  const plain = (url: string, text: string) => {
    if (seen.has(url) || !text.trim()) return;
    seen.add(url);
    docs.push({ url, $: null, text });
  };
  for (const p of home?.pages ?? []) plain(p.url, p.text);
  for (const p of paginas ?? []) plain(p.url, p.extractos.map((e) => e.cita).join("\n"));
  const homeUrl = home?.finalUrl;
  const rank = (d: Doc) => (d.url === homeUrl ? 0 : LEGAL_URL_RE.test(pathOf(d.url)) ? 1 : 2);
  const ordered = [...docs].sort((a, b) => rank(a) - rank(b));

  // Enlaces legales, mailto y tel.
  for (const d of ordered) {
    if (!d.$) continue;
    d.$("a[href]").each((_, el) => {
      const a = d.$!(el);
      const href = (a.attr("href") ?? "").trim();
      if (/^mailto:/i.test(href)) {
        const mail = decodeURIComponent(href.slice(7).split("?")[0]).trim().toLowerCase();
        if (mail.includes("@")) set("email", mail, d.url);
        return;
      }
      if (/^tel:/i.test(href)) {
        const tel = decodeURIComponent(href.slice(4)).replace(/[^\d+]/g, "");
        if (tel.replace(/\D/g, "").length >= 7) set("telefono", tel, d.url);
        return;
      }
      let abs: URL;
      try {
        abs = new URL(href, d.url);
      } catch {
        return;
      }
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      if (!isOwn(abs.toString())) return;
      abs.hash = "";
      const label = `${a.text()} ${a.attr("title") ?? ""} ${a.attr("aria-label") ?? ""}`.replace(/\s+/g, " ").trim();
      for (const rule of LINK_RULES) {
        if (rule.text.test(label) || rule.path.test(abs.pathname)) set(rule.field, abs.toString(), d.url);
      }
    });
  }

  // CIF/NIF válido junto a su etiqueta.
  for (const d of ordered) {
    if (out.cif) break;
    for (const m of d.text.matchAll(CIF_LABEL_RE)) {
      const candidate = m[1].toUpperCase().replace(/[\s.\-]/g, "");
      if (validarCifNif(candidate)) {
        set("cif", candidate, d.url);
        break;
      }
    }
  }

  // Razón social, dirección y contactos en texto.
  for (const d of ordered) {
    if (!out.razonSocial) {
      const m = d.text.match(COMPANY_RE) ?? d.text.match(ENTITY_RE);
      if (m) set("razonSocial", m[1].replace(/[ \t]+/g, " ").trim(), d.url);
    }
    if (!out.direccion) {
      const addr = findAddress(d.text);
      if (addr) set("direccion", addr, d.url);
    }
    if (!out.email) {
      const m = [...d.text.matchAll(EMAIL_RE)].find((x) => !IMAGE_EXT.test(x[0]));
      if (m) set("email", m[0].toLowerCase(), d.url);
    }
    if (!out.telefono) {
      const m = d.text.match(PHONE_RE);
      if (m) set("telefono", m[1].replace(/[^\d+]/g, ""), d.url);
    }
  }

  // Respaldo: JSON-LD de la organización.
  const org = home?.jsonLdOrg;
  if (org && homeUrl) {
    if (org.legalName) set("razonSocial", org.legalName, homeUrl);
    if (org.address) set("direccion", org.address, homeUrl);
  }
  return out;
}
