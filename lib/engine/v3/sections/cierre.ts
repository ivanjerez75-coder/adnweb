import { z } from "zod";
import type { RawData } from "../../types";
import { citar, type Evidence } from "../evidence";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import type { DnaScore } from "../score";
import type { Adn } from "./adn";
import type { Revision } from "./revision";
import { resumenAdn } from "./saber";

export type Nivel = "alto" | "medio" | "bajo";
export type Prioridad = "alta" | "media" | "baja";
export type ConfianzaOportunidad = "comprobado" | "hipotesis";
const NIVELES: Nivel[] = ["bajo", "medio", "alto"];
const PRIORIDADES: Prioridad[] = ["baja", "media", "alta"];
const MAX_OPORTUNIDADES = 3;
const MIN_EVIDENCIAS = 2;

export interface Oportunidad {
  hallazgo: string;
  evidencias: Evidence[];
  /** Qué se ganaría, en lenguaje llano (no una cifra inventada). */
  impacto: string;
  impactoNivel: Nivel;
  esfuerzo: Nivel;
  riesgo: Nivel;
  /** Calculada en código a partir de impacto, esfuerzo y riesgo. */
  prioridad: Prioridad;
  accion: string;
  /** Cómo comprobar que funciona. */
  validacion: string;
  /** "comprobado" solo si se apoya en la propia web; si no, "hipotesis". */
  confianza: ConfianzaOportunidad;
  supuestos: string[];
}
export interface Cierre {
  oportunidades: Oportunidad[];
}

// Los niveles llegan como texto libre y se validan en código: un valor raro descarta solo esa oportunidad.
const CierreIA = z.object({
  oportunidades: z
    .array(
      z.object({
        hallazgo: z.string(),
        evidencias: z.array(z.string()).default([]),
        impacto: z.string().catch(""),
        impactoNivel: z.string(),
        esfuerzo: z.string(),
        riesgo: z.string().catch("medio"),
        accion: z.string(),
        validacion: z.string().catch(""),
        confianza: z.string().catch("hipotesis"),
        sobreLaWeb: z.boolean().catch(false),
        supuestos: z.array(z.string()).catch([]),
      }),
    )
    .default([])
    .transform((xs) => xs.slice(0, 12)),
});

const esNivel = (s: string): s is Nivel => (NIVELES as string[]).includes(s);

/** impacto(3/2/1) - esfuerzo(1/2/3)*0.5 - riesgo(1/2/3)*0.5: > 1.5 alta, > 0.5 media, si no baja. */
export function calcularPrioridad(impacto: Nivel, esfuerzo: Nivel, riesgo: Nivel): Prioridad {
  const valor = (n: Nivel) => NIVELES.indexOf(n) + 1; // bajo=1, medio=2, alto=3
  const puntos = valor(impacto) - valor(esfuerzo) * 0.5 - valor(riesgo) * 0.5;
  return puntos > 1.5 ? "alta" : puntos > 0.5 ? "media" : "baja";
}

function prompt(raw: RawData, adn: Adn, revision: Revision | null, score: DnaScore): string {
  const dims = score.dimensiones
    .map((d) => `- ${d.clave} (${d.nombre}): ${d.valor === null ? "No puntuable" : d.valor} [cobertura ${Math.round(d.cobertura * 100)} %]`)
    .join("\n");
  const problemas = revision?.problemas.length
    ? `\nProblemas detectados:\n${revision.problemas.map((p) => `- ${p.linea}: ${p.problema} (mejora: ${p.mejora})`).join("\n")}\n`
    : "";
  return `Eres un consultor de negocio. Cierra el informe con las oportunidades más útiles.

${resumenAdn(adn)}

DNA Score (calculado por código; NO lo cambies ni lo discutas):
${dims}
${problemas}
Devuelve SOLO un JSON:
{
  "oportunidades": [ {
    "hallazgo": string,
    "evidencias": string[],
    "impacto": string,
    "impactoNivel": "alto"|"medio"|"bajo",
    "esfuerzo": "alto"|"medio"|"bajo",
    "riesgo": "alto"|"medio"|"bajo",
    "accion": string,
    "validacion": string,
    "confianza": "comprobado"|"hipotesis",
    "sobreLaWeb": boolean,
    "supuestos": string[]
  } ]
}

Reglas:
${REGLAS_COMUNES}
- "oportunidades": como máximo 3, concretas y específicas de este negocio. Cada una cita en "evidencias" al menos 2 ids válidos distintos; las que no lo hagan se descartan. Si no hay 3 buenas, devuelve menos: no rellenes.
- "hallazgo": lo que se observa; "impacto": qué se ganaría, en palabras (sin cifras inventadas); "accion": qué cambiar; "validacion": cómo comprobar que funcionó; "supuestos": lo que das por cierto sin poder verlo.
- "confianza": "comprobado" solo si el hallazgo trata de la propia web y se ve en un extracto de página; en cualquier otro caso es "hipotesis". "sobreLaWeb" indica si el hallazgo trata de la propia web. La prioridad no la eliges tú: la calcula el sistema.

${bloqueDatosWeb(raw)}`;
}

/** Cierre del informe: hasta 3 oportunidades validadas. Los resúmenes del score los construye el código (score.ts). */
export async function generarCierre(
  raw: RawData,
  adn: Adn,
  revision: Revision | null,
  score: DnaScore,
  reg: Map<string, Evidence>,
  deps: SectionDeps,
): Promise<Cierre> {
  const ia = await runSection("cierre", prompt(raw, adn, revision, score), CierreIA, deps.models, deps.runOpts);

  const oportunidades: Oportunidad[] = [];
  const vistas = new Set<string>();
  for (const o of ia.oportunidades) {
    const hallazgo = o.hallazgo.trim();
    const accion = o.accion.trim();
    const impactoNivel = o.impactoNivel.trim().toLowerCase();
    const esfuerzo = o.esfuerzo.trim().toLowerCase();
    const riesgoIa = o.riesgo.trim().toLowerCase();
    if (!hallazgo || !accion || !esNivel(impactoNivel) || !esNivel(esfuerzo)) continue;
    const riesgo: Nivel = esNivel(riesgoIa) ? riesgoIa : "medio";
    const ev = citar(o.evidencias, reg, { minimo: MIN_EVIDENCIAS });
    if (!ev) continue;
    const clave = hallazgo.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    // "comprobado" lo decide el código: la IA lo propone, pero exige extracto de página y hallazgo sobre la web.
    const comprobado = o.confianza.trim().toLowerCase() === "comprobado" && o.sobreLaWeb && ev.some((e) => e.tipo === "pagina");
    oportunidades.push({
      hallazgo,
      evidencias: ev,
      impacto: o.impacto.trim(),
      impactoNivel,
      esfuerzo,
      riesgo,
      prioridad: calcularPrioridad(impactoNivel, esfuerzo, riesgo),
      accion,
      validacion: o.validacion.trim(),
      confianza: comprobado ? "comprobado" : "hipotesis",
      supuestos: o.supuestos.map((s) => s.trim()).filter(Boolean),
    });
  }
  // Estable: a igual prioridad e impacto se conserva el orden de la IA.
  oportunidades.sort(
    (x, y) =>
      PRIORIDADES.indexOf(y.prioridad) - PRIORIDADES.indexOf(x.prioridad) ||
      NIVELES.indexOf(y.impactoNivel) - NIVELES.indexOf(x.impactoNivel),
  );
  return { oportunidades: oportunidades.slice(0, MAX_OPORTUNIDADES) };
}
