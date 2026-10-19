import { z } from "zod";
import type { RawData } from "../../types";
import { escapeAngles } from "../../ai/prompt";
import { citar, type Evidence } from "../evidence";
import { SeccionVaciaError } from "../errors";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import { limpiarAfirmacionesNoRespaldadas as limpiar } from "../filtro";
import { aplicaPrecios, claseDeAfirmacion, type ClaseDato } from "../clases";
import { preciosPublicados } from "../estimates";
import type { Anatomia } from "./anatomia";
import type { Competencia } from "./competencia";
import { quitarIdsEvidencia, resumenAnatomia } from "./comun";

// ---------- Comprobaciones por línea (antes en revision.ts; las usa el DNA Score) ----------

const Check = z.enum(["si", "no", "no_aplica"]).catch("no_aplica"); // un valor raro no tumba la sección
export type CheckValor = z.infer<typeof Check>;
const Checks = z
  .object({
    propuestaClara: Check,
    diceAQuien: Check,
    muestraCasos: Check,
    facilContacto: Check,
    orientacionPrecio: Check,
  })
  .catch({ propuestaClara: "no_aplica", diceAQuien: "no_aplica", muestraCasos: "no_aplica", facilContacto: "no_aplica", orientacionPrecio: "no_aplica" });
export type Checks = z.infer<typeof Checks>;
export interface LineaComprobada {
  nombre: string;
  checks: Checks;
  evidenciasChecks: Evidence[];
}
/** Lo que el DNA Score lee de las comprobaciones de la web. */
export interface ComprobacionesWeb {
  lineas: LineaComprobada[];
}
const NO_APLICA: Checks = {
  propuestaClara: "no_aplica",
  diceAQuien: "no_aplica",
  muestraCasos: "no_aplica",
  facilContacto: "no_aplica",
  orientacionPrecio: "no_aplica",
};

// ---------- Tipos del diagnóstico ----------

export const TIPOS_FRICCION = ["que_compra", "para_quien", "precio", "pasos", "objeciones", "confianza"] as const;
export type TipoFriccion = (typeof TIPOS_FRICCION)[number];

export interface Fortaleza {
  id: string;
  texto: string;
  /** Frente a qué alternativa lo es: un competidor (id o nombre) u otra alternativa. */
  frenteA: string;
  paraQuien: string;
  evidencias: Evidence[];
  clase: ClaseDato;
}
export interface Debilidad {
  id: string;
  texto: string;
  porQueImporta: string;
  evidencias: Evidence[];
  clase: ClaseDato;
}
export interface Riesgo {
  id: string;
  texto: string;
  evidencias: Evidence[];
  clase: "hipotesis";
}
export interface Friccion {
  id: string;
  tipo: TipoFriccion;
  texto: string;
  evidencias: Evidence[];
  potencial: true;
}
export interface Diagnostico {
  fortalezas: Fortaleza[];
  debilidades: Debilidad[];
  riesgos: Riesgo[];
  fricciones: Friccion[];
  integrado: { texto: string };
  /** Comprobaciones de claridad por línea, con extracto de página; alimentan el DNA Score. */
  comprobaciones: LineaComprobada[];
}

const MAX_FORTALEZAS = 5;
const MAX_DEBILIDADES = 5;
const MAX_RIESGOS = 4;
const MAX_FRICCIONES = 6;
const MAX_CHARS_COMPETIDOR = 2000;
/** Texto mínimo de la home para afirmar que algo no está (igual que en facts y score). */
const TEXTO_LEGIBLE = 1500;

// ---------- Esquema de la IA ----------

const ids = z.array(z.string()).catch([]);
const lista = <T extends z.ZodTypeAny>(s: T) =>
  z
    .array(s.nullish().catch(null))
    .catch([])
    .transform((xs) => xs.filter((x): x is z.infer<T> => x != null));

