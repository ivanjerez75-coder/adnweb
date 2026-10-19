import { z } from "zod";
import type { RawData } from "../../types";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import { limpiarAfirmacionesNoRespaldadas } from "../filtro";
import type { Adn } from "./adn";

export const BACKLINKS_ITEM = "Backlinks y palabras clave (requieren herramientas de pago)";
const MAX_ITEMS = 8;

const NoSabemosIA = z.object({
  items: z
    .array(z.string())
    .min(1)
    .transform((xs) => xs.map((x) => x.trim()).filter((x) => x.length > 0)),
});

const ID_EVIDENCIA = String.raw`(?:p\d+(?:-e\d+)?|dato:[a-z_:0-9]+)`;
const PARENTESIS_IDS = new RegExp(String.raw`\s*\(\s*${ID_EVIDENCIA}(?:\s*,\s*${ID_EVIDENCIA})*\s*\)`, "gi");
const CORCHETES_IDS = new RegExp(String.raw`\s*\[\s*${ID_EVIDENCIA}(?:\s*,\s*${ID_EVIDENCIA})*\s*\]`, "gi");

/** Quita los paréntesis o corchetes que solo contienen ids de evidencia ("(p3, p4)", "[p8-e7]") y ordena los espacios. */
export function quitarIdsEvidencia(texto: string): string {
  return texto
    .replace(PARENTESIS_IDS, "")
    .replace(CORCHETES_IDS, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Resumen compacto del adn para los prompts (no se pasa el objeto entero). */
export function resumenAdn(adn: Adn): string {
  const lineas = adn.lineas.map((l) => `- ${l.nombre}: ${l.queOfrece.join(", ")}`).join("\n");
  return `Tipo de negocio: ${adn.tipoNegocio}\nLíneas de negocio:\n${lineas}`;
}

function prompt(raw: RawData, adn: Adn): string {
  return `Eres un analista de negocios. Indica qué NO se puede saber sobre este negocio solo con su web pública (3 a 8 puntos), adaptado a su tipo de negocio. Cosas concretas y específicas de este negocio (por ejemplo cifras internas, márgenes, retención, ocupación, volumen real de ventas), no consejos genéricos.

${resumenAdn(adn)}

Devuelve SOLO un JSON: { "items": string[] }

Reglas:
${REGLAS_COMUNES}
- Cada punto es una frase corta que dice qué dato falta y por qué no es visible desde la web.

${bloqueDatosWeb(raw)}`;
}

export async function generarNoSabemos(raw: RawData, adn: Adn, deps: SectionDeps): Promise<string[]> {
  const ia = await runSection("saber", prompt(raw, adn), NoSabemosIA, deps.models, deps.runOpts);
  const otros = ia.items.map((x) => limpiarAfirmacionesNoRespaldadas(quitarIdsEvidencia(x), { soloCifras: true })).filter((x) => x.length > 0 && x !== BACKLINKS_ITEM);
  // El item de backlinks va siempre: ocupa un hueco y el resto se recorta.
  return [...otros.slice(0, MAX_ITEMS - 1), BACKLINKS_ITEM];
}
