import { z } from "zod";
import type { RawData } from "../../types";
import { registrableDomain } from "../../redirect";
import type { PageGetter } from "../../safe-fetch";
import type { JsonModel } from "../../ai/providers";
import { runSection, type RunSectionOpts } from "../llm";
import { bloqueDatosWeb, REGLAS_COMUNES } from "../prompt";
import type { Adn } from "./adn";
import { resumenAdn } from "./saber";

export interface Competidor {
  nombre: string;
  web: string | null;
  ofrece: string;
  diferencias: string[];
  verificado: boolean;
}
export interface ResultadoCompetidores {
  lista: Competidor[];
  /** Textos de portada normalizados de los competidores verificados (para el DNA Score). No se persiste. */
  textosVerificados: string[];
}
export interface CompetidoresDeps {
  searchModels: JsonModel[];
  models: JsonModel[];
  getPage: PageGetter;
  runOpts?: RunSectionOpts;
  /** Tiempo máximo por portada (por defecto 8 s). */
  timeoutMs?: number;
}

const MAX_COMPETIDORES = 5;
const MIN_TERMINOS = 2;
const TIMEOUT_MS = 8000;
const MAX_TEXTO = 20_000;
const MIN_LARGO_TERMINO = 4; // términos muy cortos ("app", "web") coinciden con cualquier cosa

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** El término aparece como palabra (o frase) completa, no dentro de otra palabra. */
export const contienePalabra = (texto: string, termino: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(termino)}($|[^\\p{L}\\p{N}])`, "u").test(texto);

const CandidatoIA = z.object({
  nombre: z.string().min(1),
  web: z.string().nullable().default(null),
  ofrece: z.string().default(""),
  terminos: z.array(z.string()).default([]),
});
const CompetidoresIA = z.object({ competidores: z.array(CandidatoIA).min(1) });
const DiferenciasIA = z.object({
  diferencias: z.array(z.object({ nombre: z.string(), items: z.array(z.string()).default([]) })).default([]),
});

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

function prompt(raw: RawData, adn: Adn, conBusqueda: boolean): string {
  return `Eres un analista de mercado. Encuentra de 3 a 5 competidores reales del negocio analizado${
    conBusqueda ? " usando la búsqueda de Google" : ""
  }. No inventes empresas: si no estás seguro de que existen, no las incluyas.

${resumenAdn(adn)}

Devuelve SOLO un JSON: { "competidores": [ { "nombre": string, "web": string (URL de su página principal), "ofrece": string (una frase), "terminos": string[] (de 3 a 6 términos clave del servicio que deberían aparecer en su web) } ] }

Reglas:
${REGLAS_COMUNES}
- No incluyas el propio negocio analizado.

${bloqueDatosWeb(raw)}`;
}

async function obtenerCandidatos(raw: RawData, adn: Adn, deps: CompetidoresDeps) {
  if (deps.searchModels.length > 0) {
    try {
      const r = await runSection("competidores", prompt(raw, adn, true), CompetidoresIA, deps.searchModels, deps.runOpts);
      return { candidatos: r.competidores, buscado: true };
    } catch {
      // cae al modelo normal, sin verificación posible de la búsqueda
    }
  }
  const r = await runSection("competidores", prompt(raw, adn, false), CompetidoresIA, deps.models, deps.runOpts);
  return { candidatos: r.competidores, buscado: false };
}

async function portada(url: string, getPage: PageGetter, timeoutMs: number): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const p = await Promise.race([
      getPage(url),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error("timeout")), timeoutMs);
      }),
    ]);
    if (p.status < 200 || p.status >= 300) return null;
    return normalizarTexto(htmlATexto(p.text)).slice(0, MAX_TEXTO);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generarDiferencias(adn: Adn, verificados: Competidor[], deps: CompetidoresDeps): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (verificados.length === 0) return out;
  const lista = verificados.map((c) => `- ${c.nombre}: ${c.ofrece}`).join("\n");
  const p = `Compara el negocio analizado con estos competidores, usando solo lo que ofrecen según la lista. Indica en qué se diferencian (1 a 3 diferencias cortas y concretas por competidor, sin inventar datos como precios o cifras).

${resumenAdn(adn)}

Competidores:
${lista}

Devuelve SOLO un JSON: { "diferencias": [ { "nombre": string, "items": string[] } ] }

Reglas:
${REGLAS_COMUNES}`;
  try {
    const r = await runSection("competidores-dif", p, DiferenciasIA, deps.models, deps.runOpts);
    for (const d of r.diferencias) {
      const items = d.items.map((x) => x.trim()).filter(Boolean).slice(0, 3);
      if (items.length) out.set(d.nombre.trim().toLowerCase(), items);
    }
  } catch {
    // sin diferencias: el campo queda vacío
  }
  return out;
}

export async function generarCompetidores(
  raw: RawData,
  adn: Adn,
  deps: CompetidoresDeps,
): Promise<ResultadoCompetidores> {
  let propio: string | null = null;
  try {
    propio = registrableDomain(new URL(raw.url).hostname);
  } catch {
    propio = null;
  }

  const { candidatos, buscado } = await obtenerCandidatos(raw, adn, deps);

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

  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const textos = await Promise.all(
    filtrados.map(({ web }) => (buscado && web ? portada(web, deps.getPage, timeoutMs) : Promise.resolve(null))),
  );

  const lista: Competidor[] = filtrados.map(({ c, web }, i) => {
    const texto = textos[i];
    const terminos = [...new Set(c.terminos.map(normalizarTexto).filter((t) => t.length >= MIN_LARGO_TERMINO))];
    const verificado = texto !== null && terminos.filter((t) => contienePalabra(texto, t)).length >= MIN_TERMINOS;
    return { nombre: c.nombre.trim(), web, ofrece: c.ofrece.trim(), diferencias: [], verificado };
  });
  const textosVerificados = textos.filter((t, i): t is string => t !== null && lista[i].verificado);

  const dif = await generarDiferencias(adn, lista.filter((c) => c.verificado), deps);
  for (const c of lista) if (c.verificado) c.diferencias = dif.get(c.nombre.toLowerCase()) ?? [];

  return { lista, textosVerificados };
}
