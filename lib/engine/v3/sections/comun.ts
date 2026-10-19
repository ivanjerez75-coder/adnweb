import { escapeAngles } from "../../ai/prompt";
import type { Adn, Anatomia } from "./anatomia";

/** Ayudas compartidas por las secciones del informe (antes en saber.ts y competencia.ts). */

export const BACKLINKS_ITEM = "Backlinks y palabras clave (requieren herramientas de pago)";

const ID_EVIDENCIA = String.raw`(?:p\d+(?:-e\d+)?|c\d+-e\d+|dato:[a-z_:0-9]+)`;
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

/**
 * Resumen compacto del adn v3 para los prompts (no se pasa el objeto entero). Es texto de la IA derivado
 * de la web: va escapado para que no pueda cerrar el delimitador DATOS_WEB (inyección de segundo orden).
 */
export function resumenAdn(adn: Adn): string {
  const lineas = adn.lineas.map((l) => `- ${l.nombre}: ${l.queOfrece.join(", ")}`).join("\n");
  return escapeAngles(`Tipo de negocio: ${adn.tipoNegocio}\nLíneas de negocio:\n${lineas}`);
}

/** Resumen compacto de la anatomía para los prompts. Texto de la IA derivado de la web: escapado. */
export function resumenAnatomia(a: Anatomia): string {
  const tipos = a.tipologias.map((t) => t.tipo).join(", ") || "desconocido";
  const lineas = a.lineas.map((l) => `- ${l.nombre}: ${l.queOfrece.join(", ")}${l.publico ? ` (para ${l.publico})` : ""}`).join("\n");
  return escapeAngles(
    `Negocio analizado: ${a.nombre || "(sin nombre)"}\nResumen: ${a.fraseResumen.texto}\nTipología: ${tipos}\nLíneas de negocio:\n${lineas || "- (ninguna)"}`,
  );
}
