import type { Evidence } from "./evidence";

/** Las cuatro clases de dato del informe v4. */
export type ClaseDato = "observado" | "fuente_externa" | "inferencia" | "hipotesis";

export const CLASES_DATO: readonly ClaseDato[] = ["observado", "fuente_externa", "inferencia", "hipotesis"];

/** Fuentes de terceros (no son la web del negocio). */
const FUENTES_EXTERNAS = new Set(["tranco", "radar", "wikidata", "crux"]);

/**
 * Clase de una afirmación, decidida por código:
 * - siempreHipotesis (riesgos, segmentos alternativos, oportunidades) → hipotesis.
 * - Una página de la web y la IA dice que lo declara la web → observado.
 * - Solo datos `dato:*` de fuentes externas → fuente_externa.
 * - Cualquier otro caso → inferencia.
 */
export function claseDeAfirmacion(evidencias: Evidence[], opts: { declaradoEnWeb?: boolean; siempreHipotesis?: boolean } = {}): ClaseDato {
  if (opts.siempreHipotesis) return "hipotesis";
  if (opts.declaradoEnWeb && evidencias.some((e) => e.tipo === "pagina")) return "observado";
  if (evidencias.length > 0 && evidencias.every((e) => e.tipo === "dato" && FUENTES_EXTERNAS.has(e.fuente))) return "fuente_externa";
  return "inferencia";
}

export type Tipologia =
  | "saas"
  | "ecommerce"
  | "marketplace"
  | "servicio_profesional"
  | "contenido"
  | "freemium"
  | "app"
  | "organizacion_social"
  | "negocio_local"
  | "web_informativa";

/** Tipologías en las que no tiene sentido exigir precios publicados. */
const SIN_PRECIOS_PUBLICOS: readonly Tipologia[] = ["servicio_profesional", "organizacion_social", "negocio_local", "web_informativa"];

/**
 * ¿Aplican los criterios de "precios publicados"? No, si todas las tipologías son de las que no
 * publican precios, o si todas las líneas se contratan "por presupuesto".
 */
export function aplicaPrecios(tipologias: Tipologia[], lineas: { comoSeContrata: string }[] = []): boolean {
  if (tipologias.length > 0 && tipologias.every((t) => SIN_PRECIOS_PUBLICOS.includes(t))) return false;
  if (lineas.length > 0 && lineas.every((l) => /presupuesto/i.test(l.comoSeContrata))) return false;
  return true;
}

/** Adapta un tipoNegocio v3 a tipologías. El informe ya las toma de la anatomía; queda para fixtures v3. */
export function tipologiasDesdeTipoNegocio(tipo: string): Tipologia[] {
  const mapa: Record<string, Tipologia> = { servicios: "servicio_profesional", contenido_ads: "contenido", otro: "web_informativa" };
  return [(mapa[tipo] ?? tipo) as Tipologia];
}
