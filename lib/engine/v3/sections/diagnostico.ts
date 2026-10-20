import { z } from "zod";
import type { RawData } from "../../types";
import { escapeAngles } from "../../ai/prompt";
import { citar, type Evidence } from "../evidence";
import { SeccionVaciaError } from "../errors";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import { contieneImporte, limpiarAfirmacionesNoRespaldadas as limpiar } from "../filtro";
import { aplicaPrecios, claseDeAfirmacion, type ClaseDato } from "../clases";
import { preciosPublicados } from "../estimates";
import type { Anatomia } from "./anatomia";
import type { Competencia } from "./competencia";
import type { Nivel, Prioridad } from "./oportunidades";
import { FOCO_TIPOLOGIA } from "../datos-clave";
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

/** Formato estándar de hallazgo (§11): título, estado, por qué importa, qué hacer y prioridad. */
export type EstadoHallazgo = "comprobado" | "por_comprobar";
export interface FormatoHallazgo {
  /** Como mucho 8 palabras. */
  titulo: string;
  porQueImporta: string;
  /** Siguiente paso concreto, sin fechas, presupuestos ni cifras. */
  queHacer: string;
  /** Decidido por código: "comprobado" exige clase observado o fuente_externa y un extracto de página. */
  estado: EstadoHallazgo;
  /** Los tres filtros de §11.3: los da la IA. */
  relevancia: Nivel;
  fiabilidad: Nivel;
  utilidad: Nivel;
  /** Calculada por código: alto=3, medio=2, bajo=1; ≥ 8 alta, ≥ 6 media, si no baja. */
  prioridad: Prioridad;
}

export interface Fortaleza extends FormatoHallazgo {
  id: string;
  texto: string;
  /** Frente a qué alternativa lo es: un competidor (id o nombre) u otra alternativa. */
  frenteA: string;
  paraQuien: string;
  evidencias: Evidence[];
  clase: ClaseDato;
}
export interface Debilidad extends FormatoHallazgo {
  id: string;
  texto: string;
  evidencias: Evidence[];
  clase: ClaseDato;
}
export interface Riesgo extends FormatoHallazgo {
  id: string;
  texto: string;
  evidencias: Evidence[];
  clase: "hipotesis";
}
export interface Friccion extends FormatoHallazgo {
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

const MAX_PALABRAS_TITULO = 8;

// ---------- Prioridad y estado (código) ----------

const PUNTOS_NIVEL: Record<Nivel, number> = { bajo: 1, medio: 2, alto: 3 };
const PESO_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };
type Filtros = { relevancia: Nivel; fiabilidad: Nivel; utilidad: Nivel };

/** Suma de los tres filtros (alto=3, medio=2, bajo=1): ≥ 8 alta, ≥ 6 media, si no baja. */
export function prioridadHallazgo(c: Filtros): { puntos: number; prioridad: Prioridad } {
  const puntos = PUNTOS_NIVEL[c.relevancia] + PUNTOS_NIVEL[c.fiabilidad] + PUNTOS_NIVEL[c.utilidad];
  return { puntos, prioridad: puntos >= 8 ? "alta" : puntos >= 6 ? "media" : "baja" };
}

/** ¿Supera los tres filtros (todos al menos "medio")? Solo esos pueden ir al resumen. */
export const superaFiltros = (c: Filtros) => c.relevancia !== "bajo" && c.fiabilidad !== "bajo" && c.utilidad !== "bajo";

/**
 * Estado del hallazgo: "comprobado" solo si la clase es observado o fuente_externa y cita al menos
 * un extracto de página. Riesgos y fricciones son siempre "por_comprobar".
 */
export function estadoHallazgo(
  tipo: "fortaleza" | "debilidad" | "riesgo" | "friccion",
  clase: ClaseDato | null,
  evidencias: Evidence[],
): EstadoHallazgo {
  if (tipo === "riesgo" || tipo === "friccion") return "por_comprobar";
  const claseOk = clase === "observado" || clase === "fuente_externa";
  return claseOk && evidencias.some((e) => e.tipo === "pagina") ? "comprobado" : "por_comprobar";
}

/** Ordena por prioridad y, a igualdad, por puntos; estable. */
export function ordenarPorPrioridad<T extends Filtros & { prioridad: Prioridad }>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, i, puntos: prioridadHallazgo(x).puntos }))
    .sort((a, b) => PESO_PRIORIDAD[a.x.prioridad] - PESO_PRIORIDAD[b.x.prioridad] || b.puntos - a.puntos || a.i - b.i)
    .map((y) => y.x);
}

