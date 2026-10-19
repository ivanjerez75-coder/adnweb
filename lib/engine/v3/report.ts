import type { JsonModel } from "../ai/providers";
import { computeFacts } from "../facts";
import type { PageGetter } from "../safe-fetch";
import { extractSignals } from "../signals";
import type { RawData } from "../types";
import { evaluarCobertura } from "./cobertura";
import { construirMetricas, escenarioIngresos, preciosPublicados, type Metrica } from "./estimates";
import { buildEvidence } from "./evidence";
import { limitarConcurrencia, type RunSectionOpts } from "./llm";
import { calcularScore, type DnaScore } from "./score";
import { generarAnatomia } from "./sections/anatomia";
import { generarCompetencia, type CompetidoresVerificados } from "./sections/competencia";
import { generarDiagnostico } from "./sections/diagnostico";
import { generarOportunidades } from "./sections/oportunidades";
import { generarPlan } from "./sections/plan";
import { generarRendimiento } from "./sections/rendimiento";
import { construirResumen } from "./sections/resumen";
import { quitarIdsEvidencia } from "./sections/comun";

/** Las 9 secciones del informe v4. El DNA Score va dentro de rendimiento. */
export const SECCIONES_V4 = ["datos", "anatomia", "rendimiento", "competencia", "diagnostico", "oportunidades", "plan", "resumen", "cobertura"] as const;
export type SeccionClaveV4 = (typeof SECCIONES_V4)[number];
export type EstadoSeccion = "pendiente" | "lista" | "error";

/** Secciones con texto de la IA: pueden traer ids de evidencia sueltos ("[p8-e7]"). El resumen copia textos suyos. */
const SECCIONES_IA: readonly SeccionClaveV4[] = ["anatomia", "rendimiento", "competencia", "diagnostico", "oportunidades", "plan", "resumen"];

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

export interface ReportV4 {
  version: 4;
  dominio: string;
  generadoEn: string;
  secciones: Partial<Record<SeccionClaveV4, unknown>>;
  estados: Record<SeccionClaveV4, EstadoSeccion>;
}

export interface ReportV4Deps {
  models: JsonModel[];
  searchModels: JsonModel[];
  getPage: PageGetter;
  now: () => Date;
  runOpts?: RunSectionOpts;
}

export type OnSection = (clave: SeccionClaveV4, contenido: unknown | null, estado: EstadoSeccion) => Promise<void>;

const MAX_IA_SIMULTANEAS = 3;

/**
 * Cada llamada de IA (incluidas las de fichas y comparación dentro de competencia) pasa por UN
 * limitador compartido: se envuelve `generate` de cada modelo, así todas las secciones lo respetan
 * sin tocar su código.
 */
function limitar(models: JsonModel[], limit: <T>(fn: () => Promise<T>) => Promise<T>): JsonModel[] {
  return models.map((m) => ({ ...m, generate: (p, o) => limit(() => m.generate(p, o)) }));
}

/**
 * Fases (v4):
 * 1. datos (código) · 2. anatomía (fatal) ·
 * 3. en paralelo: rendimiento, competencia y diagnóstico. El diagnóstico arranca en cuanto competencia
 *    sabe qué competidores están verificados (búsqueda + lectura), sin esperar a sus fichas ni a la
 *    comparación: así esas dos llamadas y la del diagnóstico comparten el limitador a la vez ·
 * 4. oportunidades (diagnóstico + comparación) · 5. plan · 6. resumen y cobertura (código).
 */
export async function buildReportV4(raw: RawData, deps: ReportV4Deps, onSection: OnSection): Promise<ReportV4> {
  const generadoEn = deps.now().toISOString();
  const secciones: ReportV4["secciones"] = {};
  const estados = Object.fromEntries(SECCIONES_V4.map((k) => [k, "pendiente"])) as ReportV4["estados"];

  /** Registra la sección y avisa. Un fallo de onSection solo se propaga si `propagar` (anatomia). */
  const emitir = async (clave: SeccionClaveV4, bruto: unknown | null, estado: EstadoSeccion, propagar = false) => {
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
  const tipologias = anatomia.tipologias.map((t) => t.tipo);

  /** Ejecuta una sección aislada: si falla queda en error y devuelve null. */
  const tarea = async <T>(clave: SeccionClaveV4, fn: () => Promise<T>, emitido: (v: T) => unknown = (v) => v): Promise<T | null> => {
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

  // Fase 3: competencia avisa en cuanto tiene los verificados; si falla antes, el diagnóstico va sin ellos.
  let avisarVerificados: (v: CompetidoresVerificados | null) => void = () => {};
  const pVerificados = new Promise<CompetidoresVerificados | null>((r) => (avisarVerificados = r));
  const pCompetencia = tarea(
    "competencia",
    () =>
      generarCompetencia(raw, anatomia, reg, {
        searchModels,
        models,
        getPage: deps.getPage,
        runOpts: deps.runOpts,
        now: deps.now,
        onVerificados: (v) => avisarVerificados(v),
      }),
    (v) => v.competencia,
  );
  // Si no avisó (falló antes de leer las webs), se resuelve aquí; si ya avisó, esto no cambia nada.
  void pCompetencia.then((c) => avisarVerificados(c ? { competidores: c.competencia.competidores, regCompetidores: c.regCompetidores } : null));

  const pDiagnostico = pVerificados.then((v) =>
    tarea("diagnostico", () =>
      generarDiagnostico(raw, anatomia, v ? { competidores: v.competidores } : null, v ? new Map([...reg, ...v.regCompetidores]) : reg, sectionDeps),
    ),
  );
  // El score (código puro) en cuanto hay diagnóstico (o su fallo): lo espera rendimiento.
  const pScore: Promise<DnaScore> = pDiagnostico.then((d) =>
    calcularScore(raw, facts, signals, tipologias, anatomia, d ? { lineas: d.comprobaciones } : null, metricas, reg),
  );
  pScore.catch(() => {}); // el fallo lo recoge rendimiento
  const pRendimiento = tarea("rendimiento", () =>
    generarRendimiento(raw, metricas, anatomia, pScore, sectionDeps, pDiagnostico.then((d) => d?.fricciones ?? [])),
  );

  // Fase 4: oportunidades, con el diagnóstico y la comparación (dónde gana / pierde).
  const [diagnostico, competencia] = await Promise.all([pDiagnostico, pCompetencia]);
  const regTotal = competencia ? new Map([...reg, ...competencia.regCompetidores]) : reg;
  const pOportunidades = tarea("oportunidades", () => generarOportunidades(raw, anatomia, diagnostico, competencia?.competencia ?? null, regTotal, sectionDeps));
  // Fase 5: plan, tras las oportunidades (si fallan, se apoya solo en debilidades y fricciones).
  const pPlan = pOportunidades.then((o) => tarea("plan", () => generarPlan(o ?? [], diagnostico, sectionDeps)));
  const [oportunidades] = await Promise.all([pOportunidades, pPlan, pRendimiento]);

  // Fase 6: resumen y cobertura (código). La cobertura se evalúa sin el resumen, que la incluye.
  const cobertura = evaluarCobertura({ raw, secciones, estados });
  await tarea("resumen", async () =>
    construirResumen(anatomia, diagnostico, oportunidades, metricas, cobertura, { dominio: raw.domain, fecha: generadoEn }),
  );
  await emitir("cobertura", cobertura, "lista");

  return { version: 4, dominio: raw.domain, generadoEn, secciones, estados };
}
