import * as cheerio from "cheerio";
import { z } from "zod";
import type { RawData } from "../../types";
import { registrableDomain } from "../../redirect";
import type { FetchedPage, PageGetter } from "../../safe-fetch";
import type { JsonModel } from "../../ai/providers";
import { escapeAngles } from "../../ai/prompt";
import { resumenAnatomia } from "./comun";
import { extractPassages, extractPricePassages } from "../../sources/pages";
import { citar, type Evidence } from "../evidence";
import { preciosPublicados } from "../estimates";
import { runSection, type RunSectionOpts } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import { limpiarAfirmacionesNoRespaldadas } from "../filtro";
import type { Anatomia } from "./anatomia";

// ---------- Tipos ----------

export const TIPOS_COMPETIDOR = ["directo", "indirecto", "emergente"] as const;
export type TipoCompetidor = (typeof TIPOS_COMPETIDOR)[number];
export const DIMENSIONES = ["cliente", "propuesta", "precio", "funcionalidades", "diferenciacion", "oportunidad"] as const;
export type Dimension = (typeof DIMENSIONES)[number];

export const SIN_DATOS = "Sin datos";
export const PRECIO_DESCONOCIDO = "Desconocido";

export interface AfirmacionCompetidor {
  texto: string;
  evidencias: Evidence[];
}
export interface PrecioCompetidor {
  texto: string;
  /** Siempre un extracto `c<n>-e<k>` de la página de precios del competidor. */
  evidencia: Evidence;
}
export interface FichaCompetidor {
  publico: AfirmacionCompetidor | null;
  problema: AfirmacionCompetidor | null;
  propuesta: AfirmacionCompetidor | null;
  funcionalidades: string[];
  precios: PrecioCompetidor[] | "desconocido";
  fortalezas: AfirmacionCompetidor[];
  debilidades: AfirmacionCompetidor[];
}
export interface CompetidorV4 {
  /** "c1", "c2"…: prefijo de los ids de sus extractos. */
  id: string;
  nombre: string;
  web: string | null;
  /** Lo que ofrece, según la búsqueda (no comprobado). */
  descripcion: string;
  tipo: TipoCompetidor;
  motivo: string;
  verificado: boolean;
  /** ISO: cuándo se leyeron sus páginas. */
  comprobadoEn: string;
  /** URLs leídas (portada y, si se encontró, la página de precios). */
  fuentes: string[];
  /** null si no está verificado. */
  ficha: FichaCompetidor | null;
}
export interface FilaMatriz {
  quien: "analizada" | string;
  valores: Record<Dimension, string>;
  evidencias: Partial<Record<Dimension, Evidence[]>>;
}
export interface GanaPierde {
  dimension: Dimension;
  destaca: "analizada" | string | "empate" | "sin_datos";
  evidencia: Evidence[];
  porQueImporta: string;
  aprender: string;
  diferenciarse: string;
}
export interface Competencia {
  competidores: CompetidorV4[];
  matriz: { dimensiones: Dimension[]; filas: FilaMatriz[] };
  ganaPierde: GanaPierde[];
}
export interface CompetenciaDeps {
  searchModels: JsonModel[];
  models: JsonModel[];
  getPage: PageGetter;
  runOpts?: RunSectionOpts;
  /** Tiempo máximo por página (por defecto 8 s). */
  timeoutMs?: number;
  /** Tiempo máximo de toda la lectura de competidores (por defecto 2 × timeoutMs). */
  totalMs?: number;
  now?: () => Date;
}

// ---------- Utilidades de texto (verificación v3.1) ----------