// ---------- Esquema de la IA ----------

const ids = z.array(z.string()).catch([]);
const lista = <T extends z.ZodTypeAny>(s: T) =>
  z
    .array(s.nullish().catch(null))
    .catch([])
    .transform((xs) => xs.filter((x): x is z.infer<T> => x != null));

const nivel = z.enum(["alto", "medio", "bajo"]).catch("bajo");
/** Campos del formato estándar; si faltan, nivel "bajo" (no pasa al resumen). */
const formato = {
  titulo: z.string().catch(""),
  porQueImporta: z.string().catch(""),
  queHacer: z.string().catch(""),
  relevancia: nivel,
  fiabilidad: nivel,
  utilidad: nivel,
};

export const DiagnosticoIA = z.object({
  fortalezas: lista(
    z.object({
      texto: z.string(),
      frenteA: z.string().catch(""),
      paraQuien: z.string().catch(""),
      evidencias: ids,
      declaradoEnWeb: z.boolean().catch(false),
      ...formato,
    }),
  ),
  debilidades: lista(z.object({ texto: z.string(), evidencias: ids, declaradoEnWeb: z.boolean().catch(false), ...formato })),
  riesgos: lista(z.object({ texto: z.string(), evidencias: ids, ...formato })),
  fricciones: lista(z.object({ tipo: z.string(), texto: z.string(), evidencias: ids, ...formato })),
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
  const foco = anatomia.tipologias.map((t) => `- ${t.tipo}: ${FOCO_TIPOLOGIA[t.tipo]}`).join("\n");
  const f = `"titulo": string, "porQueImporta": string, "queHacer": string, "relevancia": "alto"|"medio"|"bajo", "fiabilidad": "alto"|"medio"|"bajo", "utilidad": "alto"|"medio"|"bajo"`;
  return `Eres un consultor de estrategia. Haz el diagnóstico estratégico del negocio analizado: fortalezas, debilidades, riesgos y fricciones del cliente, y un diagnóstico integrado.

${resumenAnatomia(anatomia)}
${bloqueCompetidores(competencia, reg)}
Devuelve SOLO un JSON con esta forma:
{
  "fortalezas": [ { "texto": string, "frenteA": string, "paraQuien": string, "evidencias": string[], "declaradoEnWeb": boolean, ${f} } ],
  "debilidades": [ { "texto": string, "evidencias": string[], "declaradoEnWeb": boolean, ${f} } ],
  "riesgos": [ { "texto": string, "evidencias": string[], ${f} } ],
  "fricciones": [ { "tipo": ${tiposFriccion}, "texto": string, "evidencias": string[], ${f} } ],
  "lineas": [ { "nombre": string, "checks": { "propuestaClara": "si"|"no"|"no_aplica", "diceAQuien": "si"|"no"|"no_aplica", "muestraCasos": "si"|"no"|"no_aplica", "facilContacto": "si"|"no"|"no_aplica", "orientacionPrecio": "si"|"no"|"no_aplica" }, "evidenciasChecks": string[] } ],
  "integrado": string
}

Reglas:
${REGLAS_COMUNES}
- "fortalezas" (2 a 5): cada una dice en "frenteA" frente a qué alternativa lo es (el id o el nombre de un competidor de la lista, u otra alternativa concreta, como "hacerlo a mano") y en "paraQuien" para qué cliente. Cita al menos un id válido (también puedes citar extractos c<n>-e<k> de los competidores).
- "debilidades" (1 a 5): qué se observó en la web y por qué importa al cliente. Cada una cita al menos un extracto de la web analizada (ids p<n>-e<k>); si no, se descarta. Nunca afirmes malas ventas, pocos clientes ni abandono.
- "riesgos" (1 a 4): dependencia de un canal o plataforma, concentración, presión competitiva, falta de diferenciación… Son hipótesis: dilo así. Cada uno cita al menos un id.
- "fricciones" (0 a 6): lo que puede frenar a un cliente (no se entiende qué se compra, para quién es${conPrecios ? ", el precio" : ""}, demasiados pasos, objeciones sin resolver, poca confianza). Son potenciales, no medidas. Cada una cita al menos un id.${conPrecios ? "" : "\n- Este negocio no necesita publicar precios: no propongas fricciones de precio."}
- Formato de cada fortaleza, debilidad, riesgo y fricción: "titulo" de 8 palabras como mucho; "texto" es el hallazgo; "porQueImporta" explica por qué le importa al negocio o a su cliente; "queHacer" es el siguiente paso concreto (comprobar, cambiar o medir algo), sin fechas, presupuestos ni cifras.
- Prioriza con tres filtros, cada uno "alto", "medio" o "bajo": "relevancia" (responde a una pregunta importante para este tipo de negocio), "fiabilidad" (alto si se ve tal cual en la web; bajo si es una hipótesis) y "utilidad" (ayuda a comparar, entender, decidir o actuar). La prioridad no la eliges tú: la calcula el sistema.
- Una diferencia menor de diseño (colores, tipografía, estética) nunca es un hallazgo principal: relevancia "bajo". Un problema técnico crítico (la web no carga, falla en móvil, errores graves, sin HTTPS) sí lo es: relevancia "alto".
- Céntrate en lo que importa para este tipo de negocio:
${foco || "- (tipología desconocida)"}
- No repitas el mismo hallazgo en dos bloques.
- "declaradoEnWeb": true solo si lo afirmado se ve tal cual en un extracto de la web analizada.
- "lineas": una entrada por línea de negocio, con "nombre" igual al de la lista. Los checks solo cuentan si "evidenciasChecks" incluye un extracto de página (ids tipo p1-e1).
- "integrado": un párrafo que une los cuatro bloques y propone la prioridad. Sin cifras.

${bloqueDatosWeb(raw)}`;
}

// ---------- Fricciones de código ----------

type SinId<T> = Omit<T, "id">;
type FiltrosIA = { titulo: string; porQueImporta: string; queHacer: string; relevancia: Nivel; fiabilidad: Nivel; utilidad: Nivel };

/** Fricciones que detecta el código; nivel medio en los tres filtros (prioridad media), sin evidencia citable. */
function friccionesDeCodigo(raw: RawData, conPrecios: boolean): SinId<Friccion>[] {
  const out: SinId<Friccion>[] = [];
  const legible = !!raw.site && raw.site.textLength >= TEXTO_LEGIBLE;
  const medio = { relevancia: "medio", fiabilidad: "medio", utilidad: "medio", prioridad: "media", estado: "por_comprobar" } as const;
  if (conPrecios && legible && raw.site!.pricesFound.length === 0 && preciosPublicados(raw).length === 0) {
    out.push({
      tipo: "precio",
      titulo: "No se ve ningún precio",
      texto: "No se ve ningún precio en la web: quien la visita puede no saber cuánto cuesta.",
      porQueImporta: "Sin una orientación de precio, el cliente no sabe si encaja en su presupuesto antes de contactar.",
      queHacer: "Comprobar si conviene publicar precios orientativos o un «desde» por servicio.",
      evidencias: [],
      potencial: true,
      ...medio,
    });
  }
  const lg = raw.legal;
  if (lg && legible && !lg.email && !lg.telefono && !lg.direccion) {
    out.push({
      tipo: "confianza",
      titulo: "Sin datos de contacto visibles",
      texto: "No se encontró un correo, teléfono ni dirección de contacto visibles.",
      porQueImporta: "Un cliente que no encuentra cómo contactar desconfía o se va.",
      queHacer: "Publicar un correo o teléfono de contacto en el pie de todas las páginas.",
      evidencias: [],
      potencial: true,
      ...medio,
    });
  }
  return out;
}

const esTipoFriccion = (s: string): s is TipoFriccion => (TIPOS_FRICCION as readonly string[]).includes(s);
/** Extracto de la web analizada (no de un competidor). */
const esPaginaPropia = (e: Evidence) => e.tipo === "pagina" && /^p\d/.test(e.id);
/** Respaldo de la propia web: un extracto p* o un dato dato:* (nunca solo un extracto de competidor). */
const esRespaldoPropio = (e: Evidence) => esPaginaPropia(e) || e.id.startsWith("dato:");
const texto = (s: string, descriptivo = false) => limpiar(quitarIdsEvidencia(s ?? ""), { descriptivo });

const MESES = /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|semana|semanas|trimestre|presupuesto de)\b/i;
/** "Qué hacer": pasa el filtro y, además, quita cada frase con cifras, fechas o presupuestos. */
function queHacer(s: string): string {
  return texto(s)
    .split(/(?<=[.!?;])\s+/)
    .filter((f) => f && !/\d/.test(f) && !MESES.test(f) && !contieneImporte(f))
    .join(" ")
    .trim();
}

