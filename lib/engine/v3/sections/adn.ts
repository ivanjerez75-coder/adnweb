import { z } from "zod";
import type { RawData } from "../../types";
import { TIPOS_NEGOCIO_V2 } from "../../ai/schema";
import { citar, type Evidence } from "../evidence";
import { SeccionVaciaError } from "../errors";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";

export const TIPOS_NEGOCIO_V3 = [...TIPOS_NEGOCIO_V2, "organizacion_social", "negocio_local"] as [
  (typeof TIPOS_NEGOCIO_V2)[number],
  ...("organizacion_social" | "negocio_local" | (typeof TIPOS_NEGOCIO_V2)[number])[],
];
export type TipoNegocioV3 = (typeof TIPOS_NEGOCIO_V3)[number];

const ids = z.array(z.string()).default([]);
const bloque = z.object({ texto: z.string(), evidencias: ids });

export const TIPOS_CANAL = ["prueba_gratuita", "demo", "contacto", "suscripcion", "compra", "registro", "presupuesto"] as const;
export type TipoCanal = (typeof TIPOS_CANAL)[number];
export const MODELO_ESTADOS = ["confirmado", "probable", "desconocido"] as const;
export type ModeloEstado = (typeof MODELO_ESTADOS)[number];

const esTipoCanal = (s: string): s is TipoCanal => (TIPOS_CANAL as readonly string[]).includes(s);

export const AdnIA = z.object({
  queEs: bloque,
  propuestaValor: bloque,
  tipoNegocio: z.enum(TIPOS_NEGOCIO_V3),
  lineas: z
    .array(
      z.object({
        nombre: z.string(),
        queOfrece: z.array(z.string()),
        publico: z.string(),
        comoSeContrata: z.string(),
        ingresos: z.string(),
        evidencias: ids,
      }),
    )
    .min(1)
    .transform((ls) => ls.slice(0, 6)), // más de 6: se recorta en vez de gastar otro intento de IA
  comoFunciona: bloque,
  // Un valor raro no tumba la sección: el estado final lo decide el código.
  modeloEstado: z.enum(MODELO_ESTADOS).catch("desconocido"),
  canales: z
    .array(z.object({ tipo: z.string(), evidencias: ids }))
    .catch([])
    .transform((xs) => xs.slice(0, 10)),
  afirmaciones: z
    .array(bloque)
    .catch([])
    .transform((xs) => xs.slice(0, 8)),
});
export type AdnIA = z.infer<typeof AdnIA>;

export interface AdnBloque {
  texto: string;
  evidencias: Evidence[];
}
export interface AdnLinea {
  nombre: string;
  queOfrece: string[];
  publico: string;
  comoSeContrata: string;
  ingresos: string;
  evidencias: Evidence[];
}
export interface AdnCanal {
  tipo: TipoCanal;
  evidencias: Evidence[];
}
export interface Adn {
  queEs: AdnBloque | null;
  propuestaValor: AdnBloque | null;
  tipoNegocio: TipoNegocioV3;
  lineas: AdnLinea[];
  comoFunciona: AdnBloque | null;
  /** Calculado en código: la IA propone, pero "confirmado" exige respaldo en la web. */
  modeloEstado: ModeloEstado;
  /** Canales de conversión; cada uno con al menos una evidencia de página. */
  canales: AdnCanal[];
  /** Lo que la empresa dice de sí misma ("La empresa afirma…"); nunca un hecho comprobado. */
  afirmaciones: AdnBloque[];
}