export const DiagnosticoIA = z.object({
  fortalezas: lista(
    z.object({ texto: z.string(), frenteA: z.string().catch(""), paraQuien: z.string().catch(""), evidencias: ids, declaradoEnWeb: z.boolean().catch(false) }),
  ),
  debilidades: lista(z.object({ texto: z.string(), porQueImporta: z.string().catch(""), evidencias: ids, declaradoEnWeb: z.boolean().catch(false) })),
  riesgos: lista(z.object({ texto: z.string(), evidencias: ids })),
  fricciones: lista(z.object({ tipo: z.string(), texto: z.string(), evidencias: ids })),
  lineas: lista(z.object({ nombre: z.string(), checks: Checks, evidenciasChecks: ids })),
  integrado: z.string().catch(""),
});

// ---------- Prompt ----------

/** Extractos de los competidores verificados (ids c<n>-e<k>), dentro del delimitador y escapados. */
function bloqueCompetidores(competencia: Pick<Competencia, "competidores"> | null, reg: Map<string, Evidence>): string {
  const verificados = (competencia?.competidores ?? []).filter((c) => c.verificado);
  if (verificados.length === 0) return "";
  const partes: string[] = ["Competidores verificados:"];
  for (const c of verificados) {
    partes.push(`[${c.id}] ${c.nombre} — ${c.web ?? ""}${c.ficha?.propuesta ? ` · propuesta: ${c.ficha.propuesta.texto}` : ""}`);
    let usado = 0;
    for (const e of reg.values()) {
      if (!e.id.startsWith(`${c.id}-e`)) continue;
      const l = `${e.id}: ${JSON.stringify(e.texto)}`;
      if (usado + l.length > MAX_CHARS_COMPETIDOR) break;
      usado += l.length;
      partes.push(l);
    }
  }
  return `\n<<<DATOS_WEB\n${escapeAngles(partes.join("\n"))}\nDATOS_WEB>>>\n`;
}

function prompt(raw: RawData, anatomia: Anatomia, competencia: Pick<Competencia, "competidores"> | null, reg: Map<string, Evidence>, conPrecios: boolean): string {
  const tiposFriccion = TIPOS_FRICCION.filter((t) => conPrecios || t !== "precio").join(" | ");
  return `Eres un consultor de estrategia. Haz el diagnóstico estratégico del negocio analizado: fortalezas, debilidades, riesgos y fricciones del cliente, y un diagnóstico integrado.

${resumenAnatomia(anatomia)}
${bloqueCompetidores(competencia, reg)}
Devuelve SOLO un JSON con esta forma:
{
  "fortalezas": [ { "texto": string, "frenteA": string, "paraQuien": string, "evidencias": string[], "declaradoEnWeb": boolean } ],
  "debilidades": [ { "texto": string, "porQueImporta": string, "evidencias": string[], "declaradoEnWeb": boolean } ],
  "riesgos": [ { "texto": string, "evidencias": string[] } ],
  "fricciones": [ { "tipo": ${tiposFriccion}, "texto": string, "evidencias": string[] } ],
  "lineas": [ { "nombre": string, "checks": { "propuestaClara": "si"|"no"|"no_aplica", "diceAQuien": "si"|"no"|"no_aplica", "muestraCasos": "si"|"no"|"no_aplica", "facilContacto": "si"|"no"|"no_aplica", "orientacionPrecio": "si"|"no"|"no_aplica" }, "evidenciasChecks": string[] } ],
  "integrado": string
}

Reglas:
${REGLAS_COMUNES}
- "fortalezas" (2 a 5): cada una dice en "frenteA" frente a qué alternativa lo es (el id o el nombre de un competidor de la lista, u otra alternativa concreta, como "hacerlo a mano") y en "paraQuien" para qué cliente. Cita al menos un id válido (también puedes citar extractos c<n>-e<k> de los competidores).
- "debilidades" (1 a 5): qué se observó en la web y "porQueImporta" al cliente. Cada una cita al menos un extracto de la web analizada (ids p<n>-e<k>); si no, se descarta. Nunca afirmes malas ventas, pocos clientes ni abandono.
- "riesgos" (1 a 4): dependencia de un canal o plataforma, concentración, presión competitiva, falta de diferenciación… Son hipótesis: dilo así. Cada uno cita al menos un id.
- "fricciones" (0 a 6): lo que puede frenar a un cliente (no se entiende qué se compra, para quién es${conPrecios ? ", el precio" : ""}, demasiados pasos, objeciones sin resolver, poca confianza). Son potenciales, no medidas. Cada una cita al menos un id.${conPrecios ? "" : "\n- Este negocio no necesita publicar precios: no propongas fricciones de precio."}
- "declaradoEnWeb": true solo si lo afirmado se ve tal cual en un extracto de la web analizada.
- "lineas": una entrada por línea de negocio, con "nombre" igual al de la lista. Los checks solo cuentan si "evidenciasChecks" incluye un extracto de página (ids tipo p1-e1).
- "integrado": un párrafo que une los cuatro bloques y propone la prioridad. Sin cifras.

${bloqueDatosWeb(raw)}`;
}

