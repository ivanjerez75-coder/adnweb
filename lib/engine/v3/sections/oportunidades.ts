import { z } from "zod";
import type { RawData } from "../../types";
import { escapeAngles } from "../../ai/prompt";
import { citar, type Evidence } from "../evidence";
import { SeccionVaciaError } from "../errors";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import { limpiarAfirmacionesNoRespaldadas as limpiar } from "../filtro";
import type { Anatomia } from "./anatomia";
import type { Competencia } from "./competencia";
import type { Diagnostico } from "./diagnostico";
import { quitarIdsEvidencia, resumenAnatomia } from "./comun";

export const TIPOLOGIAS_OPORTUNIDAD = ["mejorar", "diferenciarse", "complementario", "nuevo_mercado"] as const;
export type TipologiaOportunidad = (typeof TIPOLOGIAS_OPORTUNIDAD)[number];
export type Nivel = "alto" | "medio" | "bajo";
export type Prioridad = "alta" | "media" | "baja";
export type EstadoOportunidad = "detectada" | "por_validar";
const NIVELES: readonly Nivel[] = ["bajo", "medio", "alto"];
const CRITERIOS = ["impacto", "evidencia", "viabilidad", "diferenciacion", "facilidadValidacion"] as const;
export type Criterios = Record<(typeof CRITERIOS)[number], Nivel>;

export interface Oportunidad {
  id: string;
  tipologia: TipologiaOportunidad;
  titulo: string;
  /** Ids de hallazgos del diagnóstico (f*, d*, r*, x*) o dimensiones de la comparación ("gp:precio"). */
  origen: string[];
  ficha: {
    evidencia: { texto: string; evidencias: Evidence[] };
    problema: string;
    solucion: string;
    porQuePodria: string;
    faltaComprobar: string[];
  };
  estado: EstadoOportunidad;
  criterios: Criterios;
  /** Calculada en código a partir de los cinco criterios. */
  prioridad: Prioridad;
  clase: "hipotesis";
}

const MAX_OPORTUNIDADES = 6;
const PRIORIDADES: readonly Prioridad[] = ["baja", "media", "alta"];

const texto = z.string().catch("");
const OportunidadesIA = z.object({
  oportunidades: z
    .array(
      z
        .object({
          tipologia: texto,
          titulo: texto,
          origen: z.array(z.string()).catch([]),
          ficha: z
            .object({
              evidencia: z.object({ texto, evidencias: z.array(z.string()).catch([]) }).catch({ texto: "", evidencias: [] }),
              problema: texto,
              solucion: texto,
              porQuePodria: texto,
              faltaComprobar: z.array(z.string()).catch([]),
            })
            .nullish()
            .catch(null),
          estado: texto,
          criterios: z.record(z.string()).catch({}),
        })
        .nullish()
        .catch(null),
    )
    .catch([])
    .transform((xs) => xs.filter((x): x is NonNullable<typeof x> => x != null).slice(0, MAX_OPORTUNIDADES * 2)),
});

const valor = (n: Nivel) => NIVELES.indexOf(n) + 1; // bajo=1, medio=2, alto=3

/** Suma de los cinco criterios (alto=3, medio=2, bajo=1): ≥ 12 alta, ≥ 9 media, si no baja. */
export function calcularPrioridad(c: Criterios): { puntos: number; prioridad: Prioridad } {
  const puntos = CRITERIOS.reduce((s, k) => s + valor(c[k]), 0);
  return { puntos, prioridad: puntos >= 12 ? "alta" : puntos >= 9 ? "media" : "baja" };
}

/** Un nivel que no se entiende cuenta como "bajo": un criterio sin valorar nunca sube la prioridad. */
const nivel = (s: string | undefined): Nivel => {
  const n = (s ?? "").trim().toLowerCase();
  return (NIVELES as readonly string[]).includes(n) ? (n as Nivel) : "bajo";
};
const esTipologia = (s: string): s is TipologiaOportunidad => (TIPOLOGIAS_OPORTUNIDAD as readonly string[]).includes(s);
const esPaginaPropia = (e: Evidence) => e.tipo === "pagina" && /^p\d/.test(e.id);
const limpio = (s: string, descriptivo = false) => limpiar(quitarIdsEvidencia(s ?? ""), { descriptivo });

