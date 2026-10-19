import type { ClaseDato } from "@/lib/engine/v3/clases";
import type { Evidence } from "@/lib/engine/v3/evidence";
import type { Metrica } from "@/lib/engine/v3/estimates";
import type { Competencia } from "@/lib/engine/v3/sections/competencia";
import type { Debilidad, Diagnostico, Fortaleza, Friccion, Riesgo } from "@/lib/engine/v3/sections/diagnostico";
import type { Oportunidad } from "@/lib/engine/v3/sections/oportunidades";
import type { Accion, GrupoPlan, Plan } from "@/lib/engine/v3/sections/plan";
import type { Anatomia, CampoIdentidad } from "@/lib/engine/v3/sections/anatomia";
import type { Clave } from "@/lib/i18n";

/** Ayudas puras de la página del informe v4: sin React, para poder probarlas. */

export function arr<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

/** Solo se enlazan URLs http(s): el contenido viene de webs ajenas. */
export function esHttp(u: string | null | undefined): u is string {
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

// ---------- Clases de dato ----------

export type TonoClase = "observado" | "externa" | "inferencia" | "hipotesis";

const CLASES: Record<ClaseDato, { clave: Clave; tono: TonoClase }> = {
  observado: { clave: "comun.etObservado", tono: "observado" },
  fuente_externa: { clave: "comun.etExterna", tono: "externa" },
  inferencia: { clave: "comun.etInferencia", tono: "inferencia" },
  hipotesis: { clave: "comun.etHipotesis", tono: "hipotesis" },
};

/** Texto (clave i18n) y tono de `Etiqueta` para una clase de dato; null si no es una de las cuatro. */
export function etiquetaClase(clase: unknown): { clave: Clave; tono: TonoClase } | null {
  return typeof clase === "string" && Object.prototype.hasOwnProperty.call(CLASES, clase) ? CLASES[clase as ClaseDato] : null;
}

// ---------- Filtros (bloque Hallazgos) ----------

export const FILTROS = ["todo", "fortalezas", "debilidades", "riesgos", "fricciones"] as const;
export type Filtro = (typeof FILTROS)[number];

const PREFIJO_FILTRO = "filtro=";

/** Lee el filtro del hash de la URL ("#filtro=riesgos"); cualquier otra cosa es "todo". */
export function filtroDesdeHash(hash: string): Filtro {
  const h = hash.replace(/^#/, "");
  if (!h.startsWith(PREFIJO_FILTRO)) return "todo";
  let f = "";
  try {
    f = decodeURIComponent(h.slice(PREFIJO_FILTRO.length));
  } catch {
    return "todo";
  }
  return (FILTROS as readonly string[]).includes(f) ? (f as Filtro) : "todo";
}

/** Hash que guarda el filtro; "" para "todo" (la URL queda limpia). */
export function hashDeFiltro(f: Filtro): string {
  return f === "todo" ? "" : `#${PREFIJO_FILTRO}${f}`;
}

export interface HallazgosVisibles {
  fortalezas: Fortaleza[];
  debilidades: Debilidad[];
  riesgos: Riesgo[];
  fricciones: Friccion[];
}

/** Qué bloques del diagnóstico se ven con un filtro. Nunca cambia ni recorta los textos. */
export function filtrarHallazgos(diagnostico: Partial<Diagnostico> | null | undefined, filtro: Filtro): HallazgosVisibles {
  const d = diagnostico ?? {};
  const todo: HallazgosVisibles = {
    fortalezas: arr<Fortaleza>(d.fortalezas),
    debilidades: arr<Debilidad>(d.debilidades),
    riesgos: arr<Riesgo>(d.riesgos),
    fricciones: arr<Friccion>(d.fricciones),
  };
  if (filtro === "todo") return todo;
  const vacio: HallazgosVisibles = { fortalezas: [], debilidades: [], riesgos: [], fricciones: [] };
  return { ...vacio, [filtro]: todo[filtro] };
}

// ---------- Tarjeta estándar de hallazgo ----------

export type TipoTarjeta = "fortaleza" | "debilidad" | "riesgo" | "friccion";
export type EstadoTarjeta = "comprobado" | "por_comprobar";

/** Campos opcionales que añadirá el motor; hoy pueden faltar. */
interface CamposNuevos {
  titulo?: unknown;
  queHacer?: unknown;
  porQueImporta?: unknown;
  estado?: unknown;
}

export interface TarjetaHallazgo {
  id: string;
  tipo: TipoTarjeta;
  titulo: string;
  texto: string;
  estado: EstadoTarjeta;
  clase: ClaseDato | null;
  evidencias: Evidence[];
  porQueImporta: string | null;
  /** Lo que propone el motor, o las tareas del plan que salen de este hallazgo. */
  queHacer: string[];
  /** Solo fortalezas: frente a qué alternativa y para quién. */
  frenteA?: string;
  paraQuien?: string;
  /** Solo fricciones: el tipo de fricción. */
  tipoFriccion?: string;
}

const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);

/** Primera frase de un texto (hasta ". ", "? " o "! "); el texto entero si no hay otra. */
export function primeraFrase(s: string): string {
  const m = /^([\s\S]+?[.!?])(\s|$)/.exec(s.trim());
  return m ? m[1] : s.trim();
}

const GRUPOS: readonly GrupoPlan[] = ["comprobar", "experimentar", "medir"];

/** Todas las acciones del plan, en orden Comprobar → Experimentar → Medir. */
export function accionesPlan(plan: Partial<Plan> | null | undefined): (Accion & { grupo: GrupoPlan })[] {
  const p = plan ?? {};
  return GRUPOS.flatMap((g) => arr<Accion>(p[g]).filter((a) => a && typeof a === "object").map((a) => ({ ...a, grupo: g })));
}

function tarjeta(
  x: { id: string; texto: string; evidencias?: Evidence[]; clase?: unknown } & CamposNuevos,
  tipo: TipoTarjeta,
  acciones: Accion[],
): TarjetaHallazgo {
  const clase = etiquetaClase(x.clase) ? (x.clase as ClaseDato) : null;
  const estado: EstadoTarjeta =
    x.estado === "comprobado" || x.estado === "por_comprobar" ? x.estado : clase === "observado" ? "comprobado" : "por_comprobar";
  const propio = texto(x.queHacer);
  const delPlan = acciones
    .filter((a) => a.origen === x.id)
    .map((a) => texto(a.tarea))
    .filter((s): s is string => s !== null);
  return {
    id: x.id,
    tipo,
    titulo: texto(x.titulo) ?? primeraFrase(x.texto ?? ""),
    texto: x.texto ?? "",
    estado,
    clase,
    evidencias: arr<Evidence>(x.evidencias),
    porQueImporta: texto(x.porQueImporta),
    queHacer: propio ? [propio] : delPlan,
  };
}

/** Tarjetas de hallazgo (formato único) a partir de los bloques visibles del diagnóstico. */
export function tarjetasHallazgos(visibles: HallazgosVisibles, plan: Partial<Plan> | null | undefined): TarjetaHallazgo[] {
  const acciones = accionesPlan(plan);
  return [
    ...visibles.fortalezas.map((f) => ({
      ...tarjeta(f, "fortaleza", acciones),
      frenteA: texto(f.frenteA) ?? undefined,
      paraQuien: texto(f.paraQuien) ?? undefined,
    })),
    ...visibles.debilidades.map((d) => tarjeta(d, "debilidad", acciones)),
    ...visibles.riesgos.map((r) => tarjeta(r, "riesgo", acciones)),
    ...visibles.fricciones.map((x) => ({ ...tarjeta(x, "friccion", acciones), tipoFriccion: texto(x.tipo) ?? undefined })),
  ];
}

// ---------- Oportunidades ----------

const PESO_PRIORIDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 };

