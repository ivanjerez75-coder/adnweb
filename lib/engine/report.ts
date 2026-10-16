import { computeAnchors, employeeRevenueAnchor, type Anchors, type RevenueAnchor } from "./anchors";
import { extractSignals } from "./signals";
import { validateOpportunities, type Opportunity } from "./opportunities";
import { buildPrompt } from "./ai/prompt";
import { generateAiOutput, type JsonModel } from "./ai/providers";
import type { AiOutput } from "./ai/schema";
import type { StepReporter } from "./collect";
import type { Confidence, PageSpeedData, Range, RawData, Signal, SourceId, Technology, Trend } from "./types";

type SubscoreKey = keyof AiOutput["veredicto"]["puntuaciones"];
type Subscore = { valor: number; senales: string[] };

export interface Report {
  dominio: string;
  generadoEn: string;
  analisisLimitado: boolean;
  resumen: AiOutput["resumen"];
  trafico: {
    visitasMes: Range | null;
    confianza: Confidence;
    tendencia: Trend | "no estimable";
    redes: Record<string, string>;
    pagespeed: PageSpeedData | null;
    antiguedadAnios: number | null;
    tecnologias: Technology[];
    comentario: string;
  };
  ingresos: AiOutput["ingresos"];
  oportunidades: Opportunity[];
  pistas: Opportunity[];
  veredicto: {
    puntuacion: number;
    puntuaciones: Record<SubscoreKey, Subscore>;
    fortalezas: string[];
    debilidades: string[];
    competidores: AiOutput["veredicto"]["competidores"];
    conclusion: string;
  };
  senales: Signal[];
  fuentesNoDisponibles: SourceId[];
}

const CONFIDENCE_ORDER: Confidence[] = ["baja", "media", "alta"];

const nonNegative = (n: number | null): number | null => (n !== null && Number.isFinite(n) && n >= 0 ? n : null);

function orderedPair(min: number | null, max: number | null): [number | null, number | null] {
  const a = nonNegative(min);
  const b = nonNegative(max);
  return a !== null && b !== null && a > b ? [b, a] : [a, b];
}

/**
 * Límites de honestidad sobre los ingresos que propone la IA: sin tráfico estimado no hay
 * cifras, nada negativo, rangos ordenados y nunca más confianza que la del tráfico.
 */
export function clampIngresos(
  ingresos: AiOutput["ingresos"],
  anchors: Pick<Anchors, "visitasMes" | "confianzaTrafico">,
  revenueAnchor: RevenueAnchor | null = null,
): AiOutput["ingresos"] {
  if (anchors.visitasMes === null && revenueAnchor === null) {
    return { ...ingresos, anualMin: null, anualMax: null, valoracionMin: null, valoracionMax: null, confianza: "baja" };
  }
  let [anualMin, anualMax] = orderedPair(ingresos.anualMin, ingresos.anualMax);
  const [valoracionMin, valoracionMax] = orderedPair(ingresos.valoracionMin, ingresos.valoracionMax);

  if (revenueAnchor) {
    const { min, max } = revenueAnchor.range;
    if (anualMin !== null && anualMax !== null && anualMin <= max && anualMax >= min) {
      anualMin = Math.max(anualMin, min);
      anualMax = Math.min(anualMax, max);
    } else {
      anualMin = min;
      anualMax = max;
    }
    // La cifra queda acotada por el ancla: su confianza es la del ancla.
    return { ...ingresos, anualMin, anualMax, valoracionMin, valoracionMax, confianza: revenueAnchor.confianza };
  }

  const cap = CONFIDENCE_ORDER.indexOf(anchors.confianzaTrafico);
  const confianza = CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(ingresos.confianza), cap)];
  return { ...ingresos, anualMin, anualMax, valoracionMin, valoracionMax, confianza };
}

const SUBSCORE_KEYS: SubscoreKey[] = ["mercado", "traccion", "monetizacion", "diferenciacion"];

export async function buildReport(
  raw: RawData,
  deps: { models: JsonModel[]; now: () => Date },
  onStep: StepReporter = () => {},
): Promise<Report> {
  const now = deps.now();

  await onStep("Detectando señales…");
  const anchors = computeAnchors(raw, now);
  const baseSignals = extractSignals(raw, now);

  await onStep("Generando informe…");
  const ai = await generateAiOutput(buildPrompt(raw, anchors, baseSignals), deps.models);

  const marketSignals: Signal[] = ai.senalesMercado.map((m) => ({
    id: m.id,
    family: "mercado",
    source: "mercado",
    label: m.etiqueta,
    polarity: "negativa",
  }));
  const signals = [...baseSignals, ...marketSignals.filter((m) => !baseSignals.some((b) => b.id === m.id))];
  const knownIds = new Set(signals.map((s) => s.id));

  const { oportunidades, pistas } = validateOpportunities(ai.oportunidades, signals);

  const puntuaciones = Object.fromEntries(
    SUBSCORE_KEYS.map((key) => {
      const s = ai.veredicto.puntuaciones[key];
      return [key, { valor: Math.round(s.valor), senales: s.senales.filter((id) => knownIds.has(id)) }];
    }),
  ) as Record<SubscoreKey, Subscore>;
  const puntuacion = Math.round(SUBSCORE_KEYS.reduce((sum, k) => sum + puntuaciones[k].valor, 0) / SUBSCORE_KEYS.length);

  const revenueAnchor = anchors.ingresosPublicos ?? employeeRevenueAnchor(anchors.empleados, ai.resumen.tipoNegocio);
  const ingresos = clampIngresos(ai.ingresos, anchors, revenueAnchor);
  if (revenueAnchor) ingresos.suposiciones = [revenueAnchor.base, ...ingresos.suposiciones];

  return {
    dominio: raw.domain,
    generadoEn: now.toISOString(),
    analisisLimitado: !raw.site || raw.site.textLength < 500,
    resumen: ai.resumen,
    trafico: {
      visitasMes: anchors.visitasMes,
      confianza: anchors.confianzaTrafico,
      tendencia: raw.tranco?.trend ?? "no estimable",
      redes: raw.site?.socialLinks ?? {},
      pagespeed: raw.pagespeed,
      antiguedadAnios: anchors.antiguedadAnios,
      tecnologias: raw.site?.technologies ?? [],
      comentario: ai.trafico.comentario,
    },
    ingresos,
    oportunidades,
    pistas,
    veredicto: {
      puntuacion,
      puntuaciones,
      fortalezas: ai.veredicto.fortalezas.slice(0, 3),
      debilidades: ai.veredicto.debilidades.slice(0, 3),
      competidores: ai.veredicto.competidores.slice(0, 5),
      conclusion: ai.veredicto.conclusion,
    },
    senales: signals,
    fuentesNoDisponibles: raw.unavailable,
  };
}
