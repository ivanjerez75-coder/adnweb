import type { JsonModel } from "../ai/providers";
import { computeAnchors, type TipoNegocio } from "../anchors";
import { computeFacts } from "../facts";
import type { PageGetter } from "../safe-fetch";
import { extractSignals } from "../signals";
import type { RawData } from "../types";
import {
  datosPublicados,
  estimarIngresosMensuales,
  estimarTrafico,
  estimarValoracion,
  metricasSeo,
  type Estimacion,
} from "./estimates";
import { buildEvidence } from "./evidence";
import { limitarConcurrencia, type RunSectionOpts } from "./llm";
import { calcularScore, type DnaScore } from "./score";
import { generarAdn } from "./sections/adn";
import { generarAprender } from "./sections/aprender";
import { generarCierre } from "./sections/cierre";
import { generarCompetidores } from "./sections/competidores";
import { generarRevision, type Revision } from "./sections/revision";
import { generarNoSabemos } from "./sections/saber";

export type SeccionClave = "datos" | "adn" | "saber" | "competidores" | "revision" | "aprender" | "score" | "cierre";
export type EstadoSeccion = "pendiente" | "lista" | "error";

export interface ReportV3 {
  version: 3;
  dominio: string;
  generadoEn: string;
  secciones: Partial<Record<SeccionClave, unknown>>;
  estados: Record<SeccionClave, EstadoSeccion>;
}

export interface ReportV3Deps {
  models: JsonModel[];
  searchModels: JsonModel[];
  getPage: PageGetter;
  now: () => Date;
  runOpts?: RunSectionOpts;
}

export type OnSection = (clave: SeccionClave, contenido: unknown | null, estado: EstadoSeccion) => Promise<void>;

const MAX_IA_SIMULTANEAS = 3;
const PENDIENTE = "Pendiente del tipo de negocio";

/**
 * Cada llamada de IA (incluida la segunda de "diferencias" dentro de competidores) pasa por UN
 * limitador compartido: se envuelve `generate` de cada modelo, así todas las secciones lo respetan
 * sin tocar su código.
 */
function limitar(models: JsonModel[], limit: <T>(fn: () => Promise<T>) => Promise<T>): JsonModel[] {
  return models.map((m) => ({ ...m, generate: (p, o) => limit(() => m.generate(p, o)) }));
}

const pendiente = (unidad: string): Estimacion => ({
  valor: null,
  unidad,
  fuente: "Pendiente",
  metodologia: "Se calcula cuando se conoce el tipo de negocio.",
  confianza: "baja",
  motivoNoEstimable: PENDIENTE,
});

export async function buildReportV3(raw: RawData, deps: ReportV3Deps, onSection: OnSection): Promise<ReportV3> {
  const generadoEn = deps.now().toISOString();
  const secciones: ReportV3["secciones"] = {};
  const estados: ReportV3["estados"] = {
    datos: "pendiente",
    adn: "pendiente",
    saber: "pendiente",
    competidores: "pendiente",
    revision: "pendiente",
    aprender: "pendiente",
    score: "pendiente",
    cierre: "pendiente",
  };

  /** Registra la sección y avisa. Un fallo de onSection solo se propaga si `propagar` (adn). */
  const emitir = async (clave: SeccionClave, contenido: unknown | null, estado: EstadoSeccion, propagar = false) => {
    estados[clave] = estado;
    if (contenido !== null && estado === "lista") secciones[clave] = contenido;
    try {
      await onSection(clave, contenido, estado);
    } catch (e) {
      if (propagar) throw e;
    }
  };

  const limit = limitarConcurrencia(MAX_IA_SIMULTANEAS);
  const models = limitar(deps.models, limit);
  const searchModels = limitar(deps.searchModels, limit);
  const sectionDeps = { models, runOpts: deps.runOpts };

  const now = deps.now();
  const anchors = computeAnchors(raw, now);
  const signals = extractSignals(raw, now);
  const facts = computeFacts(raw);
  const reg = buildEvidence(raw, signals);
  const precios = raw.site?.pricesFound ?? [];

  // Fase 1: datos desde código (ingresos y valoración quedan pendientes hasta conocer el tipo de negocio).
  const datosBase = {
    trafico: estimarTrafico(anchors),
    seo: metricasSeo(raw),
    publicados: datosPublicados(raw),
  };
  await emitir("datos", { ...datosBase, ingresos: pendiente("€/mes"), valoracion: pendiente("€") }, "lista");

  // Fase 2: adn. Si falla, todo el informe falla.
  let adn;
  try {
    adn = await generarAdn(raw, reg, sectionDeps);
  } catch (e) {
    await emitir("adn", null, "error");
    throw e;
  }
  await emitir("adn", adn, "lista", true);

  // datos completo, ya con el tipo de negocio (misma clave: sustituye al anterior).
  try {
    // Los tipos solo de v3 no tienen tabla de referencia: se tratan como "otro" (queda "No estimable").
    const tipo: TipoNegocio = adn.tipoNegocio === "organizacion_social" || adn.tipoNegocio === "negocio_local" ? "otro" : adn.tipoNegocio;
    const ingresos = estimarIngresosMensuales(raw, anchors, tipo, precios);
    await emitir("datos", { ...datosBase, ingresos, valoracion: estimarValoracion(ingresos, tipo) }, "lista");
  } catch {
    // se queda con el datos de la fase 1
  }

  // Fase 3: en paralelo (el limitador reparte los huecos de IA).
  // aprender no espera a competidores ni a revision (recibe [] y null): así no queda en la cola
  // detrás de la sección más lenta y el tiempo total es el mínimo. Pierde algo de contexto.
  let revision: Revision | null = null;
  let textosVerificados: string[] = [];

  const tarea = async <T>(clave: SeccionClave, fn: () => Promise<T>, ok: (v: T) => void = () => {}) => {
    let valor: T;
    try {
      valor = await fn();
    } catch {
      // SeccionVaciaError y cualquier otro fallo: la sección queda en error.
      await emitir(clave, null, "error");
      return;
    }
    ok(valor);
    await emitir(clave, clave === "competidores" ? (valor as { lista: unknown }).lista : valor, "lista");
  };

  await Promise.all([
    tarea("saber", () => generarNoSabemos(raw, adn, sectionDeps)),
    tarea(
      "competidores",
      () => generarCompetidores(raw, adn, { searchModels, models, getPage: deps.getPage, runOpts: deps.runOpts }),
      (r) => {
        textosVerificados = r.textosVerificados;
      },
    ),
    tarea("revision", () => generarRevision(raw, adn, reg, sectionDeps), (r) => {
      revision = r;
    }),
    tarea("aprender", () => generarAprender(raw, adn, null, reg, sectionDeps, [])),
  ]);

  // Fase 4: score (código puro).
  let score: DnaScore | null = null;
  try {
    score = calcularScore(raw, facts, signals, adn, revision, textosVerificados, reg);
  } catch {
    score = null;
  }
  if (score) await emitir("score", score, "lista");
  else await emitir("score", null, "error");

  // Fase 5: cierre (necesita el score).
  if (score) {
    const s = score;
    await tarea("cierre", () => generarCierre(raw, adn, revision, s, reg, sectionDeps));
  } else {
    await emitir("cierre", null, "error");
  }

  return { version: 3, dominio: raw.domain, generadoEn, secciones, estados };
}