/** Oportunidades por prioridad (alta → baja); a igualdad, en su orden original. */
export function ordenarOportunidades(oportunidades: unknown): Oportunidad[] {
  return arr<Oportunidad>(oportunidades)
    .filter((o) => o && typeof o === "object")
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (PESO_PRIORIDAD[a.o.prioridad] ?? 3) - (PESO_PRIORIDAD[b.o.prioridad] ?? 3) || a.i - b.i)
    .map((x) => x.o);
}

/** "Cómo validarlo": las acciones del plan que salen de una oportunidad, agrupadas en orden. */
export function accionesDeOportunidad(plan: Partial<Plan> | null | undefined, id: string): { grupo: GrupoPlan; acciones: Accion[] }[] {
  const todas = accionesPlan(plan).filter((a) => a.origen === id);
  return GRUPOS.map((grupo) => ({ grupo, acciones: todas.filter((a) => a.grupo === grupo) })).filter((g) => g.acciones.length > 0);
}

// ---------- Bloque 1: el negocio ----------

/** Dos o más tipologías con certeza alta o media: se marca como negocio híbrido. */
export function esNegocioHibrido(tipologias: unknown): boolean {
  return arr<{ certeza?: string }>(tipologias).filter((x) => x?.certeza === "alta" || x?.certeza === "media").length >= 2;
}

