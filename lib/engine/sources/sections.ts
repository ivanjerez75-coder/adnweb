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

/**
 * Sección de una ruta: solo cuenta el primer segmento, o el segundo si el primero es un idioma.
 * "/blog/pricing-tips" → blog (no precios); "/help/pricing" → ayuda; "/es/precios" → precios.
 * Devuelve la sección y los segmentos que quedan detrás de ella.
 */
export function sectionOf(pathname: string): { section: SectionName; rest: string[] } | null {
  const segments = pathname.toLowerCase().split("/").filter(Boolean);
  const candidates = LANG_PREFIX_RE.test(segments[0] ?? "") ? [0, 1] : [0];
  for (const i of candidates) {
    const segment = segments[i];
    if (!segment) continue;
    for (const [section, words] of Object.entries(SECTION_WORDS) as [SectionName, readonly string[]][]) {
      if (words.includes(segment)) return { section, rest: segments.slice(i + 1) };
    }
  }
  return null;
}

export const isSectionPath = (pathname: string, section: SectionName): boolean => sectionOf(pathname)?.section === section;
