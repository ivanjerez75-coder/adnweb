import { z } from "zod";
import type { RawData } from "../../types";
import { citar, type Evidence } from "../evidence";
import { SeccionVaciaError } from "../errors";
import { runSection, type SectionDeps } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import { limpiarAfirmacionesNoRespaldadas } from "../filtro";
import { claseDeAfirmacion, type ClaseDato, type Tipologia } from "../clases";

// ---------- Tipos compartidos (canales, bloques, estado del modelo) ----------

export const TIPOS_CANAL = ["prueba_gratuita", "demo", "contacto", "suscripcion", "compra", "registro", "presupuesto"] as const;
export type TipoCanal = (typeof TIPOS_CANAL)[number];
export const MODELO_ESTADOS = ["confirmado", "probable", "desconocido"] as const;
export type ModeloEstado = (typeof MODELO_ESTADOS)[number];
export const NIVELES_MONETIZACION = ["confirmado", "inferido", "desconocido"] as const;
export type NivelMonetizacion = (typeof NIVELES_MONETIZACION)[number];
export const CERTEZAS = ["alta", "media", "baja"] as const;
export type Certeza = (typeof CERTEZAS)[number];

export const TIPOLOGIAS: readonly Tipologia[] = [
  "saas",
  "ecommerce",
  "marketplace",
  "servicio_profesional",
  "contenido",
  "freemium",
  "app",
  "organizacion_social",
  "negocio_local",
  "web_informativa",
];

const esTipoCanal = (s: string): s is TipoCanal => (TIPOS_CANAL as readonly string[]).includes(s);
const esTipologia = (s: string): s is Tipologia => (TIPOLOGIAS as readonly string[]).includes(s);

export interface AdnBloque {
  texto: string;
  evidencias: Evidence[];
}
export interface AdnCanal {
  tipo: TipoCanal;
  evidencias: Evidence[];
}

// ---------- Anatomía del negocio ----------

export interface CampoIdentidad {
  /** Lo que la empresa dice en su web: exige un extracto de página. */
  declara: AdnBloque | null;
  /** Lo que ADNweb interpreta: nunca "observado". */
  interpretamos: (AdnBloque & { clase: ClaseDato }) | null;
}
export const CAMPOS_IDENTIDAD = ["producto", "problema", "paraQuien", "beneficio", "argumento", "diferenciacion"] as const;
export type ClaveIdentidad = (typeof CAMPOS_IDENTIDAD)[number];

export interface TipologiaAnatomia {
  tipo: Tipologia;
  certeza: Certeza;
  explicacion: string;
  evidencias: Evidence[];
}
export interface LineaAnatomia {
  nombre: string;
  queOfrece: string[];
  publico: string;
  comoSeContrata: string;
  evidencias: Evidence[];
}
export interface FuenteMonetizacion {
  fuente: string;
  /** Decidido por código: "confirmado" exige página y (precio publicado o canal de contratación). */
  nivel: NivelMonetizacion;
  evidencias: Evidence[];
  /** Solo precios que aparecen publicados (dato:precio:* o un extracto citado). */
  precios?: string[];
}
export interface ClienteAnatomia {
  explicito: AdnBloque | null;
  necesidades: string[];
  sectores: string[];
  mensaje: AdnBloque | null;
  segmentosAlternativos: { texto: string; clase: "hipotesis" }[];
}
export interface Anatomia {
  nombre: string;
  /** ≤ 45 palabras: qué ofrece, a quién y cómo parece ganar dinero. */
  fraseResumen: AdnBloque;
  identidad: Record<ClaveIdentidad, CampoIdentidad>;
  /** De 1 a 3; sin evidencia se descartan y, si no queda ninguna, "web_informativa" con certeza baja. */
  tipologias: TipologiaAnatomia[];
  lineas: LineaAnatomia[];
  monetizacion: FuenteMonetizacion[];
  cliente: ClienteAnatomia;
  /** Canales de conversión; con al menos un extracto de página (o el respaldo de contacto). */
  canales: AdnCanal[];
  /** Lo que la empresa dice de sí misma ("La empresa afirma…"); nunca un hecho comprobado. */
  afirmaciones: AdnBloque[];
  /** Calculado en código: la IA propone, pero "confirmado" exige respaldo en la web. */
  modeloEstado: ModeloEstado;
}

