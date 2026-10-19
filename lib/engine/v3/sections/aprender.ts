import { z } from "zod";
import type { RawData } from "../../types";
import { citar, type Evidence } from "../evidence";
import { SeccionVaciaError } from "../errors";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import { limpiarAfirmacionesNoRespaldadas } from "../filtro";
import type { Adn } from "./adn";
import type { Competidor } from "./competidores";
import type { Revision } from "./revision";
import { resumenAdn } from "./saber";
// Lo que viene de la IA (bien, competidores) se escapa: inyección de segundo orden.
import { escapeAngles } from "../../ai/prompt";

const MAX_ITEMS = 4;

const AprenderIA = z.object({
  items: z
    .array(z.object({ texto: z.string(), evidencias: z.array(z.string()).default([]) }))
    .default([])
    .transform((xs) => xs.slice(0, MAX_ITEMS * 2)), // margen para descartar sin gastar otro intento
});

export interface ItemAprender {
  texto: string;
  evidencias: Evidence[];
}

function prompt(raw: RawData, adn: Adn, revision: Revision | null, competidores: Competidor[]): string {
  const bien = revision?.bien.length ? `\nLo que la web ya hace bien:\n${revision.bien.map((b) => `- ${b.texto}`).join("\n")}\n` : "";
  const verificados = competidores.filter((c) => c.verificado);
  const comp = verificados.length
    ? `\nCompetidores verificados:\n${verificados.map((c) => `- ${c.nombre}: ${c.ofrece}`).join("\n")}\n`
    : "";
  return `Eres un analista de negocios. Indica qué puede aprender OTRO negocio (o quien quiera montar uno parecido) mirando la web analizada: lecciones concretas y reutilizables.

${resumenAdn(adn)}
${escapeAngles(bien + comp)}
Devuelve SOLO un JSON: { "items": [ { "texto": string, "evidencias": string[] } ] }

Reglas:
${REGLAS_COMUNES}
- De 2 a 4 lecciones. Cada una cita en "evidencias" al menos un id válido; las que no lo hagan se descartan.
- Nada de consejos genéricos: cada lección se apoya en algo que hace esta web.

${bloqueDatosWeb(raw)}`;
}

/**
 * "Qué se puede aprender" (2-4 items, cada uno con al menos una evidencia). Sin relleno: si sobreviven
 * menos de 2 se devuelven los que haya; si no sobrevive ninguno lanza SeccionVaciaError.
 */
export async function generarAprender(
  raw: RawData,
  adn: Adn,
  revision: Revision | null,
  reg: Map<string, Evidence>,
  deps: SectionDeps,
  competidores: Competidor[] = [],
): Promise<ItemAprender[]> {
  const ia = await runSection("aprender", prompt(raw, adn, revision, competidores), AprenderIA, deps.models, deps.runOpts);
  const out: ItemAprender[] = [];
  for (const i of ia.items) {
    const ev = citar(i.evidencias, reg);
    const texto = limpiarAfirmacionesNoRespaldadas(i.texto, { descriptivo: true });
    if (ev && texto) out.push({ texto, evidencias: ev });
  }
  if (out.length === 0) throw new SeccionVaciaError("aprender");
  return out.slice(0, MAX_ITEMS);
}