/** Hallazgos enlazables: id → línea del prompt. Las dimensiones gp: solo si la comparación tiene datos. */
function origenes(diagnostico: Diagnostico | null, competencia: Competencia | null): Map<string, string> {
  const m = new Map<string, string>();
  const ids = (ev: Evidence[]) => (ev.length ? ` [evidencias: ${ev.map((e) => e.id).join(", ")}]` : "");
  if (diagnostico) {
    for (const f of diagnostico.fortalezas) m.set(f.id, `${f.id}: ${f.texto} (fortaleza frente a ${f.frenteA})${ids(f.evidencias)}`);
    for (const d of diagnostico.debilidades) m.set(d.id, `${d.id}: ${d.texto} (debilidad)${ids(d.evidencias)}`);
    for (const r of diagnostico.riesgos) m.set(r.id, `${r.id}: ${r.texto} (riesgo)${ids(r.evidencias)}`);
    for (const x of diagnostico.fricciones) m.set(x.id, `${x.id}: ${x.texto} (fricción: ${x.tipo})${ids(x.evidencias)}`);
  }
  for (const g of competencia?.ganaPierde ?? []) {
    if (g.destaca === "sin_datos") continue;
    const extra = [g.porQueImporta && `importa: ${g.porQueImporta}`, g.diferenciarse && `diferenciarse: ${g.diferenciarse}`].filter(Boolean).join("; ");
    m.set(`gp:${g.dimension}`, `gp:${g.dimension}: en la comparación de ${g.dimension} destaca ${g.destaca}${extra ? ` (${extra})` : ""}${ids(g.evidencia)}`);
  }
  return m;
}

function prompt(raw: RawData, anatomia: Anatomia, hallazgos: Map<string, string>): string {
  // Texto de la IA derivado de la web (diagnóstico, comparación): dentro del delimitador y escapado.
  return `Eres un consultor de negocio. Convierte el diagnóstico en oportunidades de negocio concretas, cada una enlazada a un hallazgo real.

${resumenAnatomia(anatomia)}

Hallazgos (cada línea empieza por su id):
<<<DATOS_WEB
${escapeAngles([...hallazgos.values()].join("\n"))}
DATOS_WEB>>>

Devuelve SOLO un JSON:
{
  "oportunidades": [ {
    "tipologia": "mejorar" | "diferenciarse" | "complementario" | "nuevo_mercado",
    "titulo": string,
    "origen": string[],
    "ficha": {
      "evidencia": { "texto": string, "evidencias": string[] },
      "problema": string,
      "solucion": string,
      "porQuePodria": string,
      "faltaComprobar": string[]
    },
    "estado": "detectada" | "por_validar",
    "criterios": { "impacto": "alto"|"medio"|"bajo", "evidencia": "alto"|"medio"|"bajo", "viabilidad": "alto"|"medio"|"bajo", "diferenciacion": "alto"|"medio"|"bajo", "facilidadValidacion": "alto"|"medio"|"bajo" }
  } ]
}

Reglas:
${REGLAS_COMUNES}
- De 3 a 6 oportunidades, específicas de este negocio. Si no hay 3 buenas, devuelve menos: no rellenes.
- "tipologia": "mejorar" (el negocio actual), "diferenciarse" (de la competencia), "complementario" (un producto o servicio añadido) o "nuevo_mercado" (otro mercado o segmento).
- "origen": los ids de los hallazgos de la lista de los que sale (f1, d2, r1, x1, gp:precio…). Es obligatorio: una oportunidad sin un origen de la lista se descarta.
- "ficha.evidencia": qué se observó, citando en "evidencias" al menos un id de extracto válido (p<n>-e<k>, c<n>-e<k> o dato:*); sin evidencia válida se descarta.
- "problema": el problema potencial; "solucion": la solución posible; "porQuePodria": por qué podría funcionar; "faltaComprobar": lo que habría que comprobar antes de invertir en ello.
- Son hipótesis: nada de cifras, plazos, presupuestos ni ingresos previstos.
- "estado": "detectada" solo si la evidencia es un extracto de la web analizada; si no, "por_validar".
- "criterios": valora cada uno como alto, medio o bajo. La prioridad no la eliges tú: la calcula el sistema.

${bloqueDatosWeb(raw)}`;
}