const MAX_COMPETIDORES = 5;
const MIN_TERMINOS = 2;
const TIMEOUT_MS = 8000;
const MAX_TEXTO = 20_000;
const MIN_LARGO_TERMINO = 4; // términos muy cortos ("app", "web") coinciden con cualquier cosa
const MAX_EXTRACTOS_PORTADA = 15;
const MAX_EXTRACTOS_PRECIOS = 20;
const MAX_CHARS_COMPETIDOR = 3000;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** El término aparece como palabra (o frase) completa, no dentro de otra palabra. */
export const contienePalabra = (texto: string, termino: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(termino)}($|[^\\p{L}\\p{N}])`, "u").test(texto);

/** Minúsculas, sin acentos y con espacios colapsados. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const dominioDe = (u: string): string | null => {
  try {
    return registrableDomain(new URL(u).hostname);
  } catch {
    return null;
  }
};

function webValida(web: string | null, propio: string | null): string | null {
  if (!web) return null;
  try {
    const u = new URL(web.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (propio && registrableDomain(u.hostname) === propio) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const filtrar = (s: string) => limpiarAfirmacionesNoRespaldadas(s, { descriptivo: true });

// ---------- Página de precios ----------

const RUTA_PRECIOS = /(^|[/_\-.])(pricing|prices|precios?|planes|plans|tarifas?|preus)($|[/_\-.])/i;
const TEXTO_PRECIOS = /^(pricing|prices|precios?|planes|plans|tarifas?|preus|planes y precios|precios y planes)$/i;

/**
 * Página de precios del competidor: el primer enlace de su portada (mismo dominio) cuya ruta o
 * texto es pricing/precios/planes/tarifas/preus; si no hay ninguno, `/pricing`.
 */
export function encontrarPaginaPrecios(html: string, base: string): string | null {
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return null;
  }
  const dom = registrableDomain(baseUrl.hostname);
  const $ = cheerio.load(html);
  const porRuta: string[] = [];
  const porTexto: string[] = [];
  for (const a of $("a[href]").toArray()) {
    let u: URL;
    try {
      u = new URL($(a).attr("href") ?? "", baseUrl);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (registrableDomain(u.hostname) !== dom) continue;
    u.hash = "";
    if (u.pathname === "/" || u.toString() === baseUrl.toString()) continue;
    if (RUTA_PRECIOS.test(u.pathname)) porRuta.push(u.toString());
    else if (TEXTO_PRECIOS.test(normalizarTexto($(a).text()))) porTexto.push(u.toString());
  }
  return porRuta[0] ?? porTexto[0] ?? new URL("/pricing", baseUrl).toString();
}

// ---------- Lectura de páginas ----------

async function leer(url: string, getPage: PageGetter, timeoutMs: number): Promise<FetchedPage | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const p = await Promise.race([
      getPage(url),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error("timeout")), timeoutMs);
      }),
    ]);
    if (p.status < 200 || p.status >= 300) return null;
    return p;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface Lectura {
  home: { url: string; html: string } | null;
  precios: { url: string; html: string } | null;
}

async function leerCompetidor(web: string, getPage: PageGetter, timeoutMs: number, out: Lectura): Promise<void> {
  const h = await leer(web, getPage, timeoutMs);
  if (!h) return;
  const urlHome = h.url || web;
  if (dominioDe(urlHome) !== dominioDe(web)) return; // redirige a otro dominio: no es el competidor
  out.home = { url: urlHome, html: h.text };
  const urlPrecios = encontrarPaginaPrecios(h.text, urlHome);
  if (!urlPrecios) return;
  const p = await leer(urlPrecios, getPage, timeoutMs);
  if (!p) return;
  const urlFinal = p.url || urlPrecios;
  if (dominioDe(urlFinal) !== dominioDe(web)) return;
  out.precios = { url: urlFinal, html: p.text };
}

// ---------- Candidatos (búsqueda + respaldo) ----------

const CandidatoIA = z.object({
  nombre: z.string().min(1),
  web: z.string().nullable().default(null),
  ofrece: z.string().catch(""),
  tipo: z.enum(TIPOS_COMPETIDOR).catch("directo"),
  motivo: z.string().catch(""),
  terminos: z.array(z.string()).catch([]),
});
const CompetidoresIA = z.object({ competidores: z.array(CandidatoIA).min(1) });

function promptCandidatos(raw: RawData, a: Anatomia, conBusqueda: boolean): string {
  return `Eres un analista de mercado. Encuentra de 3 a 5 competidores reales del negocio analizado${
    conBusqueda ? " usando la búsqueda de Google" : ""
  }. No inventes empresas: si no estás seguro de que existen, no las incluyas.

${resumenAnatomia(a)}

Devuelve SOLO un JSON: { "competidores": [ { "nombre": string, "web": string (URL de su página principal), "ofrece": string (una frase), "tipo": "directo" | "indirecto" | "emergente", "motivo": string (por qué es relevante como competidor, una frase), "terminos": string[] (hasta 8 términos clave del servicio que deberían aparecer en su web: ponlos en el idioma de la web del competidor (por ejemplo catalán, inglés) y añade además sus equivalentes en español) } ] }

Reglas:
${REGLAS_COMUNES}
- "directo": ofrece lo mismo al mismo cliente. "indirecto": resuelve el mismo problema de otra forma. "emergente": alternativa nueva o en crecimiento.
- No incluyas el propio negocio analizado.

