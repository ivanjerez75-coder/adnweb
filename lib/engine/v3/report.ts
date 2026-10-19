import type { JsonModel } from "../ai/providers";
import { computeFacts } from "../facts";
import type { PageGetter } from "../safe-fetch";
import { extractSignals } from "../signals";
import type { RawData } from "../types";
import { construirMetricas, escenarioIngresos, preciosPublicados, type Metrica } from "./estimates";
import { buildEvidence } from "./evidence";
import { limitarConcurrencia, type RunSectionOpts } from "./llm";
import { calcularScore, type DnaScore } from "./score";
import { adnDesdeAnatomia, generarAnatomia } from "./sections/anatomia";
import { generarAprender } from "./sections/aprender";
import { generarCierre } from "./sections/cierre";
import { generarCompetidores } from "./sections/competidores";
import { generarRevision, type Revision } from "./sections/revision";
import { generarNoSabemos, quitarIdsEvidencia } from "./sections/saber";

/** Secciones escritas por la IA: sus textos pueden traer ids de evidencia sueltos ("[p8-e7]"). */
const SECCIONES_IA: readonly SeccionClave[] = ["anatomia", "saber", "competidores", "revision", "aprender", "cierre"];

const esEvidencia = (v: object): boolean => "id" in v && "tipo" in v && "texto" in v && "fuente" in v;

/** Limpia los ids de evidencia de todos los textos, sin tocar las evidencias (sus citas son literales). */
export function limpiarTextos(v: unknown): unknown {
  if (typeof v === "string") return quitarIdsEvidencia(v);
  if (Array.isArray(v)) return v.map(limpiarTextos);
  if (v && typeof v === "object") {
    if (esEvidencia(v)) return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiarTextos(x)]));
  }
  return v;
}

export type SeccionClave = "datos" | "anatomia" | "saber" | "competidores" | "revision" | "aprender" | "score" | "cierre";
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

/**
 * Cada llamada de IA (incluida la segunda de "diferencias" dentro de competidores) pasa por UN
 * limitador compartido: se envuelve `generate` de cada modelo, así todas las secciones lo respetan
 * sin tocar su código.
 */
function limitar(models: JsonModel[], limit: <T>(fn: () => Promise<T>) => Promise<T>): JsonModel[] {
  return models.map((m) => ({ ...m, generate: (p, o) => limit(() => m.generate(p, o)) }));
}

export async function buildReportV3(raw: RawData, deps: ReportV3Deps, onSection: OnSection): Promise<ReportV3> {
  const generadoEn = deps.now().toISOString();
  const secciones: ReportV3["secciones"] = {};
  const estados: ReportV3["estados"] = {
    datos: "pendiente",
    anatomia: "pendiente",
    saber: "pendiente",
    competidores: "pendiente",
    revision: "pendiente",
    aprender: "pendiente",
    score: "pendiente",
    cierre: "pendiente",
  };

  /** Registra la sección y avisa. Un fallo de onSection solo se propaga si `propagar` (anatomia). */
  const emitir = async (clave: SeccionClave, bruto: unknown | null, estado: EstadoSeccion, propagar = false) => {
    const contenido = bruto !== null && SECCIONES_IA.includes(clave) ? limpiarTextos(bruto) : bruto;
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
  const signals = extractSignals(raw, now);
  const facts = computeFacts(raw);
  const reg = buildEvidence(raw, signals);

  // Fase 1: datos desde código (métricas etiquetadas, precios publicados y escenario hipotético).
  let metricas: Metrica[] = [];
  try {
    const precios = preciosPublicados(raw);
    metricas = construirMetricas(raw, now);
    await emitir("datos", { metricas, precios, escenario: escenarioIngresos(precios) }, "lista");
  } catch {
    await emitir("datos", null, "error");
  }

  // Fase 2: anatomía. Si falla, todo el informe falla.
  let anatomia;
  try {
    anatomia = await generarAnatomia(raw, reg, sectionDeps);
  } catch (e) {
    await emitir("anatomia", null, "error");
    throw e;
  }
  await emitir("anatomia", anatomia, "lista", true);
  // Puente hasta las Tareas 3-7: las secciones v3 aún leen la forma Adn.
  const adn = adnDesdeAnatomia(anatomia);
  const tipologias = anatomia.tipologias.map((t) => t.tipo);

  // Fase 3: en paralelo (el limitador reparte los huecos de IA).
  // aprender no espera a competidores ni a revision (recibe [] y null): así no queda en la cola
  // detrás de la sección más lenta y el tiempo total es el mínimo. Pierde algo de contexto.
  let revision: Revision | null = null;

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
    ),
    tarea("revision", () => generarRevision(raw, adn, reg, sectionDeps), (r) => {
      revision = r;
    }),
    tarea("aprender", () => generarAprender(raw, adn, null, reg, sectionDeps, [])),
  ]);

  // Fase 4: score (código puro).
  let score: DnaScore | null = null;
  try {
    score = calcularScore(raw, facts, signals, tipologias, adn, revision, metricas, reg);
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