export interface HechoNegocio {
  clave: "queOfrece" | "paraQuien" | "propuesta";
  texto: string | null;
  /** Lo que la empresa declara (observado) o lo que interpreta ADNweb. */
  clase: ClaseDato | null;
  evidencias: Evidence[];
}

/** Un campo de identidad: primero lo que la empresa declara; si no, lo que interpreta ADNweb. */
function campoIdentidad(c: Partial<CampoIdentidad> | null | undefined): Omit<HechoNegocio, "clave"> {
  if (c?.declara && texto(c.declara.texto)) return { texto: c.declara.texto, clase: "observado", evidencias: arr<Evidence>(c.declara.evidencias) };
  if (c?.interpretamos && texto(c.interpretamos.texto)) {
    const clase: ClaseDato = etiquetaClase(c.interpretamos.clase) ? c.interpretamos.clase : "inferencia";
    return { texto: c.interpretamos.texto, clase, evidencias: arr<Evidence>(c.interpretamos.evidencias) };
  }
  return { texto: null, clase: null, evidencias: [] };
}

/** Los hechos clave del bloque 1 (la monetización va aparte, con sus niveles). */
export function hechosNegocio(anatomia: Partial<Anatomia> | null | undefined): HechoNegocio[] {
  const id = (anatomia?.identidad ?? {}) as Partial<Record<string, CampoIdentidad>>;
  const propuesta = campoIdentidad(id.beneficio);
  return [
    { clave: "queOfrece", ...campoIdentidad(id.producto) },
    { clave: "paraQuien", ...campoIdentidad(id.paraQuien) },
    { clave: "propuesta", ...(propuesta.texto ? propuesta : campoIdentidad(id.diferenciacion)) },
  ];
}

// ---------- Bloque 2: datos clave ----------

/** Dato clave del bloque 2. El motor lo rellenará en `resumen.datosClave`; hoy se construye aquí. */
export interface DatoClave {
  clave: string;
  etiqueta: string;
  valor: string;
  detalle?: string;
  clase: ClaseDato;
  fuente?: string;
  fuenteUrl?: string;
  evidencias?: Evidence[];
}

function esDatoClave(x: unknown): x is DatoClave {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return typeof d.clave === "string" && typeof d.etiqueta === "string" && typeof d.valor === "string" && !!etiquetaClase(d.clase);
}

interface PrecioVista {
  texto?: string;
  plan?: string | null;
  url?: string;
}

/**
 * Los datos clave: `resumen.datosClave` si viene; si no, los indicadores del resumen (o las métricas
 * disponibles) más los precios publicados. Nunca el escenario hipotético.
 */
