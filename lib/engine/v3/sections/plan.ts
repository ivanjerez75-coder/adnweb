import { z } from "zod";
import { escapeAngles } from "../../ai/prompt";
import { SeccionVaciaError } from "../errors";
import { runSection, type SectionDeps } from "../llm";
import { REGLAS_COMUNES } from "../prompt";
import { contieneImporte, limpiarAfirmacionesNoRespaldadas as limpiar } from "../filtro";
import type { Diagnostico } from "./diagnostico";
import type { Oportunidad } from "./oportunidades";
import { quitarIdsEvidencia } from "./comun";

export const GRUPOS_PLAN = ["comprobar", "experimentar", "medir"] as const;
export type GrupoPlan = (typeof GRUPOS_PLAN)[number];

export interface Accion {
  id: string;
  /** Id de la oportunidad (o*), debilidad (d*) o fricción (x*) que la origina. */
  origen: string;
  tarea: string;
  porQue: string;
  recursos: string[];
  indicador: string;
  criterio: { continuar: string; modificar: string; descartar: string };
}
export type Plan = Record<GrupoPlan, Accion[]>;

const MAX_POR_GRUPO = 3;

const texto = z.string().catch("");
const AccionIA = z
  .object({
    origen: texto,
    tarea: texto,
    porQue: texto,
    recursos: z.array(z.string()).catch([]),
    indicador: texto,
    criterio: z.object({ continuar: texto, modificar: texto, descartar: texto }).catch({ continuar: "", modificar: "", descartar: "" }),
  })
  .nullish()
  .catch(null);
const grupo = z
  .array(AccionIA)
  .catch([])
  .default([])
  .transform((xs) => xs.filter((x): x is NonNullable<typeof x> => x != null).slice(0, MAX_POR_GRUPO * 3));
const PlanIA = z.object({ comprobar: grupo, experimentar: grupo, medir: grupo });

const NUMERO = String.raw`(?:\d+|un|una|unos|unas|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta)`;
const UNIDAD = String.raw`(?:d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?|trimestres?|horas?)`;
const PLAZOS: RegExp[] = [
  // "en 2 semanas", "durante tres meses", "dentro de un mes", "30 días".
  new RegExp(String.raw`\b(?:en|durante|dentro\s+de|tras|antes\s+de|plazo\s+de)\s+(?:los\s+)?(?:pr[oó]xim[oa]s\s+)?${NUMERO}\s+${UNIDAD}\b`, "i"),
  new RegExp(String.raw`\b\d+\s*${UNIDAD}\b`, "i"),
  /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i,
  /\b(?:19|20)\d{2}\b/,
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
  /\bQ[1-4]\b/,
];

/** ¿Lleva un plazo, una fecha o un importe? El plan nunca los lleva: la acción entera se descarta. */
export function contienePlazoOImporte(t: string): boolean {
  return contieneImporte(t) || PLAZOS.some((re) => re.test(t ?? ""));
}

/** Hallazgos que pueden originar una acción: oportunidades, debilidades y fricciones. */
function origenes(oportunidades: Oportunidad[], diagnostico: Diagnostico | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of oportunidades) {
    const falta = o.ficha.faltaComprobar.length ? ` · falta comprobar: ${o.ficha.faltaComprobar.join("; ")}` : "";
    m.set(o.id, `${o.id}: ${o.titulo} (oportunidad, prioridad ${o.prioridad}) · ${o.ficha.solucion}${falta}`);
  }
  for (const d of diagnostico?.debilidades ?? []) m.set(d.id, `${d.id}: ${d.texto} (debilidad)`);
  for (const x of diagnostico?.fricciones ?? []) m.set(x.id, `${x.id}: ${x.texto} (fricción potencial: ${x.tipo})`);
  return m;
}

function prompt(hallazgos: Map<string, string>): string {
  const accion = `{ "origen": string, "tarea": string, "porQue": string, "recursos": string[], "indicador": string, "criterio": { "continuar": string, "modificar": string, "descartar": string } }`;
  return `Eres un consultor de negocio. Convierte las oportunidades y los hallazgos en un plan de acción en tres grupos: comprobar, experimentar y medir.

Oportunidades y hallazgos (cada línea empieza por su id):
<<<DATOS_WEB
${escapeAngles([...hallazgos.values()].join("\n"))}
DATOS_WEB>>>

Devuelve SOLO un JSON:
{ "comprobar": [ ${accion} ], "experimentar": [ … ], "medir": [ … ] }

Reglas:
${REGLAS_COMUNES}
- "comprobar": lo que hay que verificar antes de invertir (lo que falta comprobar de las oportunidades). "experimentar": pruebas pequeñas y reversibles. "medir": qué seguir midiendo.
- Como máximo 3 acciones por grupo, concretas y específicas de este negocio. Si no hay buenas, devuelve menos.
- "origen": el id de la oportunidad (o1…), debilidad (d1…) o fricción (x1…) de la lista que la origina. Una acción sin un origen de la lista se descarta.
- "tarea": qué hacer; "porQue": por qué es prioritaria; "recursos": qué hace falta o de qué depende; "indicador": qué se medirá; "criterio": cuándo continuar, modificar o descartar.
- NUNCA pongas plazos, fechas, presupuestos, importes ni incrementos de ingresos o ventas: la acción que los lleve se descarta.`;
}

const limpio = (s: string) => limpiar(quitarIdsEvidencia(s ?? ""));

/**
 * Plan de acción: la IA escribe las acciones; el código descarta las de origen desconocido y las que
 * llevan plazos o importes, y limita cada grupo a 3. Lanza SeccionVaciaError si no queda ninguna
 * (y no llama a la IA si no hay nada que enlazar).
 */
export async function generarPlan(oportunidades: Oportunidad[], diagnostico: Diagnostico | null, deps: SectionDeps): Promise<Plan> {
  const hallazgos = origenes(oportunidades, diagnostico);
  if (hallazgos.size === 0) throw new SeccionVaciaError("plan");
  const ia = await runSection("plan", prompt(hallazgos), PlanIA, deps.models, deps.runOpts);

  const plan: Plan = { comprobar: [], experimentar: [], medir: [] };
  const vistas = new Set<string>();
  let n = 0;
  for (const g of GRUPOS_PLAN) {
    for (const a of ia[g]) {
      if (plan[g].length >= MAX_POR_GRUPO) break;
      const origen = a.origen.trim();
      if (!hallazgos.has(origen)) continue;
      const brutos = [a.tarea, a.porQue, a.indicador, a.criterio.continuar, a.criterio.modificar, a.criterio.descartar, ...a.recursos];
      if (brutos.some(contienePlazoOImporte)) continue;
      const tarea = limpio(a.tarea);
      const indicador = limpio(a.indicador);
      if (!tarea || !indicador || vistas.has(tarea.toLowerCase())) continue;
      vistas.add(tarea.toLowerCase());
      plan[g].push({
        id: `a${++n}`,
        origen,
        tarea,
        porQue: limpio(a.porQue),
        recursos: a.recursos.map(limpio).filter(Boolean),
        indicador,
        criterio: { continuar: limpio(a.criterio.continuar), modificar: limpio(a.criterio.modificar), descartar: limpio(a.criterio.descartar) },
      });
    }
  }
  if (n === 0) throw new SeccionVaciaError("plan");
  return plan;
}