${bloqueDatosWeb(raw)}`;
}

async function obtenerCandidatos(raw: RawData, a: Anatomia, deps: CompetenciaDeps) {
  if (deps.searchModels.length > 0) {
    try {
      const r = await runSection("competencia", promptCandidatos(raw, a, true), CompetidoresIA, deps.searchModels, deps.runOpts);
      return r.competidores;
    } catch {
      // cae al modelo normal: la verificación con la portada se hace igual
    }
  }
  const r = await runSection("competencia", promptCandidatos(raw, a, false), CompetidoresIA, deps.models, deps.runOpts);
  return r.competidores;
}

// ---------- Fichas ----------

const ids = z.array(z.string()).catch([]);
const afirmacion = z.object({ texto: z.string(), evidencias: ids });
const afirmacionOpc = afirmacion.nullish().catch(null);
const lista = <T extends z.ZodTypeAny>(s: T) => z.array(s.nullish().catch(null)).catch([]).transform((xs) => xs.filter((x): x is z.infer<T> => x != null));

const FichasIA = z.object({
  fichas: lista(
    z.object({
      id: z.string(),
      publico: afirmacionOpc,
      problema: afirmacionOpc,
      propuesta: afirmacionOpc,
      funcionalidades: lista(afirmacion),
      precios: lista(z.object({ texto: z.string(), evidencia: z.string() })),
      fortalezas: lista(afirmacion),
      debilidades: lista(afirmacion),
    }),
  ),
});

interface Leido {
  c: CompetidorV4;
  /** Extractos propios del competidor (solo verificados). */
  reg: Map<string, Evidence>;
  /** Ids de extractos de la página de precios. */
  idsPrecios: Set<string>;
}

/** Extractos de los competidores dentro del delimitador, escapados. */
function bloqueCompetidores(leidos: Leido[]): string {
  const partes: string[] = [];
  for (const { c, reg, idsPrecios } of leidos) {
    partes.push(`[${c.id}] ${c.nombre} — ${c.web ?? ""}`);
    let usado = 0;
    for (const e of reg.values()) {
      const l = `${e.id}${idsPrecios.has(e.id) ? " (página de precios)" : ""}: ${JSON.stringify(e.texto)}`;
      if (usado + l.length > MAX_CHARS_COMPETIDOR) break;
      usado += l.length;
      partes.push(l);
    }
  }
  return `<<<DATOS_WEB\n${escapeAngles(["Páginas de los competidores:", ...partes].join("\n"))}\nDATOS_WEB>>>`;
}

function promptFichas(a: Anatomia, leidos: Leido[]): string {
  return `Eres un analista de mercado. Escribe la ficha de cada competidor usando SOLO los extractos de sus páginas (ids c<n>-e<k>).

${resumenAnatomia(a)}

Devuelve SOLO un JSON: { "fichas": [ { "id": "c1", "publico": { "texto": string, "evidencias": string[] } | null, "problema": { "texto": string, "evidencias": string[] } | null, "propuesta": { "texto": string, "evidencias": string[] } | null, "funcionalidades": [ { "texto": string, "evidencias": string[] } ], "precios": [ { "texto": string, "evidencia": string } ], "fortalezas": [ { "texto": string, "evidencias": string[] } ], "debilidades": [ { "texto": string, "evidencias": string[] } ] } ] }

Reglas:
${REGLAS_COMUNES}
- Cada competidor solo puede citar sus propios extractos (los de c1 empiezan por "c1-").
- "precios": solo importes que aparecen literalmente en un extracto marcado "(página de precios)", citando ese id en "evidencia". Si no hay, devuelve []. No deduzcas precios.
- "fortalezas": lo que el competidor demuestra en su web. "debilidades": carencias observables en sus páginas (por ejemplo, no publica precios). Nada que no se vea en los extractos.
- Si un campo no se puede respaldar con extractos, devuelve null o [].

