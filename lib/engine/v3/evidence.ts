import type { RawData, Signal } from "../types";
import { preciosPublicados } from "./estimates";

export interface Evidence {
  id: string;
  tipo: "pagina" | "senal" | "dato";
  texto: string;
  url?: string;
  fuente: string;
}

/** Registro de todo lo citable: extractos de páginas, señales y datos sueltos. */
export function buildEvidence(raw: RawData, signals: Signal[]): Map<string, Evidence> {
  const reg = new Map<string, Evidence>();

  for (const p of raw.paginas ?? []) {
    for (const e of p.extractos) {
      reg.set(e.id, { id: e.id, tipo: "pagina", texto: e.cita, url: p.url, fuente: p.url });
    }
  }
  for (const s of signals) {
    reg.set(s.id, { id: s.id, tipo: "senal", texto: s.label, fuente: s.source });
  }

  const dato = (clave: string, texto: string, fuente: string, url?: string) => {
    const id = `dato:${clave}`;
    reg.set(id, url ? { id, tipo: "dato", texto, fuente, url } : { id, tipo: "dato", texto, fuente });
  };

  const lg = raw.legal;
  if (lg) {
    const urlLegal = (campo: string): string | undefined => lg.fuentes[campo];
    if (lg.cif) dato("cif", `CIF ${lg.cif}`, "legal", urlLegal("cif"));
    if (lg.razonSocial) dato("razon_social", `Razón social: ${lg.razonSocial}`, "legal", urlLegal("razonSocial"));
    if (lg.avisoLegal) dato("aviso_legal", "Publica un aviso legal", "legal", urlLegal("avisoLegal") ?? lg.avisoLegal);
    if (lg.privacidad) dato("privacidad", "Publica una política de privacidad", "legal", urlLegal("privacidad") ?? lg.privacidad);
    if (lg.cookies) dato("cookies", "Publica una política de cookies", "legal", urlLegal("cookies") ?? lg.cookies);
    const contacto = [lg.email && `correo ${lg.email}`, lg.telefono && `teléfono ${lg.telefono}`, lg.direccion && `dirección ${lg.direccion}`].filter(Boolean);
    if (contacto.length > 0) {
      dato("contacto", `Contacto publicado: ${contacto.join(", ")}`, "legal", urlLegal("email") ?? urlLegal("telefono") ?? urlLegal("direccion"));
    }
  }

  const org = raw.site?.jsonLdOrg;
  if (org) {
    const nombre = org.legalName ?? org.name;
    dato("jsonld_org", `Datos estructurados (JSON-LD) de organización${nombre ? `: ${nombre}` : ""}`, "web", raw.site?.finalUrl);
  }

  const ps = raw.pagespeed;
  if (ps) {
    const partes = [
      ps.mobile != null ? `móvil ${ps.mobile}` : null,
      ps.desktop != null ? `escritorio ${ps.desktop}` : null,
      ps.accesibilidad != null ? `accesibilidad ${ps.accesibilidad}` : null,
      ps.seo != null ? `SEO ${ps.seo}` : null,
      ps.buenasPracticas != null ? `buenas prácticas ${ps.buenasPracticas}` : null,
    ].filter(Boolean);
    if (partes.length > 0) dato("pagespeed", `PageSpeed (sobre 100): ${partes.join(", ")}`, "pagespeed");
    const c = ps.campo;
    if (c) {
      const m = [
        c.lcpMs != null ? `LCP ${Math.round(c.lcpMs)} ms` : null,
        c.inpMs != null ? `INP ${Math.round(c.inpMs)} ms` : null,
        c.cls != null ? `CLS ${c.cls}` : null,
      ].filter(Boolean);
      dato("crux", `Usuarios reales de Chrome (CrUX): ${m.join(", ") || (c.categoria ?? "sin métricas")}`, "crux");
    }
  }

  preciosPublicados(raw).forEach((p, i) => {
    dato(`precio:${i + 1}`, `Precio publicado: ${p.texto}`, "web", p.url);
  });

  const wd = raw.wikidata;
  if (wd?.inception != null) dato("fundacion", `Fundada en ${wd.inception}`, "wikidata");
  if (wd?.employees != null) {
    const anio = wd.employeesYear != null ? ` (${wd.employeesYear})` : "";
    dato("empleados", `${wd.employees} empleados${anio}`, "wikidata");
  }
  if (wd?.revenue) {
    const anio = wd.revenue.year != null ? ` (${wd.revenue.year})` : "";
    dato("ingresos", `Ingresos anuales de ${Math.round(wd.revenue.amount)} ${wd.revenue.currency}${anio} según Wikidata`, "wikidata");
  }
  if (wd?.headquarters) dato("sede", `Sede en ${wd.headquarters}`, "wikidata");

  if (raw.empleo) dato("empleo", `${raw.empleo.openings} ofertas de empleo abiertas`, "empleo");

  if (raw.appstore) {
    const nota = raw.appstore.rating != null ? `, valoración ${raw.appstore.rating}` : "";
    dato("app", `App "${raw.appstore.name}" en App Store${nota} (${raw.appstore.ratingCount} valoraciones)`, "appstore");
  }

  if (raw.dns && raw.dns.emailProvider !== "Ninguno") {
    dato("email", `Correo corporativo con ${raw.dns.emailProvider}`, "dns");
  }

  if (raw.tranco?.rank != null) {
    dato("trafico", `Puesto ${raw.tranco.rank} en el ranking de popularidad web (Tranco)`, "tranco");
  } else if (raw.radar?.rank != null) {
    dato("trafico", `Puesto ${raw.radar.rank} en el ranking de popularidad web (Radar)`, "radar");
  } else if (raw.radar?.bucket != null) {
    dato("trafico", `Entre los ${raw.radar.bucket} dominios más populares (Radar)`, "radar");
  }

  if (raw.sitemap && raw.sitemap.urlCount > 0) {
    const min = raw.sitemap.complete ? "" : "al menos ";
    dato("paginas_sitemap", `${min}${raw.sitemap.urlCount} páginas en el sitemap`, "sitemap");
  }

  const idiomas = Array.from(new Set([...(raw.site?.languages ?? []), ...(raw.sitemap?.languages ?? [])]));
  if (idiomas.length > 0) dato("idiomas", `Web en ${idiomas.length} idioma(s): ${idiomas.join(", ")}`, "web");

  return reg;
}