/** Título de 8 palabras como mucho; si la IA no lo da (o no pasa el filtro), sale del texto. */
function titulo(propuesto: string, textoHallazgo: string): string {
  const base = texto(propuesto, true) || textoHallazgo;
  const palabras = base.replace(/[.:;,!?]+$/, "").split(/\s+/).filter(Boolean);
  return palabras.slice(0, MAX_PALABRAS_TITULO).join(" ").replace(/[.:;,]+$/, "");
}

/** Campos del formato estándar con el estado y la prioridad decididos por código. */
function formatoDe(ia: FiltrosIA, textoHallazgo: string, estado: EstadoHallazgo): FormatoHallazgo {
  // Lo que no está comprobado no puede tener fiabilidad alta.
  const fiabilidad: Nivel = estado === "por_comprobar" && ia.fiabilidad === "alto" ? "medio" : ia.fiabilidad;
  const filtros = { relevancia: ia.relevancia, fiabilidad, utilidad: ia.utilidad };
  return {
    titulo: titulo(ia.titulo, textoHallazgo),
    porQueImporta: texto(ia.porQueImporta),
    queHacer: queHacer(ia.queHacer),
    estado,
    ...filtros,
    prioridad: prioridadHallazgo(filtros).prioridad,
  };
}

/** Ordena por prioridad y numera (f1, d1…): el id más bajo es el más prioritario. */
const numerar = <T extends FormatoHallazgo>(xs: T[], prefijo: string, max: number): (T & { id: string })[] =>
  ordenarPorPrioridad(xs)
    .slice(0, max)
    .map((x, i) => ({ id: `${prefijo}${i + 1}`, ...x }));