${bloqueCompetidores(leidos)}`;
}

const NUMERO = /\d+(?:[.,]\d+)?/g;
const GRATIS = /gratis|gratuit|free/i;

/** El precio es literal: sus cifras (o "gratis") aparecen en el extracto citado. */
function precioRespaldado(texto: string, extracto: string): boolean {
  const nums = texto.match(NUMERO);
  if (nums) return nums.every((n) => extracto.includes(n));
  return GRATIS.test(texto) && GRATIS.test(extracto);
}

const afirmar = (x: { texto: string; evidencias: string[] } | null | undefined, reg: Map<string, Evidence>): AfirmacionCompetidor | null => {
  if (!x) return null;
  const ev = citar(x.evidencias, reg);
  const texto = filtrar(x.texto);
  return ev && texto ? { texto, evidencias: ev } : null;
};
const afirmarLista = (xs: { texto: string; evidencias: string[] }[], reg: Map<string, Evidence>, max: number) =>
  xs.map((x) => afirmar(x, reg)).filter((x): x is AfirmacionCompetidor => x !== null).slice(0, max);

const FICHA_VACIA = (): FichaCompetidor => ({
  publico: null,
  problema: null,
  propuesta: null,
  funcionalidades: [],
  precios: "desconocido",
  fortalezas: [],
  debilidades: [],
});

function resolverFicha(ia: z.infer<typeof FichasIA>["fichas"][number] | undefined, leido: Leido): FichaCompetidor {
  if (!ia) return FICHA_VACIA();
  const reg = leido.reg; // solo sus propios extractos
  const precios: PrecioCompetidor[] = [];
  for (const p of ia.precios) {
    const ev = reg.get(p.evidencia);
    const texto = p.texto.trim();
    if (!ev || !leido.idsPrecios.has(ev.id) || !texto || !precioRespaldado(texto, ev.texto)) continue;
    if (precios.some((x) => x.texto === texto)) continue;
    precios.push({ texto, evidencia: ev });
  }
  return {
    publico: afirmar(ia.publico, reg),
    problema: afirmar(ia.problema, reg),
    propuesta: afirmar(ia.propuesta, reg),
    funcionalidades: afirmarLista(ia.funcionalidades, reg, 8).map((f) => f.texto),
    precios: precios.length ? precios.slice(0, 6) : "desconocido",
    fortalezas: afirmarLista(ia.fortalezas, reg, 4),
    debilidades: afirmarLista(ia.debilidades, reg, 4),
  };
}

// ---------- Matriz y dónde gana / pierde ----------

const ValorIA = z.object({ texto: z.string(), evidencias: ids });
const ComparacionIA = z.object({
  filas: lista(z.object({ quien: z.string(), valores: z.record(z.string(), ValorIA.nullish().catch(null)).catch({}) })),
  ganaPierde: lista(
    z.object({
      dimension: z.string(),
      destaca: z.string(),
      evidencias: ids,
      porQueImporta: z.string().catch(""),
      aprender: z.string().catch(""),
      diferenciarse: z.string().catch(""),
    }),
  ),
});

function resumenFichas(leidos: Leido[]): string {
  return escapeAngles(
    leidos
      .map(({ c }) => {
        const f = c.ficha;
        const precio = !f || f.precios === "desconocido" ? PRECIO_DESCONOCIDO : f.precios.map((p) => p.texto).join(", ");
        return `- ${c.id} ${c.nombre} (${c.tipo}): propuesta: ${f?.propuesta?.texto ?? "?"}; público: ${f?.publico?.texto ?? "?"}; funcionalidades: ${f?.funcionalidades.join(", ") || "?"}; precio: ${precio}`;
      })
      .join("\n"),
  );
}

function promptComparacion(raw: RawData, a: Anatomia, leidos: Leido[]): string {
  const quienes = ["analizada", ...leidos.map((l) => l.c.id)].map((q) => `"${q}"`).join(", ");
  return `Eres un analista de mercado. Compara el negocio analizado ("analizada") con sus competidores verificados (${leidos.map((l) => l.c.id).join(", ")}).

${resumenAnatomia(a)}

Fichas de los competidores:
${resumenFichas(leidos)}

Devuelve SOLO un JSON: { "filas": [ { "quien": ${quienes}, "valores": { "cliente": { "texto": string, "evidencias": string[] }, "propuesta": {…}, "funcionalidades": {…}, "diferenciacion": {…}, "oportunidad": {…} } } ], "ganaPierde": [ { "dimension": "cliente" | "propuesta" | "precio" | "funcionalidades" | "diferenciacion" | "oportunidad", "destaca": ${quienes} o "empate", "evidencias": string[], "porQueImporta": string (por qué le importa al cliente), "aprender": string (qué puede aprender la empresa analizada), "diferenciarse": string (cómo diferenciarse sin copiar) } ] }