export function datosClave(resumen: unknown, datos: unknown): DatoClave[] {
  const r = (resumen ?? {}) as { datosClave?: unknown; indicadores?: unknown };
  const propios = arr<unknown>(r.datosClave).filter(esDatoClave);
  if (propios.length > 0) return propios;

  const d = (datos ?? {}) as { metricas?: unknown; precios?: unknown };
  const disponibles = (xs: Metrica[]) => xs.filter((m) => m && m.estado === "disponible" && m.tipo !== "hipotesis");
  const base = Array.isArray(r.indicadores) ? disponibles(arr<Metrica>(r.indicadores)) : disponibles(arr<Metrica>(d.metricas)).slice(0, 4);
  const metricas = base
    .map((m): DatoClave | null => {
      const valor = valorMetrica(m);
      if (!valor) return null;
      const dato: DatoClave = { clave: m.clave, etiqueta: m.etiqueta, valor, clase: m.tipo, fuente: m.fuente };
      if (esHttp(m.fuenteUrl)) dato.fuenteUrl = m.fuenteUrl;
      if (texto(m.periodo)) dato.detalle = m.periodo;
      return dato;
    })
    .filter((x): x is DatoClave => x !== null);
  const precios = arr<PrecioVista>(d.precios)
    .filter((p) => p && texto(p.texto))
    .map((p, i): DatoClave => {
      const dato: DatoClave = { clave: `precio-${i}`, etiqueta: texto(p.plan) ?? "", valor: p.texto as string, clase: "observado" };
      if (esHttp(p.url)) {
        dato.fuente = p.url;
        dato.fuenteUrl = p.url;
      }
      return dato;
    });
  return [...metricas, ...precios];
}

/** Etiquetas de las métricas sin datos fiables (se dicen en una línea, nunca como cifra). */
export function sinDatosFiables(datos: unknown): string[] {
  const d = (datos ?? {}) as { metricas?: unknown };
  return arr<Metrica>(d.metricas)
    .filter((m) => m && (m.estado === "insuficiente" || m.estado === "error") && m.tipo !== "hipotesis")
    .map((m) => m.etiqueta)
    .filter((s): s is string => texto(s) !== null);
}

// ---------- Enlaces de origen ----------

export const anclaHallazgo = (id: string) => `hallazgo-${id}`;
export const anclaComparacion = (dimension: string) => `comparacion-${dimension}`;
export const anclaOportunidad = (id: string) => `oportunidad-${id}`;
export const ANCLA_MATRIZ = "matriz-comparativa";

/**
 * Ancla de la página a la que lleva un id de origen, o null si no existe:
 * - f*, d*, r*, x*: el hallazgo del diagnóstico;
 * - "gp:<dimensión>": la fila de "dónde gana y dónde pierde" (o la matriz, si solo está ahí);
 * - o*: la oportunidad (lo usan las acciones del plan).
 */
export function resolverOrigen(
  id: string,
  diagnostico: Partial<Diagnostico> | null | undefined,
  competencia: Partial<Competencia> | null | undefined,
  oportunidades?: unknown,
): string | null {
  if (typeof id !== "string" || !id) return null;
  if (id.startsWith("gp:")) {
    const dim = id.slice(3);
    if (arr<{ dimension: string }>(competencia?.ganaPierde).some((g) => g.dimension === dim)) return anclaComparacion(dim);
    if (arr<string>(competencia?.matriz?.dimensiones).includes(dim)) return ANCLA_MATRIZ;
    return null;
  }
  const d = diagnostico ?? {};
  const grupos: Record<string, unknown> = { f: d.fortalezas, d: d.debilidades, r: d.riesgos, x: d.fricciones };
  const grupo = grupos[id[0]];
  if (grupo !== undefined) return arr<{ id: string }>(grupo).some((x) => x.id === id) ? anclaHallazgo(id) : null;
  if (id[0] === "o") return arr<{ id: string }>(oportunidades).some((o) => o.id === id) ? anclaOportunidad(id) : null;
  return null;
}