/**
 * Oportunidades (3-6, sin relleno): cada una enlaza al menos un hallazgo real del diagnóstico o de la
 * comparación; si no, se descarta. La prioridad la calcula el código. Lanza SeccionVaciaError si no
 * queda ninguna (y no llama a la IA si no hay hallazgos que enlazar).
 */
export async function generarOportunidades(
  raw: RawData,
  anatomia: Anatomia,
  diagnostico: Diagnostico | null,
  competencia: Competencia | null,
  regTotal: Map<string, Evidence>,
  deps: SectionDeps,
): Promise<Oportunidad[]> {
  const hallazgos = origenes(diagnostico, competencia);
  if (hallazgos.size === 0) throw new SeccionVaciaError("oportunidades");
  const ia = await runSection("oportunidades", prompt(raw, anatomia, hallazgos), OportunidadesIA, deps.models, deps.runOpts);

  const candidatas: (Omit<Oportunidad, "id"> & { puntos: number })[] = [];
  const vistas = new Set<string>();
  for (const o of ia.oportunidades) {
    const tipologia = o.tipologia.trim().toLowerCase();
    const titulo = limpio(o.titulo, true);
    const origen = [...new Set(o.origen.map((s) => s.trim()))].filter((id) => hallazgos.has(id));
    if (!esTipologia(tipologia) || !titulo || origen.length === 0 || !o.ficha) continue;
    const evidencias = citar(o.ficha.evidencia.evidencias, regTotal);
    if (!evidencias) continue;
    const clave = titulo.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const criterios = Object.fromEntries(CRITERIOS.map((k) => [k, nivel(o.criterios[k])])) as Criterios;
    const { puntos, prioridad } = calcularPrioridad(criterios);
    candidatas.push({
      tipologia,
      titulo,
      origen,
      ficha: {
        evidencia: { texto: limpio(o.ficha.evidencia.texto), evidencias },
        problema: limpio(o.ficha.problema),
        solucion: limpio(o.ficha.solucion, true),
        porQuePodria: limpio(o.ficha.porQuePodria),
        // Nombran datos desconocidos ("la tasa de conversión"): solo se quitan las cifras.
        faltaComprobar: o.ficha.faltaComprobar
          .map((s) => limpiar(quitarIdsEvidencia(s ?? ""), { soloCifras: true }))
          .filter(Boolean),
      },
      // "detectada" lo decide el código: la IA lo propone, pero exige un extracto de la propia web.
      estado: o.estado.trim().toLowerCase() === "detectada" && evidencias.some(esPaginaPropia) ? "detectada" : "por_validar",
      criterios,
      prioridad,
      clase: "hipotesis",
      puntos,
    });
  }
  if (candidatas.length === 0) throw new SeccionVaciaError("oportunidades");

  // Estable: a igual prioridad y puntos se conserva el orden de la IA.
  candidatas.sort((a, b) => PRIORIDADES.indexOf(b.prioridad) - PRIORIDADES.indexOf(a.prioridad) || b.puntos - a.puntos);
  return candidatas.slice(0, MAX_OPORTUNIDADES).map(({ puntos, ...o }, i) => {
    void puntos;
    return { id: `o${i + 1}`, ...o };
  });
}