/**
 * Diagnóstico estratégico. Recibe el registro unido (web + competidores): una fortaleza puede
 * apoyarse en un competidor. Cada bloque va ordenado por prioridad, con ids secuenciales (f1, d1,
 * r1, x1) para enlazar oportunidades.
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

  const candFortalezas: SinId<Fortaleza>[] = [];
  for (const f of ia.fortalezas) {
    const ev = citar(f.evidencias, regTotal);
    const t = texto(f.texto, true);
    const frenteA = texto(f.frenteA, true);
    if (!ev || !t || !frenteA || !ev.some(esRespaldoPropio)) continue;
    const autoelogio = ev.every((e) => idsAfirmacion.has(e.id));
    const clase = claseDeAfirmacion(ev, { declaradoEnWeb: f.declaradoEnWeb && !autoelogio });
    candFortalezas.push({ texto: t, frenteA, paraQuien: texto(f.paraQuien, true), evidencias: ev, clase, ...formatoDe(f, t, estadoHallazgo("fortaleza", clase, ev)) });
  }

  const candDebilidades: SinId<Debilidad>[] = [];
  for (const d of ia.debilidades) {
    const ev = citar(d.evidencias, regTotal);
    const t = texto(d.texto);
    if (!ev || !ev.some(esPaginaPropia) || !t) continue;
    const clase = claseDeAfirmacion(ev, { declaradoEnWeb: d.declaradoEnWeb });
    candDebilidades.push({ texto: t, evidencias: ev, clase, ...formatoDe(d, t, estadoHallazgo("debilidad", clase, ev)) });
  }

  const candRiesgos: SinId<Riesgo>[] = [];
  for (const r of ia.riesgos) {
    const ev = citar(r.evidencias, regTotal);
    const t = texto(r.texto);
    if (!ev || !t) continue;
    candRiesgos.push({ texto: t, evidencias: ev, clase: "hipotesis", ...formatoDe(r, t, "por_comprobar") });
  }

  const candFricciones: SinId<Friccion>[] = [];
  for (const x of ia.fricciones) {
    const tipo = x.tipo.trim().toLowerCase();
    const ev = citar(x.evidencias, regTotal);
    const t = texto(x.texto);
    if (!esTipoFriccion(tipo) || !ev || !t) continue;
    candFricciones.push({ tipo, texto: t, evidencias: ev, potencial: true, ...formatoDe(x, t, "por_comprobar") });
  }
  for (const c of friccionesDeCodigo(raw, conPrecios)) if (!candFricciones.some((x) => x.tipo === c.tipo)) candFricciones.push(c);

  const fortalezas = numerar(candFortalezas, "f", MAX_FORTALEZAS);
  const debilidades = numerar(candDebilidades, "d", MAX_DEBILIDADES);
  const riesgos = numerar(candRiesgos, "r", MAX_RIESGOS);
  // El precio no es una fricción cuando el tipo de negocio no publica precios.
  const fricciones = numerar(
    candFricciones.filter((x) => conPrecios || x.tipo !== "precio"),
    "x",
    MAX_FRICCIONES,
  );

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
