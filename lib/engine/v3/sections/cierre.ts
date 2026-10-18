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
const NIVELES: Nivel[] = ["bajo", "medio", "alto"];
const MAX_ACCIONES = 3;
const MIN_EVIDENCIAS = 2;

export interface Accion {
  que: string;
  porque: string;
  evidencias: Evidence[];
  impacto: Nivel;
  esfuerzo: Nivel;
  datosQueFaltan: string[];
}
export interface Cierre {
  motivos: Record<string, string[]>;
  acciones: Accion[];
}

// impacto/esfuerzo llegan como texto libre y se validan en código: un valor raro descarta solo esa acción.
const CierreIA = z.object({
  motivos: z.record(z.string(), z.string()).catch({}),
  acciones: z
    .array(
      z.object({
        que: z.string(),
        porque: z.string(),
        evidencias: z.array(z.string()).default([]),
        impacto: z.string(),
        esfuerzo: z.string(),
        datosQueFaltan: z.array(z.string()).default([]),
      }),
    )
    .default([])
    .transform((xs) => xs.slice(0, 12)),
});

const esNivel = (s: string): s is Nivel => (NIVELES as string[]).includes(s);

function prompt(raw: RawData, adn: Adn, revision: Revision | null, score: DnaScore): string {
  const crit = score.criterios
    .map((c) => `- ${c.clave} (${c.nombre}): ${c.valor === null ? "No puntuable" : c.valor}${c.motivos.length ? ` [${c.motivos.join("; ")}]` : ""}`)
    .join("\n");
  const problemas = revision?.problemas.length
    ? `\nProblemas detectados:\n${revision.problemas.map((p) => `- ${p.linea}: ${p.problema} (mejora: ${p.mejora})`).join("\n")}\n`
    : "";
  return `Eres un consultor de negocio. Cierra el informe con (1) una frase por criterio que explique la puntuación y (2) las acciones más útiles.

${resumenAdn(adn)}

DNA Score (calculado por código; NO lo cambies, solo explícalo):
${crit}
${problemas}
Devuelve SOLO un JSON:
{
  "motivos": { "<clave del criterio>": string },
  "acciones": [ { "que": string, "porque": string, "evidencias": string[], "impacto": "alto"|"medio"|"bajo", "esfuerzo": "alto"|"medio"|"bajo", "datosQueFaltan": string[] } ]
}

Reglas:
${REGLAS_COMUNES}
- "motivos": una frase corta en lenguaje llano por cada criterio puntuado, usando las claves de la lista. No cambies ni discutas los números.
- "acciones": como máximo 3, concretas y específicas de este negocio. Cada una cita en "evidencias" al menos 2 ids válidos distintos; las que no lo hagan se descartan. Si no hay 3 buenas, devuelve menos: no rellenes.
- "datosQueFaltan": datos que no se ven en la web y que cambiarían la prioridad (puede ser vacío).

${bloqueDatosWeb(raw)}`;
}

/** Cierre del informe: motivos del score en lenguaje llano (la IA explica, no puntúa) y hasta 3 acciones validadas. */
export async function generarCierre(
  raw: RawData,
  adn: Adn,
  revision: Revision | null,
  score: DnaScore,
  reg: Map<string, Evidence>,
  deps: SectionDeps,
): Promise<Cierre> {
  const ia = await runSection("cierre", prompt(raw, adn, revision, score), CierreIA, deps.models, deps.runOpts);

  const claves = new Set(score.criterios.map((c) => c.clave as string));
  const motivos: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(ia.motivos)) {
    const t = v.trim();
    if (claves.has(k) && t) motivos[k] = [t];
  }

  const acciones: Accion[] = [];
  const vistas = new Set<string>();
  for (const a of ia.acciones) {
    const que = a.que.trim();
    const porque = a.porque.trim();
    const impacto = a.impacto.trim().toLowerCase();
    const esfuerzo = a.esfuerzo.trim().toLowerCase();
    if (!que || !porque || !esNivel(impacto) || !esNivel(esfuerzo)) continue;
    const ev = citar(a.evidencias, reg, { minimo: MIN_EVIDENCIAS });
    if (!ev) continue;
    const clave = que.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    acciones.push({
      que,
      porque,
      evidencias: ev,
      impacto,
      esfuerzo,
      datosQueFaltan: a.datosQueFaltan.map((d) => d.trim()).filter(Boolean),
    });
  }
  // Estable: a igual impacto y esfuerzo se conserva el orden de la IA.
  acciones.sort((x, y) => NIVELES.indexOf(y.impacto) - NIVELES.indexOf(x.impacto) || NIVELES.indexOf(x.esfuerzo) - NIVELES.indexOf(y.esfuerzo));
  return { motivos, acciones: acciones.slice(0, MAX_ACCIONES) };
}
