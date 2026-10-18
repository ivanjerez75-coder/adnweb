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
    .max(6),
  comoFunciona: bloque,
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
export interface Adn {
  queEs: AdnBloque | null;
  propuestaValor: AdnBloque | null;
  tipoNegocio: TipoNegocioV3;
  lineas: AdnLinea[];
  comoFunciona: AdnBloque | null;
}

function promptAdn(raw: RawData): string {
  return `Eres un analista de negocios. Explica qué es el negocio de la web analizada.

Devuelve SOLO un JSON con esta forma:
{
  "queEs": { "texto": string, "evidencias": string[] },
  "propuestaValor": { "texto": string, "evidencias": string[] },
  "tipoNegocio": ${TIPOS_NEGOCIO_V3.map((t) => `"${t}"`).join(" | ")},
  "lineas": [ { "nombre": string, "queOfrece": string[], "publico": string, "comoSeContrata": string, "ingresos": string, "evidencias": string[] } ],
  "comoFunciona": { "texto": string, "evidencias": string[] }
}

Reglas:
${REGLAS_COMUNES}
- "lineas": de 1 a 6 líneas de negocio reales. Cada elemento debe citar en "evidencias" al menos un id válido; los que no lo hagan se descartan.

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
  return {
    queEs: resolver(ia.queEs, reg),
    propuestaValor: resolver(ia.propuestaValor, reg),
    tipoNegocio: ia.tipoNegocio,
    lineas,
    comoFunciona: resolver(ia.comoFunciona, reg),
  };
}
