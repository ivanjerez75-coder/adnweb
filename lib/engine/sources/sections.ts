/** Segmento de idioma que puede preceder a la sección: "es", "en-us". */
const LANG_PREFIX_RE = /^[a-z]{2}(-[a-z]{2})?$/;

export const SECTION_WORDS = {
  blog: ["blog", "blogs", "noticias", "news", "articulos", "recursos"],
  ayuda: ["help", "ayuda", "support", "soporte", "faq"],
  precios: ["pricing", "precios", "tarifas", "planes", "plans"],
  empleo: ["careers", "jobs", "empleo", "trabaja-con-nosotros", "join-us"],
  docs: ["docs", "documentation", "documentacion", "developers"],
  about: ["about", "about-us", "nosotros", "sobre-nosotros", "quienes-somos", "empresa", "company"],
  producto: ["product", "producto", "productos", "features", "funcionalidades"],
} as const;

export type SectionName = keyof typeof SECTION_WORDS;

/** Páginas de empresa bajo las que suele colgar el empleo: "/company/careers", "/es/empresa/empleo". */
const COMPANY_PARENTS: readonly string[] = ["about", "company", "empresa", "nosotros"];
const NESTED_JOB_WORDS: readonly string[] = ["careers", "jobs", "empleo"];

/**
 * Sección de una ruta: solo cuenta el primer segmento, o el segundo si el primero es un idioma.
 * "/blog/pricing-tips" → blog (no precios); "/help/pricing" → ayuda; "/es/precios" → precios.
 * Excepción: careers/jobs/empleo bajo una página de empresa es empleo ("/company/careers").
 * Devuelve la sección y los segmentos que quedan detrás de ella.
 */
export function sectionOf(pathname: string): { section: SectionName; rest: string[] } | null {
  const segments = pathname.toLowerCase().split("/").filter(Boolean);
  const candidates = LANG_PREFIX_RE.test(segments[0] ?? "") ? [0, 1] : [0];
  for (const i of candidates) {
    const segment = segments[i];
    if (!segment) continue;
    if (COMPANY_PARENTS.includes(segment) && NESTED_JOB_WORDS.includes(segments[i + 1] ?? "")) {
      return { section: "empleo", rest: segments.slice(i + 2) };
    }
    for (const [section, words] of Object.entries(SECTION_WORDS) as [SectionName, readonly string[]][]) {
      if (words.includes(segment)) return { section, rest: segments.slice(i + 1) };
    }
  }
  return null;
}

/** Secciones de negocio que merece la pena leer en profundidad (primer segmento, o el segundo tras un idioma). */
const PRIORITY_WORDS: readonly string[] = [
  // es / en
  "servicios", "services", "productos", "products", "soluciones", "solutions", "empresas", "about",
  "about-us", "nosotros", "sobre-nosotros", "quienes-somos", "precios", "pricing", "planes", "casos",
  "clientes", "customers", "contacto", "contact", "empleo", "careers",
  // ca
  "serveis", "productes", "solucions", "empreses", "qui-som", "nosaltres", "sobre-nosaltres", "preus",
  "contacte", "ocupacio", "treballa-amb-nosaltres",
  // fr / pt / it / de
  "produits", "entreprises", "a-propos", "qui-sommes-nous", "tarifs", "servicos", "produtos", "solucoes",
  "sobre", "precos", "contato", "servizi", "prodotti", "soluzioni", "chi-siamo", "prezzi", "contatti",
  "leistungen", "produkte", "losungen", "ueber-uns", "uber-uns", "preise", "kontakt",
];
/** Palabras que, dentro de un slug corto ("serveis-per-a-empreses"), marcan una página de negocio. */
const PRIORITY_TOKENS: readonly string[] = [
  "servicios", "services", "serveis", "servizi", "servicos", "productos", "products", "productes", "produits",
  "soluciones", "solutions", "solucions", "empresas", "empreses", "entreprises", "precios", "preus", "pricing",
];
const MAX_TOKENS_SLUG = 4;

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function isPriorityPath(pathname: string): boolean {
  let ruta = pathname;
  try {
    ruta = decodeURIComponent(pathname);
  } catch {
    // ruta mal codificada: se usa tal cual
  }
  const segments = sinAcentos(ruta.toLowerCase()).split("/").filter(Boolean);
  const candidates = LANG_PREFIX_RE.test(segments[0] ?? "") ? [0, 1] : [0];
  return candidates.some((i) => {
    const segment = segments[i] ?? "";
    if (PRIORITY_WORDS.includes(segment)) return true;
    const tokens = segment.split("-");
    return tokens.length <= MAX_TOKENS_SLUG && tokens.some((t) => PRIORITY_TOKENS.includes(t));
  });
}

export const isSectionPath = (pathname: string, section: SectionName): boolean => sectionOf(pathname)?.section === section;
