import type { RawData, Signal } from "../types";

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

  const dato = (clave: string, texto: string, fuente: string) => {
    const id = `dato:${clave}`;
    reg.set(id, { id, tipo: "dato", texto, fuente });
  };

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
