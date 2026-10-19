import { z } from "zod";
import type { RawData } from "../../types";
import { citar, type Evidence } from "../evidence";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import type { Adn } from "./adn";
import { resumenAdn } from "./saber";

const Check = z.enum(["si", "no", "no_aplica"]).catch("no_aplica"); // un valor raro no tumba la sección
export type CheckValor = z.infer<typeof Check>;
const ids = z.array(z.string()).default([]);
// Campos de ficha: un valor raro cae a un valor seguro en vez de gastar un reintento.
const Confianza = z.enum(["alta", "media", "baja"]).catch("media");
export type ConfianzaRevision = z.infer<typeof Confianza>;
const ficha = {
  relevancia: z.string().catch(""),
  confianza: Confianza,
  limitaciones: z.array(z.string()).catch([]),
};
const MAX_LIMITACIONES = 3;

const Checks = z.object({
  propuestaClara: Check,
  diceAQuien: Check,
  muestraCasos: Check,
  facilContacto: Check,
  orientacionPrecio: Check,
});
export type Checks = z.infer<typeof Checks>;

export const RevisionIA = z.object({
  bien: z.array(z.object({ texto: z.string(), evidencias: ids, ...ficha })).default([]),
  lineas: z.array(z.object({ nombre: z.string(), checks: Checks, evidenciasChecks: ids })).default([]),
  problemas: z
    .array(z.object({ linea: z.string(), problema: z.string(), evidencias: ids, mejora: z.string(), ...ficha }))
    .default([]),
});

interface Ficha {
  /** Por qué importa a este negocio. */
  relevancia: string;
  confianza: ConfianzaRevision;
  limitaciones: string[];
}
export interface Revision {
  bien: ({ texto: string; evidencias: Evidence[] } & Ficha)[];
  lineas: { nombre: string; checks: Checks; evidenciasChecks: Evidence[] }[];
  problemas: ({ linea: string; problema: string; evidencias: Evidence[]; mejora: string } & Ficha)[];
}

const MAX_BIEN = 5;
const NO_APLICA: Checks = {
  propuestaClara: "no_aplica",
  diceAQuien: "no_aplica",
  muestraCasos: "no_aplica",
  facilContacto: "no_aplica",
  orientacionPrecio: "no_aplica",
};

function prompt(raw: RawData, adn: Adn): string {
  return `Eres un consultor que revisa la web de un negocio. Sé concreto: nada de consejos genéricos.

${resumenAdn(adn)}

Devuelve SOLO un JSON con esta forma:
{
  "bien": [ { "texto": string, "evidencias": string[], "relevancia": string, "confianza": "alta"|"media"|"baja", "limitaciones": string[] } ],
  "lineas": [ { "nombre": string, "checks": { "propuestaClara": "si"|"no"|"no_aplica", "diceAQuien": "si"|"no"|"no_aplica", "muestraCasos": "si"|"no"|"no_aplica", "facilContacto": "si"|"no"|"no_aplica", "orientacionPrecio": "si"|"no"|"no_aplica" }, "evidenciasChecks": string[] } ],
  "problemas": [ { "linea": string, "problema": string, "evidencias": string[], "mejora": string, "relevancia": string, "confianza": "alta"|"media"|"baja", "limitaciones": string[] } ]
}

Reglas:
${REGLAS_COMUNES}
- "bien": de 3 a 5 cosas que la web hace bien; cada una cita al menos un id válido.
- "lineas": una entrada por línea de negocio, con "nombre" exactamente igual al de la lista de líneas. Los checks solo cuentan si "evidenciasChecks" incluye al menos un extracto de página (ids tipo p1-e1); si no, se anulan.
- "problemas": cada problema debe citar en "evidencias" al menos un extracto literal de página (ids tipo p1-e1); si solo se apoya en señales, se descarta. "linea" es el nombre de la línea de negocio afectada y "mejora" es un cambio concreto.
- "relevancia": una frase sobre por qué importa a este negocio. "confianza": qué tan seguro es el hallazgo con lo visible. "limitaciones": lo que no se pudo comprobar (máximo 3, puede ser vacío).
- Solo describes lo que se ve en la web. No afirmes nada sobre conversión, abandono de carrito ni clientes perdidos: no se puede saber desde fuera; si lo sospechas, dilo como limitación.
- Si un punto "bien" solo se apoya en lo que la empresa dice de sí misma (autoelogios, cifras sin respaldo), su confianza es "baja".

${bloqueDatosWeb(raw)}`;
}

export async function generarRevision(
  raw: RawData,
  adn: Adn,
  reg: Map<string, Evidence>,
  deps: SectionDeps,
): Promise<Revision> {
  const ia = await runSection("revision", prompt(raw, adn), RevisionIA, deps.models, deps.runOpts);

  const unica = adn.lineas.length === 1 ? adn.lineas[0].nombre : null;
  const nombres = new Map(adn.lineas.map((l) => [l.nombre.trim().toLowerCase(), l.nombre]));
  const mapear = (n: string): string | null => unica ?? nombres.get(n.trim().toLowerCase()) ?? null;

  // Extractos que la empresa usa para presumir: un "bien" que solo se apoya en ellos no está comprobado.
  const idsAfirmacion = new Set(adn.afirmaciones.flatMap((a) => a.evidencias.map((e) => e.id)));
  const limpiar = (xs: string[]): string[] => xs.map((x) => x.trim()).filter(Boolean).slice(0, MAX_LIMITACIONES);

  const bien: Revision["bien"] = [];
  for (const b of ia.bien) {
    const ev = citar(b.evidencias, reg);
    if (!ev) continue;
    const limitaciones = limpiar(b.limitaciones);
    let confianza = b.confianza;
    if (ev.every((e) => idsAfirmacion.has(e.id))) {
      confianza = "baja";
      limitaciones.splice(MAX_LIMITACIONES - 1);
      limitaciones.push("Se apoya solo en lo que la empresa afirma de sí misma; no está comprobado.");
    }
    bien.push({ texto: b.texto, evidencias: ev, relevancia: b.relevancia.trim(), confianza, limitaciones });
  }

  const lineas: Revision["lineas"] = [];
  const vistas = new Set<string>();
  for (const l of ia.lineas) {
    const nombre = mapear(l.nombre);
    if (!nombre || vistas.has(nombre)) continue;
    vistas.add(nombre);
    const conPagina = citar(l.evidenciasChecks, reg, { requierePagina: true });
    lineas.push(
      conPagina
        ? { nombre, checks: l.checks, evidenciasChecks: conPagina }
        : { nombre, checks: { ...NO_APLICA }, evidenciasChecks: citar(l.evidenciasChecks, reg) ?? [] },
    );
  }

  const problemas: Revision["problemas"] = [];
  for (const p of ia.problemas) {
    const linea = mapear(p.linea);
    const ev = citar(p.evidencias, reg, { requierePagina: true });
    if (linea && ev) {
      problemas.push({
        linea,
        problema: p.problema,
        evidencias: ev,
        mejora: p.mejora,
        relevancia: p.relevancia.trim(),
        confianza: p.confianza,
        limitaciones: limpiar(p.limitaciones),
      });
    }
  }

  return { bien: bien.slice(0, MAX_BIEN), lineas, problemas };
}