Reglas:
${REGLAS_COMUNES}
- Cada valor y cada punto de "ganaPierde" cita ids de los extractos: p<n>-e<k> o dato:* de la web analizada, c<n>-e<k> de los competidores. Lo que no tenga evidencia válida queda como "${SIN_DATOS}".
- El precio no lo escribas en "valores": se toma solo de los precios publicados.
- No afirmes cifras de clientes, ventas, conversión ni cuota de mercado.

${bloqueDatosWeb(raw)}

${bloqueCompetidores(leidos)}`;
}

const ES_COMPETIDOR = /^c\d+-e\d+$/;
const esDimension = (s: string): s is Dimension => (DIMENSIONES as readonly string[]).includes(s);

function precioAnalizada(raw: RawData): string {
  const p = preciosPublicados(raw);
  return p.length ? p.map((x) => x.texto).slice(0, 4).join(", ") : PRECIO_DESCONOCIDO;
}
function precioCompetidor(c: CompetidorV4): string {
  const f = c.ficha;
  return !f || f.precios === "desconocido" ? PRECIO_DESCONOCIDO : f.precios.map((p) => p.texto).join(", ");
}

function resolverComparacion(
  ia: z.infer<typeof ComparacionIA> | null,
  raw: RawData,
  leidos: Leido[],
  reg: Map<string, Evidence>,
): Pick<Competencia, "matriz" | "ganaPierde"> {
  const quienes = ["analizada", ...leidos.map((l) => l.c.id)];
  const regSitio = new Map([...reg].filter(([id]) => !ES_COMPETIDOR.test(id)));
  const regDe = (quien: string) => leidos.find((l) => l.c.id === quien)?.reg ?? regSitio;
  const filas: FilaMatriz[] = quienes.map((quien) => {
    const fIA = ia?.filas.find((f) => f.quien.trim() === quien);
    const valores = {} as Record<Dimension, string>;
    const evidencias: FilaMatriz["evidencias"] = {};
    for (const d of DIMENSIONES) {
      if (d === "precio") {
        const c = leidos.find((l) => l.c.id === quien)?.c;
        valores.precio = c ? precioCompetidor(c) : precioAnalizada(raw);
        continue;
      }
      const v = fIA?.valores[d];
      // Cada fila solo cita lo suyo: la analizada su web, cada competidor sus propios extractos.
      const ev = v ? citar(v.evidencias, regDe(quien)) : null;
      const texto = v && ev ? filtrar(v.texto) : "";
      valores[d] = texto || SIN_DATOS;
      if (texto && ev) evidencias[d] = ev;
    }
    return { quien, valores, evidencias };
  });

  const vistas = new Set<Dimension>();
  const ganaPierde: GanaPierde[] = [];
  for (const g of ia?.ganaPierde ?? []) {
    const dimension = g.dimension.trim();
    if (!esDimension(dimension) || vistas.has(dimension)) continue;
    vistas.add(dimension);
    const destacaIA = g.destaca.trim();
    const ev = citar(g.evidencias, reg);
    // Quien destaca tiene que estar respaldado por sus propias evidencias (un "empate", por las de ambos lados).
    const respalda = (q: string) => !!ev && ev.some((e) => regDe(q).has(e.id));
    const valido =
      ev !== null &&
      (destacaIA === "empate"
        ? respalda("analizada") && ev.some((e) => ES_COMPETIDOR.test(e.id))
        : quienes.includes(destacaIA) && respalda(destacaIA));
    ganaPierde.push({
      dimension,
      destaca: valido ? destacaIA : "sin_datos",
      evidencia: valido ? ev : [],
      porQueImporta: filtrar(g.porQueImporta),
      aprender: filtrar(g.aprender),
      diferenciarse: filtrar(g.diferenciarse),
    });
  }
  return { matriz: { dimensiones: [...DIMENSIONES], filas }, ganaPierde };
}

// ---------- Sección ----------

export async function generarCompetencia(
  raw: RawData,
  anatomia: Anatomia,
  reg: Map<string, Evidence>,
  deps: CompetenciaDeps,
): Promise<{ competencia: Competencia; regCompetidores: Map<string, Evidence> }> {
  const propio = dominioDe(raw.url);
  const candidatos = await obtenerCandidatos(raw, anatomia, deps);

  const vistos = new Set<string>();
  const filtrados: { c: z.infer<typeof CandidatoIA>; web: string | null }[] = [];
  for (const c of candidatos) {
    const web = webValida(c.web, propio);
    if (c.web?.trim() && !web) continue; // web dada pero inválida (no http(s)) o del propio negocio
    const clave = web ? registrableDomain(new URL(web).hostname) : `n:${c.nombre.trim().toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    filtrados.push({ c, web });
    if (filtrados.length >= MAX_COMPETIDORES) break;
  }

  // Lectura en paralelo: portada y página de precios, 8 s cada una y todo acotado.
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const lecturas: Lectura[] = filtrados.map(() => ({ home: null, precios: null }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deps.totalMs ?? 2 * timeoutMs);
    (timer as { unref?: () => void }).unref?.();
  });
  await Promise.race([
    Promise.all(filtrados.map(({ web }, i) => (web ? leerCompetidor(web, deps.getPage, timeoutMs, lecturas[i]) : Promise.resolve()))),
    tope,
  ]);
  clearTimeout(timer);
  const comprobadoEn = (deps.now?.() ?? new Date()).toISOString();

  const regCompetidores = new Map<string, Evidence>();
  const leidos: Leido[] = [];
  const competidores: CompetidorV4[] = filtrados.map(({ c, web }, i) => {
    const id = `c${i + 1}`;
    const { home, precios } = lecturas[i];
    const texto = home ? normalizarTexto(htmlATexto(home.html)).slice(0, MAX_TEXTO) : null;
    const terminos = [...new Set(c.terminos.map(normalizarTexto).filter((t) => t.length >= MIN_LARGO_TERMINO))];
    const verificado = texto !== null && terminos.filter((t) => contienePalabra(texto, t)).length >= MIN_TERMINOS;
    const comp: CompetidorV4 = {
      id,
      nombre: c.nombre.trim(),
      web,
      descripcion: filtrar(c.ofrece.trim()),
      tipo: c.tipo,
      motivo: filtrar(c.motivo.trim()),
      verificado,
      comprobadoEn,
      fuentes: [home?.url, precios?.url].filter((u): u is string => !!u),
      ficha: null,
    };
    if (verificado && home) {
      // Solo los verificados aportan evidencia citable: una web sin verificar puede no ser el competidor.
      const propios = new Map<string, Evidence>();
      const idsPrecios = new Set<string>();
      let k = 0;
      const registrar = (cita: string, url: string, esPrecio: boolean) => {
        const eid = `${id}-e${++k}`;
        const e: Evidence = { id: eid, tipo: "pagina", texto: cita, url, fuente: url };
        propios.set(eid, e);
        regCompetidores.set(eid, e);
        if (esPrecio) idsPrecios.add(eid);
      };
      for (const cita of extractPassages(home.html, MAX_EXTRACTOS_PORTADA)) registrar(cita, home.url, false);
      if (precios) {
        const vistasP = new Set<string>();
        const citas = [...extractPassages(precios.html, MAX_EXTRACTOS_PRECIOS), ...extractPricePassages(precios.html)];
        for (const cita of citas) {
          if (vistasP.has(cita) || vistasP.size >= MAX_EXTRACTOS_PRECIOS) continue;
          vistasP.add(cita);
          registrar(cita, precios.url, true);
        }
      }
      leidos.push({ c: comp, reg: propios, idsPrecios });
    }
    return comp;
  });

  if (leidos.length === 0) {
    return { competencia: { competidores, ...resolverComparacion(null, raw, [], reg) }, regCompetidores };
  }

  // Llamada 1: fichas de los verificados, citando sus propios extractos.
  let fichasIA: z.infer<typeof FichasIA> | null = null;
  try {
    fichasIA = await runSection("competencia-fichas", promptFichas(anatomia, leidos), FichasIA, deps.models, deps.runOpts);
  } catch {
    fichasIA = null; // fichas vacías: precio desconocido, sin afirmaciones
  }
  for (const l of leidos) l.c.ficha = resolverFicha(fichasIA?.fichas.find((f) => f.id.trim() === l.c.id), l);

  // Llamada 2: matriz y dónde gana / pierde, con el registro de la web y el de los competidores.
  const unido = new Map<string, Evidence>([...reg, ...regCompetidores]);
  let comparacionIA: z.infer<typeof ComparacionIA> | null = null;
  try {
    comparacionIA = await runSection("competencia-comparacion", promptComparacion(raw, anatomia, leidos), ComparacionIA, deps.models, deps.runOpts);
  } catch {
    comparacionIA = null; // todo "Sin datos" salvo el precio, que es de código
  }

  return { competencia: { competidores, ...resolverComparacion(comparacionIA, raw, leidos, unido) }, regCompetidores };
}