const ids = z.array(z.string()).default([]);
const bloque = z.object({ texto: z.string(), evidencias: ids });
const bloqueOpc = bloque.nullish().catch(null);
const textos = (max: number) =>
  z
    .array(z.string())
    .catch([])
    .transform((xs) => xs.slice(0, max));
const VACIO = { declara: null, interpretamos: null };
const campo = z.object({ declara: bloqueOpc, interpretamos: bloqueOpc }).catch(VACIO);

export const AnatomiaIA = z.object({
  nombre: z.string().catch(""),
  fraseResumen: bloqueOpc,
  identidad: z
    .object(Object.fromEntries(CAMPOS_IDENTIDAD.map((k) => [k, campo])) as Record<ClaveIdentidad, typeof campo>)
    .catch(Object.fromEntries(CAMPOS_IDENTIDAD.map((k) => [k, VACIO])) as Record<ClaveIdentidad, typeof VACIO>),
  tipologias: z
    .array(
      z.object({
        tipo: z.string(),
        certeza: z.enum(CERTEZAS).catch("baja"),
        explicacion: z.string().catch(""),
        evidencias: ids,
      }),
    )
    .catch([]),
  lineas: z
    .array(
      z.object({
        nombre: z.string(),
        queOfrece: z.array(z.string()).catch([]),
        publico: z.string().catch(""),
        comoSeContrata: z.string().catch(""),
        evidencias: ids,
      }),
    )
    .min(1)
    .transform((ls) => ls.slice(0, 6)), // más de 6: se recorta en vez de gastar otro intento de IA
  monetizacion: z
    .array(
      z.object({
        fuente: z.string(),
        // Un valor raro no tumba la sección: el nivel final lo decide el código.
        nivel: z.enum(NIVELES_MONETIZACION).catch("desconocido"),
        evidencias: ids.catch([]),
        precios: z.array(z.string()).optional().catch(undefined),
      }),
    )
    .catch([])
    .transform((xs) => xs.slice(0, 8)),
  cliente: z
    .object({
      explicito: bloqueOpc,
      necesidades: textos(6),
      sectores: textos(6),
      mensaje: bloqueOpc,
      segmentosAlternativos: textos(5),
    })
    .catch({ explicito: null, necesidades: [], sectores: [], mensaje: null, segmentosAlternativos: [] }),
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
export type AnatomiaIA = z.infer<typeof AnatomiaIA>;

const lista = <T extends string>(xs: readonly T[]) => xs.map((t) => `"${t}"`).join(" | ");

function promptAnatomia(raw: RawData): string {
  const campoJson = `{ "declara": { "texto": string, "evidencias": string[] } | null, "interpretamos": { "texto": string, "evidencias": string[] } | null }`;
  return `Eres un analista de negocios. Describe la anatomía del negocio de la web analizada: qué ofrece, a quién, cómo se contrata y cómo parece ganar dinero.

Devuelve SOLO un JSON con esta forma:
{
  "nombre": string,
  "fraseResumen": { "texto": string, "evidencias": string[] },
  "identidad": {
${CAMPOS_IDENTIDAD.map((k) => `    "${k}": ${campoJson}`).join(",\n")}
  },
  "tipologias": [ { "tipo": ${lista(TIPOLOGIAS)}, "certeza": "alta" | "media" | "baja", "explicacion": string, "evidencias": string[] } ],
  "lineas": [ { "nombre": string, "queOfrece": string[], "publico": string, "comoSeContrata": string, "evidencias": string[] } ],
  "monetizacion": [ { "fuente": string, "nivel": "confirmado" | "inferido" | "desconocido", "evidencias": string[], "precios": string[] } ],
  "cliente": {
    "explicito": { "texto": string, "evidencias": string[] } | null,
    "necesidades": string[],
    "sectores": string[],
    "mensaje": { "texto": string, "evidencias": string[] } | null,
    "segmentosAlternativos": string[]
  },
  "modeloEstado": "confirmado" | "probable" | "desconocido",
  "canales": [ { "tipo": ${lista(TIPOS_CANAL)}, "evidencias": string[] } ],
  "afirmaciones": [ { "texto": string, "evidencias": string[] } ]
}

Reglas:
${REGLAS_COMUNES}
- Nunca inventes cifras: ni precios, ni clientes, ni ingresos, ni volúmenes. Un precio solo aparece si está publicado en los datos, copiado tal cual.
- "fraseResumen": una sola frase sencilla de 45 palabras como máximo que diga qué ofrece, a quién y cómo parece ganar dinero. Sin cifras.
- "identidad": para cada punto (producto o servicio, problema que resuelve, para quién, beneficio prometido, argumento de venta, diferenciación declarada) separa:
  - "declara": lo que la empresa dice literalmente en su web. Debe citar al menos un extracto de página (ids tipo p1-e1); si no, se descarta.
  - "interpretamos": lo que tú, como analista, deduces (por ejemplo "parece orientada a pymes porque…"). Es una interpretación, no un hecho.
  Si no hay nada que decir de un punto, usa null en ambos.
- "tipologias": de 1 a 3 tipologías; un negocio puede ser varias a la vez (por ejemplo SaaS y marketplace). Cada una lleva su "certeza", una "explicacion" breve de por qué y evidencias; las que no citen ids válidos se descartan.
- "lineas": de 1 a 6 líneas de negocio reales. Cada elemento debe citar en "evidencias" al menos un id válido; los que no lo hagan se descartan.
- "monetizacion": cada fuente de ingresos (por ejemplo "cuota mensual", "venta de productos", "honorarios por proyecto", "subvenciones"), sin cifras, con su nivel:
  - "confirmado": hay un precio, plan o forma de contratar publicada. Cita el extracto de página Y el id del precio publicado (dato:precio:N) o el mismo extracto que citas para el canal de contratación. El sistema lo revisa y puede rebajarlo a "inferido".
  - "inferido": se deduce de la web, pero falta confirmación.
  - "desconocido": no se puede saber.
  "precios": solo los precios publicados que respaldan esa fuente, copiados tal cual; si no hay, [].
- "cliente": el público explícito que la web nombra ("explicito"), sus necesidades, los sectores prioritarios y el mensaje comercial principal ("mensaje", citando un extracto de página). "segmentosAlternativos": segmentos que merece la pena investigar; son hipótesis por validar, nunca hechos.
- Lo que la empresa dice de sí misma ("más de 60 años", "líderes", número de clientes) va solo en "afirmaciones", nunca en la identidad, la frase resumen ni las líneas.
- "modeloEstado": "confirmado" solo si la web explica cómo se contrata Y muestra un precio o un canal claro; "probable" si se deduce pero no está explícito; "desconocido" si no se puede saber. El sistema lo revisa y puede rebajarlo.
- "canales": las vías reales para convertirse en cliente que ves en la web. Un formulario de contacto, un teléfono o un correo de contacto visibles en la web cuentan como canal "contacto" (si no hay otra vía, inclúyelo). Cada canal cita al menos un extracto de página (ids tipo p1-e1); si no, se descarta.
- "afirmaciones": frases en las que la empresa se atribuye méritos, cifras o clientes (por ejemplo "líderes del sector"). Cada una cita al menos un extracto de página. Se mostrarán como "La empresa afirma…", nunca como hechos.

${bloqueDatosWeb(raw)}`;
}

// ---------- Canales (respaldo de contacto v3.1) ----------

const RUTA_CONTACTO = /(?:^|\/)(?:contacto|contact|contacta|contacte|contato|kontakt)(?:[-_.\/]|$)/i;

/**
 * Si la IA no devuelve canales: una página leída cuya ruta es de contacto (con su primer extracto),
 * o, si no, el correo/teléfono publicados en el aviso legal (dato:contacto).
 */
function canalContactoDeRespaldo(raw: RawData, reg: Map<string, Evidence>): AdnCanal | null {
  for (const pg of raw.paginas ?? []) {
    let ruta: string;
    try {
      ruta = new URL(pg.url).pathname;
    } catch {
      continue;
    }
    if (!RUTA_CONTACTO.test(ruta) || pg.extractos.length === 0) continue;
    const ev = citar([pg.extractos[0].id], reg, { requierePagina: true });
    if (ev) return { tipo: "contacto", evidencias: ev };
  }
  if (raw.legal?.email || raw.legal?.telefono) {
    const ev = citar(["dato:contacto"], reg);
    if (ev) return { tipo: "contacto", evidencias: ev };
  }
  return null;
}

function resolverCanales(ia: AnatomiaIA["canales"], raw: RawData, reg: Map<string, Evidence>): AdnCanal[] {
  const canales: AdnCanal[] = [];
  for (const c of ia) {
    const tipo = c.tipo.trim().toLowerCase();
    const ev = citar(c.evidencias, reg, { requierePagina: true });
    if (esTipoCanal(tipo) && ev) canales.push({ tipo, evidencias: ev });
  }
  if (canales.length === 0) {
    const respaldo = canalContactoDeRespaldo(raw, reg);
    if (respaldo) canales.push(respaldo);
  }
  return canales;
}

function resolverAfirmaciones(ia: AnatomiaIA["afirmaciones"], reg: Map<string, Evidence>): AdnBloque[] {
  // Sin filtro de cifras: son autoafirmaciones atribuidas ("La empresa afirma…"), ancladas a un extracto literal.
  const out: AdnBloque[] = [];
  for (const a of ia) {
    const texto = a.texto.trim();
    const ev = citar(a.evidencias, reg, { requierePagina: true });
    if (texto && ev) out.push({ texto, evidencias: ev });
  }
  return out;
}

// ---------- Resolución con evidencias y filtro ----------

type Reg = Map<string, Evidence>;
type BloqueIA = { texto: string; evidencias: string[] } | null | undefined;

/** Bloque con evidencias válidas y texto filtrado; null si no queda texto o evidencia. */
function resolver(b: BloqueIA, reg: Reg, opts: { requierePagina?: boolean; descriptivo?: boolean } = {}): AdnBloque | null {
  if (!b) return null;
  const texto = limpiarAfirmacionesNoRespaldadas(b.texto, { descriptivo: opts.descriptivo });
  const ev = citar(b.evidencias, reg, { requierePagina: opts.requierePagina });
  return ev && texto ? { texto, evidencias: ev } : null;
}

const filtrarTextos = (xs: string[], descriptivo = true): string[] =>
  xs.map((x) => limpiarAfirmacionesNoRespaldadas(x, { descriptivo })).filter((x) => x !== "");

const MAX_PALABRAS_RESUMEN = 45;
function recortarPalabras(texto: string, max: number): string {
  const palabras = texto.split(/\s+/).filter(Boolean);
  return palabras.length <= max ? texto : `${palabras.slice(0, max).join(" ")}…`;
}

function resolverIdentidad(ia: AnatomiaIA["identidad"], reg: Reg): Record<ClaveIdentidad, CampoIdentidad> {
  const out = {} as Record<ClaveIdentidad, CampoIdentidad>;
  for (const k of CAMPOS_IDENTIDAD) {
    const c = ia[k] ?? VACIO;
    const declara = resolver(c.declara, reg, { requierePagina: true, descriptivo: true });
    const interp = resolver(c.interpretamos, reg, { descriptivo: true });
    // Una interpretación nunca es "observado": no se pasa declaradoEnWeb.
    out[k] = { declara, interpretamos: interp ? { ...interp, clase: claseDeAfirmacion(interp.evidencias) } : null };
  }
  return out;
}

const MAX_TIPOLOGIAS = 3;
function resolverTipologias(ia: AnatomiaIA["tipologias"], reg: Reg): TipologiaAnatomia[] {
  const out: TipologiaAnatomia[] = [];
  for (const t of ia) {
    const tipo = t.tipo.trim().toLowerCase();
    if (!esTipologia(tipo) || out.some((x) => x.tipo === tipo)) continue;
    const ev = citar(t.evidencias, reg);
    if (!ev) continue;
    out.push({ tipo, certeza: t.certeza, explicacion: limpiarAfirmacionesNoRespaldadas(t.explicacion, { descriptivo: true }), evidencias: ev });
    if (out.length === MAX_TIPOLOGIAS) break;
  }
  if (out.length > 0) return out;
  return [
    {
      tipo: "web_informativa",
      certeza: "baja",
      explicacion: "No hay evidencia suficiente para clasificar el modelo de negocio: se trata como una web informativa.",
      evidencias: [],
    },
  ];
}

function resolverLineas(ia: AnatomiaIA["lineas"], reg: Reg): LineaAnatomia[] {
  const out: LineaAnatomia[] = [];
  for (const l of ia) {
    const ev = citar(l.evidencias, reg);
    const nombre = limpiarAfirmacionesNoRespaldadas(l.nombre, { descriptivo: true });
    if (!ev || !nombre) continue;
    out.push({
      nombre,
      queOfrece: filtrarTextos(l.queOfrece),
      publico: limpiarAfirmacionesNoRespaldadas(l.publico, { descriptivo: true }),
      comoSeContrata: limpiarAfirmacionesNoRespaldadas(l.comoSeContrata, { descriptivo: true }),
      evidencias: ev,
    });
  }
  return out;
}

const normalizar = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Precios que la IA menciona y que aparecen publicados: en un dato:precio:* o en un extracto citado. */
function preciosPublicadosCitados(precios: string[] | undefined, ev: Evidence[], reg: Reg): string[] {
  if (!precios) return [];
  const fuentes = [...[...reg.values()].filter((e) => e.id.startsWith("dato:precio:")), ...ev.filter((e) => e.tipo === "pagina")].map((e) =>
    normalizar(e.texto),
  );
  return precios.map((p) => p.trim()).filter((p) => p !== "" && fuentes.some((f) => f.includes(normalizar(p))));
}

/**
 * Regla de código: "confirmado" solo si sus evidencias incluyen un extracto de página y, además,
 * un precio publicado (dato:precio:*) o un extracto que respalda un canal de contratación.
 * Si no, baja a "inferido". Sin evidencia válida → "desconocido".
 */
function resolverMonetizacion(ia: AnatomiaIA["monetizacion"], canales: AdnCanal[], reg: Reg): FuenteMonetizacion[] {
  const idsCanal = new Set(canales.flatMap((c) => c.evidencias.filter((e) => e.tipo === "pagina").map((e) => e.id)));
  const out: FuenteMonetizacion[] = [];
  for (const m of ia) {
    const fuente = limpiarAfirmacionesNoRespaldadas(m.fuente, { descriptivo: true });
    if (!fuente) continue;
    const ev = citar(m.evidencias, reg);
    if (!ev) {
      out.push({ fuente, nivel: "desconocido", evidencias: [] });
      continue;
    }
    let nivel = m.nivel;
    if (nivel === "confirmado") {
      const conPagina = ev.some((e) => e.tipo === "pagina");
      const conPrecio = ev.some((e) => e.id.startsWith("dato:precio:"));
      const conCanal = ev.some((e) => idsCanal.has(e.id));
      if (!(conPagina && (conPrecio || conCanal))) nivel = "inferido";
    }
    const precios = preciosPublicadosCitados(m.precios, ev, reg);
    out.push(precios.length > 0 ? { fuente, nivel, evidencias: ev, precios } : { fuente, nivel, evidencias: ev });
  }
  return out;
}

function resolverCliente(ia: AnatomiaIA["cliente"], reg: Reg): ClienteAnatomia {
  return {
    explicito: resolver(ia.explicito, reg, { descriptivo: true }),
    necesidades: filtrarTextos(ia.necesidades),
    sectores: filtrarTextos(ia.sectores),
    mensaje: resolver(ia.mensaje, reg, { requierePagina: true, descriptivo: true }),
    // Siempre hipótesis; filtro estricto (sin cifras de mercado ni promesas).
    segmentosAlternativos: filtrarTextos(ia.segmentosAlternativos, false).map((texto) => ({ texto, clase: "hipotesis" as const })),
  };
}

function resolverFraseResumen(ia: BloqueIA, lineas: LineaAnatomia[], reg: Reg): AdnBloque {
  const b = resolver(ia, reg);
  if (b) return { texto: recortarPalabras(b.texto, MAX_PALABRAS_RESUMEN), evidencias: b.evidencias };
  // Respaldo de código: la primera línea con evidencia (siempre existe al llegar aquí).
  const l = lineas[0];
  const oferta = l.queOfrece.length > 0 ? `: ${l.queOfrece.join(", ")}` : "";
  const publico = l.publico ? ` Para ${l.publico}.` : "";
  return { texto: recortarPalabras(`${l.nombre}${oferta}.${publico}`, MAX_PALABRAS_RESUMEN), evidencias: l.evidencias };
}

function nombreNegocio(ia: string, raw: RawData): string {
  const n = ia.trim();
  return n || raw.site?.companyName?.trim() || raw.site?.jsonLdOrg?.name?.trim() || raw.domain;
}

/**
 * Regla de código: "confirmado" solo con una línea cuyo "cómo se contrata" cita un extracto de página
 * Y (un precio publicado o un canal con evidencia de página). Si no, baja a "probable";
 * "desconocido" de la IA se respeta.
 */
function calcularModeloEstado(propuesto: ModeloEstado, lineas: LineaAnatomia[], canales: AdnCanal[], reg: Reg): ModeloEstado {
  if (propuesto === "desconocido") return "desconocido";
  const contrataConPagina = lineas.some((l) => l.comoSeContrata.trim() !== "" && l.evidencias.some((e) => e.tipo === "pagina"));
  const hayPrecio = [...reg.keys()].some((k) => k.startsWith("dato:precio:"));
  const hayCanal = canales.some((c) => c.evidencias.some((e) => e.tipo === "pagina"));
  return propuesto === "confirmado" && contrataConPagina && (hayPrecio || hayCanal) ? "confirmado" : "probable";
}

/** Sección 02 del informe v4. Es la única fatal: sin ninguna línea con evidencia, SeccionVaciaError. */
export async function generarAnatomia(raw: RawData, reg: Reg, deps: SectionDeps): Promise<Anatomia> {
  const ia = await runSection("anatomia", promptAnatomia(raw), AnatomiaIA, deps.models, deps.runOpts);
  const lineas = resolverLineas(ia.lineas, reg);
  if (lineas.length === 0) throw new SeccionVaciaError("anatomia");
  const canales = resolverCanales(ia.canales, raw, reg);
  return {
    nombre: nombreNegocio(ia.nombre, raw),
    fraseResumen: resolverFraseResumen(ia.fraseResumen, lineas, reg),
    identidad: resolverIdentidad(ia.identidad, reg),
    tipologias: resolverTipologias(ia.tipologias, reg),
    lineas,
    monetizacion: resolverMonetizacion(ia.monetizacion, canales, reg),
    cliente: resolverCliente(ia.cliente, reg),
    canales,
    afirmaciones: resolverAfirmaciones(ia.afirmaciones, reg),
    modeloEstado: calcularModeloEstado(ia.modeloEstado, lineas, canales, reg),
  };
}