/** Texto corto del origen para el enlace ("Debilidad d1", "Comparación: precio"…), como clave i18n y sufijo. */
export function tipoOrigen(id: string): Clave | null {
  if (id.startsWith("gp:")) return "informe.competencia.ganaPierde";
  const tipos: Record<string, Clave> = {
    f: "informe.hallazgo.fortaleza",
    d: "informe.hallazgo.debilidad",
    r: "informe.hallazgo.riesgo",
    x: "informe.hallazgo.friccion",
    o: "informe.bloques.oportunidades",
  };
  return tipos[id[0]] ?? null;
}

// ---------- Frase del resumen ----------

/**
 * Trocea la frase "en 30 segundos" para destacar sus ideas clave sin cambiar ni una letra:
 * el nombre del negocio, lo que ofrece ("ofrece …" hasta " a " / " para " / ",") y cómo gana dinero
 * ("mediante …", "gracias a …", "a través de …" hasta el final de la frase). Si no encaja, va entera sin destacar.
 */
export function trozosFrase(texto: string, nombre?: string | null): { texto: string; destacado: boolean }[] {
  if (!texto) return [];
  const rangos: [number, number][] = [];
  const n = (nombre ?? "").trim();
  if (n.length >= 2) {
    const i = texto.toLowerCase().indexOf(n.toLowerCase());
    if (i >= 0) rangos.push([i, i + n.length]);
  }
  const oferta = /\b(?:ofrece|vende|ofrecen|venden|proporciona|comercializa)\s+(.+?)(?=\s+(?:a|para|con|en)\s|,|\.|$)/i.exec(texto);
  if (oferta) {
    const ini = oferta.index + oferta[0].length - oferta[1].length;
    rangos.push([ini, ini + oferta[1].length]);
  }
  const dinero = /\b(?:mediante|gracias a|a través de|cobrando|financiándose con)\s+(.+?)(?=\.?\s*$)/i.exec(texto);
  if (dinero) {
    const ini = dinero.index + dinero[0].length - dinero[1].length;
    rangos.push([ini, ini + dinero[1].length]);
  }
  rangos.sort((a, b) => a[0] - b[0]);
  const out: { texto: string; destacado: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of rangos) {
    if (a < pos) continue; // solapado: se queda el primero
    if (a > pos) out.push({ texto: texto.slice(pos, a), destacado: false });
    out.push({ texto: texto.slice(a, b), destacado: true });
    pos = b;
  }
  if (pos < texto.length) out.push({ texto: texto.slice(pos), destacado: false });
  return out;
}

// ---------- Métricas ----------

const num = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
export const formatoNumero = num;

/** Valor legible de una métrica, o null si no hay valor (se pinta "—" con su motivo). */
export function valorMetrica(m: Pick<Metrica, "valor" | "unidad">): string | null {
  const v = m.valor;
  if (v === null || v === undefined) return null;
  const u = m.unidad ? (m.unidad.startsWith("/") ? m.unidad : ` ${m.unidad}`) : "";
  if (typeof v === "number") return `${num(v)}${u}`;
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.min === "number" && typeof v.max === "number") return `${num(v.min)} – ${num(v.max)}${u}`;
  return null;
}

/** Valor grande de una tarjeta de indicador: la cifra sin unidad larga, y la unidad aparte. */
export function cifraIndicador(m: Pick<Metrica, "valor" | "unidad" | "estado">): { cifra: string; unidad: string } | null {
  if (m.estado !== "disponible") return null;
  const v = m.valor;
  if (typeof v === "number") return { cifra: num(v), unidad: m.unidad ?? "" };
  if (typeof v === "string" && v) return { cifra: v, unidad: m.unidad ?? "" };
  if (v && typeof v === "object" && typeof v.min === "number" && typeof v.max === "number") return { cifra: `${num(v.min)}–${num(v.max)}`, unidad: m.unidad ?? "" };
  return null;
}

/** Fecha corta en español ("19 oct 2026"); el texto original si no se puede leer. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
}