// ---------- Fricciones de código ----------

function friccionesDeCodigo(raw: RawData, conPrecios: boolean): Omit<Friccion, "id">[] {
  const out: Omit<Friccion, "id">[] = [];
  const legible = !!raw.site && raw.site.textLength >= TEXTO_LEGIBLE;
  if (conPrecios && legible && raw.site!.pricesFound.length === 0 && preciosPublicados(raw).length === 0) {
    out.push({ tipo: "precio", texto: "No se ve ningún precio en la web: quien la visita puede no saber cuánto cuesta.", evidencias: [], potencial: true });
  }
  const lg = raw.legal;
  if (lg && legible && !lg.email && !lg.telefono && !lg.direccion) {
    out.push({ tipo: "confianza", texto: "No se encontró un correo, teléfono ni dirección de contacto visibles.", evidencias: [], potencial: true });
  }
  return out;
}

const esTipoFriccion = (s: string): s is TipoFriccion => (TIPOS_FRICCION as readonly string[]).includes(s);
/** Extracto de la web analizada (no de un competidor). */
const esPaginaPropia = (e: Evidence) => e.tipo === "pagina" && /^p\d/.test(e.id);
const texto = (s: string, descriptivo = false) => limpiar(quitarIdsEvidencia(s ?? ""), { descriptivo });

/**
 * Diagnóstico estratégico. Recibe el registro unido (web + competidores): una fortaleza puede
 * apoyarse en un competidor. Ids estables y secuenciales (f1, d1, r1, x1) para enlazar oportunidades.
 */
