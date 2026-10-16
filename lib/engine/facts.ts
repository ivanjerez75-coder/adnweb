import type { Presence, RawData, TechCategory } from "./types";

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

export function computeFacts(raw: RawData): Facts {
  const site = raw.site;
  const sitemapHas = (s: "blog" | "precios" | "empleo") => (raw.sitemap ? raw.sitemap.sections.includes(s) : null);
  const routeHas = (k: "blog" | "precios" | "empleo") =>
    raw.rutas && raw.rutas.checked.includes(k) ? raw.rutas.found.includes(k) : null;
  const webTech = (c: TechCategory) => (site ? site.technologies.some((t) => t.category === c) : null);
  const dnsTech = (c: TechCategory) => (raw.dns ? raw.dns.tools.some((t) => t.category === c) : null);

  return {
    blog: presence([site ? site.hasBlog : null, sitemapHas("blog"), routeHas("blog")]),
    paginaPrecios: presence([
      site ? site.hasPricingPage || site.pricesFound.length > 0 : null,
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
      site ? site.hasAppLinks : null,
      raw.appstore ? true : raw.fuentes.appstore === "no_aplica" ? false : null,
    ]),
    emailMarketing: presence([webTech("email"), dnsTech("email")]),
    chatSoporte: presence([webTech("chat"), dnsTech("chat")]),
    redes: Object.keys(site?.socialLinks ?? {}),
  };
}
