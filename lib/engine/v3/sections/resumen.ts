import type { RawData } from "../../types";
import type { Tipologia } from "../clases";
import { seleccionarDatosClave, type DatoClave } from "../datos-clave";
import type { Competencia } from "./competencia";
import type { ComponenteCobertura, EstadoComponente } from "../cobertura";
import type { Metrica, PrecioPublicado } from "../estimates";
import type { Evidence } from "../evidence";
import type { Anatomia, AdnBloque, ModeloEstado, TipologiaAnatomia } from "./anatomia";
import { ordenarPorPrioridad, superaFiltros, type Debilidad, type Diagnostico, type EstadoHallazgo, type Fortaleza, type FormatoHallazgo } from "./diagnostico";
import type { Oportunidad, Prioridad } from "./oportunidades";

/** Resumen ejecutivo (sección 01): lo arma el código, sin llamadas de IA ni puntuación global. */
export type TipoHallazgo = "debilidad" | "fortaleza" | "riesgo" | "friccion";
export interface Hallazgo {
  tipo: TipoHallazgo;
  /** Id del diagnóstico (d*, f*, r*, x*). */
  id: string;
  titulo: string;
  texto: string;
  estado: EstadoHallazgo;
  prioridad: Prioridad;
  evidencias: Evidence[];
}

export type CoberturaInforme = Record<ComponenteCobertura, EstadoComponente>;

export interface Resumen {
  nombre: string;
  dominio: string;
  fecha: string;
  categoria: Tipologia[];
  frase: AdnBloque;
  modelo: { tipologias: TipologiaAnatomia[]; estado: ModeloEstado };
  /** Solo métricas disponibles, como mucho 4, en el orden de PRIORIDAD_INDICADORES. */
  indicadores: Metrica[];
  /** Datos clave según la tipología (bloque 2), solo con fuente verificable. */
  datosClave: DatoClave[];
  /** Hasta 3: los que superan los tres filtros (§11.3), con evidencia, de mayor prioridad primero. */
  hallazgos: Hallazgo[];
  /** Una fortaleza y una debilidad más, sin repetir las de los hallazgos cuando hay otra. */
  destacado: { fortaleza?: Fortaleza; debilidad?: Debilidad };
  /** La oportunidad de mayor prioridad (a igualdad, la primera). */
  oportunidad: Oportunidad | null;
  cobertura: CoberturaInforme;
}

export const MAX_INDICADORES = 4;
/** Orden de preferencia de los indicadores clave (datos reales, nunca el escenario hipotético). */
export const PRIORIDAD_INDICADORES = [
  "ingresos_publicados",
  "popularidad_tranco",
  "popularidad_radar",
  "usuarios_reales_crux",
  "pagespeed_movil",
  "pagespeed_escritorio",
  "paginas_sitemap",
  "idiomas",
  "seo_tecnico",
  "accesibilidad",
] as const;

const PRIORIDADES: readonly Prioridad[] = ["alta", "media", "baja"];

function elegirIndicadores(metricas: Metrica[]): Metrica[] {
  const out: Metrica[] = [];
  for (const clave of PRIORIDAD_INDICADORES) {
    const m = metricas.find((x) => x.clave === clave && x.estado === "disponible");
    if (m) out.push(m);
    if (out.length === MAX_INDICADORES) break;
  }
  return out;
}

export const MAX_HALLAZGOS = 3;

/**
 * Hallazgos del resumen (§11.3): solo los que superan los tres filtros (todos al menos "medio") y
 * tienen evidencia, sin repetir texto; los de mayor prioridad primero, como mucho 3.
 */
function elegirHallazgos(d: Diagnostico | null): Hallazgo[] {
  if (!d) return [];
  type Item = FormatoHallazgo & { id: string; texto: string; evidencias: Evidence[]; tipo: TipoHallazgo };
  const todos: Item[] = [
    ...d.fortalezas.map((x) => ({ ...x, tipo: "fortaleza" as const })),
    ...d.debilidades.map((x) => ({ ...x, tipo: "debilidad" as const })),
    ...d.riesgos.map((x) => ({ ...x, tipo: "riesgo" as const })),
    ...d.fricciones.map((x) => ({ ...x, tipo: "friccion" as const })),
  ];
  const vistos = new Set<string>();
  const out: Hallazgo[] = [];
  for (const x of ordenarPorPrioridad(todos.filter((x) => superaFiltros(x) && x.evidencias.length > 0))) {
    const clave = x.texto.trim().toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ tipo: x.tipo, id: x.id, titulo: x.titulo, texto: x.texto, estado: x.estado, prioridad: x.prioridad, evidencias: x.evidencias });
    if (out.length === MAX_HALLAZGOS) break;
  }
  return out;
}

/** Prefiere la segunda (la primera ya está en los hallazgos); si solo hay una, la primera. */
const segundaOPrimera = <T>(xs: T[]): T | undefined => xs[1] ?? xs[0];

function elegirOportunidad(os: Oportunidad[] | null): Oportunidad | null {
  if (!os || os.length === 0) return null;
  return [...os].sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad))[0];
}

export function construirResumen(
  anatomia: Anatomia,
  diagnostico: Diagnostico | null,
  oportunidades: Oportunidad[] | null,
  metricas: Metrica[],
  cobertura: CoberturaInforme,
  meta: { dominio: string; fecha: string },
  contexto?: { raw: RawData; precios: PrecioPublicado[]; competencia?: Competencia | null },
): Resumen {
  const destacado: Resumen["destacado"] = {};
  const fortaleza = diagnostico ? segundaOPrimera(diagnostico.fortalezas) : undefined;
  const debilidad = diagnostico ? segundaOPrimera(diagnostico.debilidades) : undefined;
  if (fortaleza) destacado.fortaleza = fortaleza;
  if (debilidad) destacado.debilidad = debilidad;
  return {
    nombre: anatomia.nombre.trim() || meta.dominio,
    dominio: meta.dominio,
    fecha: meta.fecha,
    categoria: anatomia.tipologias.map((t) => t.tipo),
    frase: anatomia.fraseResumen,
    modelo: { tipologias: anatomia.tipologias, estado: anatomia.modeloEstado },
    indicadores: elegirIndicadores(metricas),
    datosClave: contexto
      ? seleccionarDatosClave({
          tipologias: anatomia.tipologias.map((t) => t.tipo),
          anatomia,
          metricas,
          precios: contexto.precios,
          raw: contexto.raw,
          competencia: contexto.competencia ?? null,
        })
      : [],
    hallazgos: elegirHallazgos(diagnostico),
    destacado,
    oportunidad: elegirOportunidad(oportunidades),
    cobertura,
  };
}