function promptAdn(raw: RawData): string {
  return `Eres un analista de negocios. Explica qué es el negocio de la web analizada.

Devuelve SOLO un JSON con esta forma:
{
  "queEs": { "texto": string, "evidencias": string[] },
  "propuestaValor": { "texto": string, "evidencias": string[] },
  "tipoNegocio": ${TIPOS_NEGOCIO_V3.map((t) => `"${t}"`).join(" | ")},
  "lineas": [ { "nombre": string, "queOfrece": string[], "publico": string, "comoSeContrata": string, "ingresos": string, "evidencias": string[] } ],
  "comoFunciona": { "texto": string, "evidencias": string[] },
  "modeloEstado": "confirmado" | "probable" | "desconocido",
  "canales": [ { "tipo": ${TIPOS_CANAL.map((t) => `"${t}"`).join(" | ")}, "evidencias": string[] } ],
  "afirmaciones": [ { "texto": string, "evidencias": string[] } ]
}

Reglas:
${REGLAS_COMUNES}
- "lineas": de 1 a 6 líneas de negocio reales. Cada elemento debe citar en "evidencias" al menos un id válido; los que no lo hagan se descartan.
- "modeloEstado": "confirmado" solo si la web explica cómo se contrata Y muestra un precio o un canal claro; "probable" si se deduce pero no está explícito; "desconocido" si no se puede saber. El sistema lo revisa y puede rebajarlo.
- "canales": las vías reales para convertirse en cliente que ves en la web. Cada canal cita al menos un extracto de página (ids tipo p1-e1); si no, se descarta.
- "afirmaciones": frases en las que la empresa se atribuye méritos, cifras o clientes (por ejemplo "líderes del sector"). Cada una cita al menos un extracto de página. Se mostrarán como "La empresa afirma…", nunca como hechos.

${bloqueDatosWeb(raw)}`;
}

function resolver(b: { texto: string; evidencias: string[] }, reg: Map<string, Evidence>): AdnBloque | null {
  const ev = citar(b.evidencias, reg);
  return ev ? { texto: b.texto, evidencias: ev } : null;
}

export async function generarAdn(raw: RawData, reg: Map<string, Evidence>, deps: SectionDeps): Promise<Adn> {
  const ia = await runSection("adn", promptAdn(raw), AdnIA, deps.models, deps.runOpts);
  const lineas: AdnLinea[] = [];
  for (const l of ia.lineas) {
    const ev = citar(l.evidencias, reg);
    if (ev) lineas.push({ ...l, evidencias: ev });
  }
  if (lineas.length === 0) throw new SeccionVaciaError("adn");

  const canales: AdnCanal[] = [];
  for (const c of ia.canales) {
    const tipo = c.tipo.trim().toLowerCase();
    const ev = citar(c.evidencias, reg, { requierePagina: true });
    if (esTipoCanal(tipo) && ev) canales.push({ tipo, evidencias: ev });
  }
  const afirmaciones: AdnBloque[] = [];
  for (const a of ia.afirmaciones) {
    const texto = a.texto.trim();
    const ev = citar(a.evidencias, reg, { requierePagina: true });
    if (texto && ev) afirmaciones.push({ texto, evidencias: ev });
  }

  return {
    queEs: resolver(ia.queEs, reg),
    propuestaValor: resolver(ia.propuestaValor, reg),
    tipoNegocio: ia.tipoNegocio,
    lineas,
    comoFunciona: resolver(ia.comoFunciona, reg),
    modeloEstado: calcularModeloEstado(ia.modeloEstado, lineas, canales, reg),
    canales,
    afirmaciones,
  };
}

/**
 * Regla de código: "confirmado" solo con una línea cuyo "cómo se contrata" cita un extracto de página
 * Y (un precio publicado o un canal con evidencia de página). Si no, baja a "probable";
 * "desconocido" de la IA se respeta.
 */
function calcularModeloEstado(propuesto: ModeloEstado, lineas: AdnLinea[], canales: AdnCanal[], reg: Map<string, Evidence>): ModeloEstado {
  if (propuesto === "desconocido") return "desconocido";
  const contrataConPagina = lineas.some((l) => l.comoSeContrata.trim() !== "" && l.evidencias.some((e) => e.tipo === "pagina"));
  const hayPrecio = [...reg.keys()].some((k) => k.startsWith("dato:precio:"));
  const hayCanal = canales.some((c) => c.evidencias.some((e) => e.tipo === "pagina"));
  return propuesto === "confirmado" && contrataConPagina && (hayPrecio || hayCanal) ? "confirmado" : "probable";
}
