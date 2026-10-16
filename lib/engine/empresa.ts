import { allLanguages } from "./signals";
import type { EmailProvider, JobPlatform, RawData, SourceId, Technology } from "./types";

export type Dato<T> = { valor: T; fuente: SourceId } | null;

export interface EmpresaFicha {
  nombre: Dato<string>;
  fundacion: Dato<number>;
  fundadores: Dato<string[]>;
  sede: Dato<string>;
  empleados: Dato<number>;
  /** Año al que se refiere el dato de empleados. */
  empleadosAnio: Dato<number>;
  ingresosPublicos: Dato<{ importe: number; moneda: string; anio: number | null }>;
  /** confianza: "alta" si la web enlaza el tablero; "media" si se dedujo del nombre del dominio. */
  empleo: Dato<{ ofertas: number; porArea: Record<string, number>; plataforma: JobPlatform; confianza: "alta" | "media" }>;
  app: Dato<{ nombre: string; valoracion: number | null; valoraciones: number; url: string }>;
  emailCorporativo: Dato<EmailProvider>;
  herramientas: Dato<Technology[]>;
  /** completo: false si el sitemap no se leyó entero (paginas es un mínimo: «≥ N»). */
  web: Dato<{ paginas: number; ultimaActualizacion: string | null; idiomas: string[]; completo: boolean }>;
  menciones: Dato<{ total: number; ultimoAnio: number; destacada: { titulo: string; puntos: number } | null }>;
}

const dato = <T>(valor: T | null | undefined, fuente: SourceId): Dato<T> =>
  valor === null || valor === undefined ? null : { valor, fuente };

export function buildEmpresa(raw: RawData): EmpresaFicha {
  const w = raw.wikidata;
  return {
    // Si la página final es de otro (Instagram, Linktree…), su nombre no es el de este negocio.
    nombre: dato(raw.companyNameFromPage ? raw.site?.companyName : null, "web"),
    fundacion: dato(w?.inception, "wikidata"),
    fundadores: dato(w && w.founders.length > 0 ? w.founders : null, "wikidata"),
    sede: dato(w?.headquarters, "wikidata"),
    empleados: dato(w?.employees, "wikidata"),
    empleadosAnio: dato(w?.employees != null ? w.employeesYear : null, "wikidata"),
    ingresosPublicos: dato(w?.revenue ? { importe: w.revenue.amount, moneda: w.revenue.currency, anio: w.revenue.year } : null, "wikidata"),
    empleo: dato(
      raw.empleo
        ? {
            ofertas: raw.empleo.openings,
            porArea: raw.empleo.byArea,
            plataforma: raw.empleo.platform,
            confianza: raw.empleo.linkedFromSite ? ("alta" as const) : ("media" as const),
          }
        : null,
      "empleo",
    ),
    app: dato(
      raw.appstore ? { nombre: raw.appstore.name, valoracion: raw.appstore.rating, valoraciones: raw.appstore.ratingCount, url: raw.appstore.url } : null,
      "appstore",
    ),
    emailCorporativo: dato(raw.dns?.emailProvider, "dns"),
    herramientas: dato(raw.dns && raw.dns.tools.length > 0 ? raw.dns.tools : null, "dns"),
    web: dato(
      raw.sitemap
        ? {
            paginas: raw.sitemap.urlCount,
            ultimaActualizacion: raw.sitemap.lastModified,
            idiomas: allLanguages(raw),
            completo: raw.sitemap.complete,
          }
        : null,
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