export async function generarDiagnostico(
  raw: RawData,
  anatomia: Anatomia,
  competencia: Pick<Competencia, "competidores"> | null,
  regTotal: Map<string, Evidence>,
  deps: SectionDeps,
): Promise<Diagnostico> {
  const conPrecios = aplicaPrecios(
    anatomia.tipologias.map((t) => t.tipo),
    anatomia.lineas,
  );
  const ia = await runSection("diagnostico", prompt(raw, anatomia, competencia, regTotal, conPrecios), DiagnosticoIA, deps.models, deps.runOpts);

  // Extractos que la empresa usa para presumir: una fortaleza que solo se apoya en ellos no es "observado".
  const idsAfirmacion = new Set(anatomia.afirmaciones.flatMap((a) => a.evidencias.map((e) => e.id)));

  const fortalezas: Fortaleza[] = [];
  for (const f of ia.fortalezas) {
    const ev = citar(f.evidencias, regTotal);
    const t = texto(f.texto, true);
    const frenteA = f.frenteA.trim();
    if (!ev || !t || !frenteA) continue;
    const autoelogio = ev.every((e) => idsAfirmacion.has(e.id));
    fortalezas.push({
      id: `f${fortalezas.length + 1}`,
      texto: t,
      frenteA,
      paraQuien: f.paraQuien.trim(),
      evidencias: ev,
      clase: claseDeAfirmacion(ev, { declaradoEnWeb: f.declaradoEnWeb && !autoelogio }),
    });
    if (fortalezas.length >= MAX_FORTALEZAS) break;
  }

  const debilidades: Debilidad[] = [];
  for (const d of ia.debilidades) {
    const ev = citar(d.evidencias, regTotal);
    const t = texto(d.texto);
    if (!ev || !ev.some(esPaginaPropia) || !t) continue;
    debilidades.push({
      id: `d${debilidades.length + 1}`,
      texto: t,
      porQueImporta: texto(d.porQueImporta),
      evidencias: ev,
      clase: claseDeAfirmacion(ev, { declaradoEnWeb: d.declaradoEnWeb }),
    });
    if (debilidades.length >= MAX_DEBILIDADES) break;
  }

  const riesgos: Riesgo[] = [];
  for (const r of ia.riesgos) {
    const ev = citar(r.evidencias, regTotal);
    const t = texto(r.texto);
    if (!ev || !t) continue;
    riesgos.push({ id: `r${riesgos.length + 1}`, texto: t, evidencias: ev, clase: "hipotesis" });
    if (riesgos.length >= MAX_RIESGOS) break;
  }

  const candidatas: Omit<Friccion, "id">[] = [];
  for (const x of ia.fricciones) {
    const tipo = x.tipo.trim().toLowerCase();
    const ev = citar(x.evidencias, regTotal);
    const t = texto(x.texto);
    if (!esTipoFriccion(tipo) || !ev || !t) continue;
    candidatas.push({ tipo, texto: t, evidencias: ev, potencial: true });
  }
  for (const c of friccionesDeCodigo(raw, conPrecios)) if (!candidatas.some((x) => x.tipo === c.tipo)) candidatas.push(c);
  const fricciones: Friccion[] = candidatas
    // El precio no es una fricción cuando el tipo de negocio no publica precios.
    .filter((x) => conPrecios || x.tipo !== "precio")
    .slice(0, MAX_FRICCIONES)
    .map((x, i) => ({ id: `x${i + 1}`, ...x }));

  const unica = anatomia.lineas.length === 1 ? anatomia.lineas[0].nombre : null;
  const nombres = new Map(anatomia.lineas.map((l) => [l.nombre.trim().toLowerCase(), l.nombre]));
  const comprobaciones: LineaComprobada[] = [];
  const vistas = new Set<string>();
  for (const l of ia.lineas) {
    const nombre = unica ?? nombres.get(l.nombre.trim().toLowerCase());
    if (!nombre || vistas.has(nombre)) continue;
    vistas.add(nombre);
    const conPagina = citar(l.evidenciasChecks, regTotal, { requierePagina: true });
    comprobaciones.push(
      conPagina && conPagina.some(esPaginaPropia)
        ? { nombre, checks: l.checks, evidenciasChecks: conPagina }
        : { nombre, checks: { ...NO_APLICA }, evidenciasChecks: citar(l.evidenciasChecks, regTotal) ?? [] },
    );
  }

  if (fortalezas.length + debilidades.length + riesgos.length + fricciones.length === 0) throw new SeccionVaciaError("diagnostico");

  const integrado = texto(ia.integrado) || integradoDeCodigo(fortalezas, debilidades, riesgos, fricciones);
  return { fortalezas, debilidades, riesgos, fricciones, integrado: { texto: integrado }, comprobaciones };
}

/** Respaldo por código cuando el párrafo de la IA no pasa el filtro. */
function integradoDeCodigo(f: Fortaleza[], d: Debilidad[], r: Riesgo[], x: Friccion[]): string {
  const partes: string[] = [];
  if (f[0]) partes.push(`Su principal fortaleza: ${f[0].texto.replace(/\.$/, "")}.`);
  if (d[0]) partes.push(`Su principal debilidad: ${d[0].texto.replace(/\.$/, "")}.`);
  if (x[0]) partes.push(`Hay fricciones potenciales para el cliente, como: ${x[0].texto.replace(/\.$/, "")}.`);
  if (r[0]) partes.push(`Riesgo a validar: ${r[0].texto.replace(/\.$/, "")}.`);
  const prioridad = d[0] ? "resolver primero la debilidad principal" : x[0] ? "reducir primero las fricciones" : "apoyarse en la fortaleza principal";
  partes.push(`Prioridad propuesta: ${prioridad}.`);
  return partes.join(" ");
}
