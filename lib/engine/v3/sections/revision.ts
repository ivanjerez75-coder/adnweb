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

const Checks = z.object({
  propuestaClara: Check,
  diceAQuien: Check,
  muestraCasos: Check,
  facilContacto: Check,
  orientacionPrecio: Check,
});
export type Checks = z.infer<typeof Checks>;

export const RevisionIA = z.object({
  bien: z.array(z.object({ texto: z.string(), evidencias: ids })).default([]),
  lineas: z.array(z.object({ nombre: z.string(), checks: Checks, evidenciasChecks: ids })).default([]),
  problemas: z
    .array(z.object({ linea: z.string(), problema: z.string(), evidencias: ids, mejora: z.string() }))
    .default([]),
});

export interface Revision {
  bien: { texto: string; evidencias: Evidence[] }[];
  lineas: { nombre: string; checks: Checks; evidenciasChecks: Evidence[] }[];
  problemas: { linea: string; problema: string; evidencias: Evidence[]; mejora: string }[];
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
  "bien": [ { "texto": string, "evidencias": string[] } ],
  "lineas": [ { "nombre": string, "checks": { "propuestaClara": "si"|"no"|"no_aplica", "diceAQuien": "si"|"no"|"no_aplica", "muestraCasos": "si"|"no"|"no_aplica", "facilContacto": "si"|"no"|"no_aplica", "orientacionPrecio": "si"|"no"|"no_aplica" }, "evidenciasChecks": string[] } ],
  "problemas": [ { "linea": string, "problema": string, "evidencias": string[], "mejora": string } ]
}

Reglas:
${REGLAS_COMUNES}
- "bien": de 3 a 5 cosas que la web hace bien; cada una cita al menos un id válido.
- "lineas": una entrada por línea de negocio, con "nombre" exactamente igual al de la lista de líneas. Los checks solo cuentan si "evidenciasChecks" incluye al menos un extracto de página (ids tipo p1-e1); si no, se anulan.
- "problemas": cada problema debe citar en "evidencias" al menos un extracto literal de página (ids tipo p1-e1); si solo se apoya en señales, se descarta. "linea" es el nombre de la línea de negocio afectada y "mejora" es un cambio concreto.

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

  const bien: Revision["bien"] = [];
  for (const b of ia.bien) {
    const ev = citar(b.evidencias, reg);
    if (ev) bien.push({ texto: b.texto, evidencias: ev });
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
    if (linea && ev) problemas.push({ linea, problema: p.problema, evidencias: ev, mejora: p.mejora });
  }

  return { bien: bien.slice(0, MAX_BIEN), lineas, problemas };
}
