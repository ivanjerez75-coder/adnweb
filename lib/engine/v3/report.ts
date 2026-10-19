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
import { generarCierre, type ProblemasCierre } from "./sections/cierre";
import { generarCompetencia } from "./sections/competencia";
import { generarDiagnostico, type Diagnostico } from "./sections/diagnostico";
import { generarRendimiento } from "./sections/rendimiento";
import { quitarIdsEvidencia } from "./sections/comun";

/** Secciones escritas por la IA: sus textos pueden traer ids de evidencia sueltos ("[p8-e7]"). */
const SECCIONES_IA: readonly SeccionClave[] = ["anatomia", "rendimiento", "competencia", "diagnostico", "aprender", "cierre"];

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

/** El DNA Score va dentro de rendimiento. */
/**
 * TEMPORAL hasta la Tarea 5 (oportunidades sustituye a cierre): cierre aún lee "problemas" con la
 * forma de la antigua revisión; se adaptan desde las debilidades del diagnóstico.
 */
export function problemasDesdeDiagnostico(d: Diagnostico | null): ProblemasCierre | null {
  return d ? { problemas: d.debilidades.map((x) => ({ linea: "", problema: x.texto, mejora: x.porQueImporta })) } : null;
}

export type SeccionClave = "datos" | "anatomia" | "rendimiento" | "competencia" | "diagnostico" | "aprender" | "cierre";
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
 * Cada llamada de IA (incluidas las de fichas y comparación dentro de competencia) pasa por UN
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
    rendimiento: "pendiente",
    competencia: "pendiente",
    diagnostico: "pendiente",
    aprender: "pendiente",
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
  // - competencia → diagnóstico (recibe el registro unido web + competidores) → score (código).
  // - rendimiento lanza su llamada de IA en seguida y espera al score y a las fricciones para cerrar.
  // - aprender no espera a nadie (recibe [] y null): pierde algo de contexto pero no alarga el total.
  /** Ejecuta una sección aislada: si falla queda en error y devuelve null. */
  const tarea = async <T>(clave: SeccionClave, fn: () => Promise<T>, emitido: (v: T) => unknown = (v) => v): Promise<T | null> => {
    let valor: T;
    try {
      valor = await fn();
    } catch {
      // SeccionVaciaError y cualquier otro fallo: la sección queda en error.
      await emitir(clave, null, "error");
      return null;
    }
    await emitir(clave, emitido(valor), "lista");
    return valor;
  };

  const pCompetencia = tarea(
    "competencia",
    () => generarCompetencia(raw, anatomia, reg, { searchModels, models, getPage: deps.getPage, runOpts: deps.runOpts, now: deps.now }),
    (v) => v.competencia,
  );
  const pDiagnostico = pCompetencia.then((c) =>
    tarea("diagnostico", () =>
      generarDiagnostico(raw, anatomia, c?.competencia ?? null, c ? new Map([...reg, ...c.regCompetidores]) : reg, sectionDeps),
    ),
  );
  // Fase 4: score (código puro), en cuanto hay diagnóstico (o su fallo).
  const pScore: Promise<DnaScore> = pDiagnostico.then((d) =>
    calcularScore(raw, facts, signals, tipologias, adn, d ? { lineas: d.comprobaciones } : null, metricas, reg),
  );
  pScore.catch(() => {}); // el fallo lo recogen rendimiento y cierre

  const [diagnostico] = await Promise.all([
    pDiagnostico,
    tarea("rendimiento", () => generarRendimiento(raw, metricas, anatomia, pScore, sectionDeps, pDiagnostico.then((d) => d?.fricciones ?? []))),
    tarea("aprender", () => generarAprender(raw, adn, null, reg, sectionDeps, [])),
  ]);
  const score: DnaScore | null = await pScore.catch(() => null);

  // Fase 5: cierre (necesita el score).
  if (score) await tarea("cierre", () => generarCierre(raw, adn, problemasDesdeDiagnostico(diagnostico), score, reg, sectionDeps));
  else await emitir("cierre", null, "error");

  return { version: 3, dominio: raw.domain, generadoEn, secciones, estados };
}