/**
 * Valida y resuelve ids citados. Descarta los desconocidos; devuelve null si quedan menos de
 * `minimo` (por defecto 1) o si se exige página y no queda ninguna.
 */
export function citar(
  ids: string[],
  reg: Map<string, Evidence>,
  opts: { requierePagina?: boolean; minimo?: number } = {},
): Evidence[] | null {
  const vistos = new Set<string>();
  const validas: Evidence[] = [];
  for (const id of ids) {
    const e = reg.get(id);
    if (e && !vistos.has(id)) {
      vistos.add(id);
      validas.push(e);
    }
  }
  if (validas.length < (opts.minimo ?? 1)) return null;
  if (opts.requierePagina && !validas.some((e) => e.tipo === "pagina")) return null;
  return validas;
}

const ETIQUETAS: [clave: string, etiqueta: string][] = [
  ["fundacion", "Fundación"],
  ["empleados", "Empleados"],
  ["ingresos", "Ingresos anuales"],
  ["sede", "Sede"],
  ["empleo", "Ofertas de empleo"],
  ["app", "App móvil"],
  ["email", "Correo corporativo"],
  ["trafico", "Popularidad web"],
  ["paginas_sitemap", "Páginas en el sitemap"],
  ["idiomas", "Idiomas"],
  ["cif", "CIF"],
  ["razon_social", "Razón social"],
  ["aviso_legal", "Aviso legal"],
  ["privacidad", "Política de privacidad"],
  ["cookies", "Política de cookies"],
  ["contacto", "Contacto"],
  ["jsonld_org", "Datos estructurados"],
  ["pagespeed", "PageSpeed"],
  ["crux", "Usuarios reales (CrUX)"],
];

/** Datos publicados por fuentes externas, cada uno con el id `dato:*` del registro de evidencias. */
export function datosPublicados(raw: RawData): { etiqueta: string; valor: string; fuente: string; evidencia: string }[] {
  const reg = buildEvidence(raw, []);
  const out: { etiqueta: string; valor: string; fuente: string; evidencia: string }[] = [];
  for (const [clave, etiqueta] of ETIQUETAS) {
    const e = reg.get(`dato:${clave}`);
    if (e) out.push({ etiqueta, valor: e.texto, fuente: e.fuente, evidencia: e.id });
  }
  for (const e of reg.values()) {
    if (e.id.startsWith("dato:precio:")) out.push({ etiqueta: "Precio", valor: e.texto, fuente: e.fuente, evidencia: e.id });
  }
  return out;
}
