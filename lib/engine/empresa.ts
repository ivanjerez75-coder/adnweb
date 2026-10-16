import { allLanguages } from "./signals";
import type { EmailProvider, JobPlatform, RawData, SourceId, Technology } from "./types";

export type Dato<T> = { valor: T; fuente: SourceId } | null;

export interface EmpresaFicha {
  nombre: Dato<string>;
  fundacion: Dato<number>;
  fundadores: Dato<string[]>;
  sede: Dato<string>;
  empleados: Dato<number>;
  ingresosPublicos: Dato<{ importe: number; moneda: string; anio: number | null }>;
  empleo: Dato<{ ofertas: number; porArea: Record<string, number>; plataforma: JobPlatform }>;
  app: Dato<{ nombre: string; valoracion: number | null; valoraciones: number; url: string }>;
  emailCorporativo: Dato<EmailProvider>;
  herramientas: Dato<Technology[]>;
  web: Dato<{ paginas: number; ultimaActualizacion: string | null; idiomas: string[] }>;
  menciones: Dato<{ total: number; ultimoAnio: number; destacada: { titulo: string; puntos: number } | null }>;
}

const dato = <T>(valor: T | null | undefined, fuente: SourceId): Dato<T> =>
  valor === null || valor === undefined ? null : { valor, fuente };

export function buildEmpresa(raw: RawData): EmpresaFicha {
  const w = raw.wikidata;
  return {
    nombre: dato(raw.site?.companyName, "web"),
    fundacion: dato(w?.inception, "wikidata"),
    fundadores: dato(w && w.founders.length > 0 ? w.founders : null, "wikidata"),
    sede: dato(w?.headquarters, "wikidata"),
    empleados: dato(w?.employees, "wikidata"),
    ingresosPublicos: dato(w?.revenue ? { importe: w.revenue.amount, moneda: w.revenue.currency, anio: w.revenue.year } : null, "wikidata"),
    empleo: dato(raw.empleo ? { ofertas: raw.empleo.openings, porArea: raw.empleo.byArea, plataforma: raw.empleo.platform } : null, "empleo"),
    app: dato(
      raw.appstore ? { nombre: raw.appstore.name, valoracion: raw.appstore.rating, valoraciones: raw.appstore.ratingCount, url: raw.appstore.url } : null,
      "appstore",
    ),
    emailCorporativo: dato(raw.dns?.emailProvider, "dns"),
    herramientas: dato(raw.dns && raw.dns.tools.length > 0 ? raw.dns.tools : null, "dns"),
    web: dato(
      raw.sitemap ? { paginas: raw.sitemap.urlCount, ultimaActualizacion: raw.sitemap.lastModified, idiomas: allLanguages(raw) } : null,
      "sitemap",
    ),
    menciones: dato(
      raw.hackernews
        ? {
            total: raw.hackernews.total,
            ultimoAnio: raw.hackernews.lastYear,
            destacada: raw.hackernews.top ? { titulo: raw.hackernews.top.title, puntos: raw.hackernews.top.points } : null,
          }
        : null,
      "hackernews",
    ),
  };
}
