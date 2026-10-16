import type { Presence, RawData, SiteData, TechCategory } from "./types";

/** null = no se pudo comprobar; true = visto; false = comprobado y no visto. */
export function presence(checks: (boolean | null)[]): Presence {
  if (checks.some((c) => c === true)) return "si";
  if (checks.filter((c) => c === false).length >= 2) return "no";
  return "desconocido";
}

export interface Facts {
  blog: Presence;
  paginaPrecios: Presence;
  empleo: Presence;
  app: Presence;
  emailMarketing: Presence;
  chatSoporte: Presence;
  redes: string[];
}

/** Texto mínimo de la home para afirmar que algo no está (una home fina no prueba nada). */
const READABLE_TEXT = 1500;

export function computeFacts(raw: RawData): Facts {
  const site = raw.site;
  const readable = !!site && site.textLength >= READABLE_TEXT;
  /** Web: true si la ve; false solo si la home es legible y no la ve; null si no se puede afirmar. */
  const webSees = (seen: (s: SiteData) => boolean) => (site ? (seen(site) ? true : readable ? false : null) : null);
  const sitemapHas = (s: "blog" | "precios" | "empleo") => (raw.sitemap ? raw.sitemap.sections.includes(s) : null);
  const routeHas = (k: "blog" | "precios" | "empleo") => {
    if (!raw.rutas) return null;
    if (raw.rutas.found.includes(k)) return true;
    if (raw.rutas.checked.includes(k)) return false;
    return null;
  };
  const webTech = (c: TechCategory) => webSees((s) => s.technologies.some((t) => t.category === c));
  /** El DNS solo puede confirmar presencia (email, chat); su ausencia no prueba nada. */
  const dnsSees = (c: TechCategory) => (raw.dns && raw.dns.tools.some((t) => t.category === c) ? true : null);

  return {
    blog: presence([webSees((s) => s.hasBlog), sitemapHas("blog"), routeHas("blog")]),
    paginaPrecios: presence([
      webSees((s) => s.hasPricingPage || s.pricesFound.length > 0),
      sitemapHas("precios"),
      routeHas("precios"),
    ]),
    // Que la home no enlace a empleo no prueba nada: la web solo cuenta si lo ve.
    empleo: presence([
      site && site.jobBoards.length > 0 ? true : null,
      sitemapHas("empleo"),
      routeHas("empleo"),
      raw.empleo ? true : null,
    ]),
    app: presence([
      webSees((s) => s.hasAppLinks),
      raw.appstore ? true : raw.fuentes.appstore === "no_aplica" ? false : null,
    ]),
    emailMarketing: presence([webTech("email"), dnsSees("email")]),
    chatSoporte: presence([webTech("chat"), dnsSees("chat")]),
    redes: Object.keys(site?.socialLinks ?? {}),
  };
}
