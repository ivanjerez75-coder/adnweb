import { z } from "zod";
import type { RawData } from "../../types";
import { computeFacts } from "../../facts";
import { allTechnologies } from "../../signals";
import { runSection, type SectionDeps } from "../llm";
import { REGLAS_COMUNES } from "../prompt";
import { contieneCifraNoRespaldada, limpiarAfirmacionesNoRespaldadas } from "../filtro";
import { escapeAngles } from "../../ai/prompt";
import { TEXTO_NO_FIABLE, type Metrica } from "../estimates";
import type { DnaScore } from "../score";
import type { Tipologia } from "../clases";
import type { Anatomia } from "./anatomia";
import { BACKLINKS_ITEM, quitarIdsEvidencia, resumenAnatomia } from "./comun";

export const CLAVES_RENDIMIENTO = ["trafico", "seo", "tecnico", "experiencia", "adquisicion"] as const;
export type ClaveRendimiento = (typeof CLAVES_RENDIMIENTO)[number];

/** Lo que rendimiento muestra de una fricción del diagnóstico (siempre potencial). */
export interface FriccionPotencial {
  id: string;
  tipo: string;
  texto: string;
  potencial: true;
}
export type TipoCanal = "redes" | "blog" | "newsletter" | "publicidad";
export interface CanalObservable {
  tipo: TipoCanal;
  detalle: string;
}
export interface DimensionRendimiento {
  clave: ClaveRendimiento;
  nombre: string;
  /** Claves de `Metrica` que respaldan la dimensión (solo las que existen). */
  metricas: string[];
  interpretacion: string;
  fricciones?: FriccionPotencial[];
  canales?: CanalObservable[];
}
export interface Rendimiento {
  dimensiones: DimensionRendimiento[];
  score: DnaScore;
  noSePuedeSaber: string[];
}

const NOMBRES: Record<ClaveRendimiento, string> = {
  trafico: "Tráfico y audiencia",
  seo: "SEO y visibilidad orgánica",
  tecnico: "Rendimiento técnico",
  experiencia: "Experiencia de usuario y conversión",
  adquisicion: "Adquisición y marketing",
};
const METRICAS: Record<ClaveRendimiento, string[]> = {
  trafico: ["visitas_mensuales", "popularidad_tranco", "popularidad_radar", "usuarios_reales_crux"],
  seo: ["seo_tecnico", "titulos_descripciones", "paginas_sitemap", "idiomas"],
  tecnico: ["pagespeed_movil", "pagespeed_escritorio", "buenas_practicas"],
  experiencia: ["accesibilidad"],
  adquisicion: ["blog_activo"],
};

export const SIN_DATOS_DIMENSION = "No hay datos suficientes para interpretar esta dimensión.";
const MAX_SABER = 8;

// ---------- Interpretación por reglas de código ----------

const disponible = (m: Metrica | undefined): m is Metrica => !!m && m.estado === "disponible" && m.valor != null;
const num = (m: Metrica): number | null => (typeof m.valor === "number" && Number.isFinite(m.valor) ? m.valor : null);
const txt = (m: Metrica): string => (typeof m.valor === "object" && m.valor ? `${m.valor.min}-${m.valor.max}` : String(m.valor));

function nivel(v: number, bien: string, medio: string, mal: string): string {
  return v >= 90 ? bien : v >= 50 ? medio : mal;
}
const AVISO_LAB = "la prueba no mide el efecto en el negocio";

/**
 * Interpretación de una métrica, solo con su propio valor y sin hablar de ventas ni de clientes.
 * null si la métrica no está disponible (salvo las visitas, que siempre dicen que no hay datos).
 */
export function interpretarMetrica(m: Metrica): string | null {
  if (m.clave === "visitas_mensuales") return `${TEXTO_NO_FIABLE} sobre las visitas: ninguna fuente gratuita las mide.`;
  if (!disponible(m)) return null;
  const v = num(m);
  switch (m.clave) {
    case "pagespeed_movil":
    case "pagespeed_escritorio": {
      if (v === null) return null;
      const disp = m.clave === "pagespeed_movil" ? "móvil" : "escritorio";
      return v >= 90
        ? `La web carga rápido en ${disp} (${v}/100 en PageSpeed).`
        : `La web tarda en ${disp} más de lo recomendable (${v}/100 en PageSpeed): conviene revisarlo; ${AVISO_LAB}.`;
    }
    case "accesibilidad":
      return v === null
        ? null
        : `La accesibilidad es ${nivel(v, "buena", "mejorable", "baja")} (${v}/100)${v >= 90 ? "." : ": conviene revisar contrastes, textos alternativos y etiquetas."}`;
    case "buenas_practicas":
      return v === null ? null : `Las buenas prácticas web son ${nivel(v, "buenas", "mejorables", "bajas")} (${v}/100).`;
    case "seo_tecnico":
      return v === null
        ? null
        : `El SEO técnico básico es ${nivel(v, "bueno", "mejorable", "bajo")} (${v}/100); no mide en qué posición aparece en los buscadores.`;
    case "titulos_descripciones":
      return `Títulos y descripciones de las páginas leídas: ${txt(m)}.`;
    case "paginas_sitemap":
      return v === null ? null : `El sitemap declara ${v} página(s): indica cuánto contenido puede encontrar un buscador.`;
    case "idiomas":
      return `La web declara estos idiomas: ${txt(m)}.`;
    case "popularidad_tranco":
      return `Aparece en el puesto ${txt(m)} del ranking Tranco: es popularidad relativa, no visitas.`;
    case "popularidad_radar":
      return `Aparece en el ranking de Cloudflare Radar (${txt(m)}): es popularidad relativa, no visitas.`;
    case "usuarios_reales_crux":
      return `Chrome tiene datos de usuarios reales (${txt(m)}): indica uso real, no cuántas visitas tiene.`;
    case "blog_activo":
      return m.valor === "Sí" ? "Hay entradas de blog recientes en el sitemap." : "No hay entradas de blog recientes en el sitemap.";
    default:
      return null;
  }
}

/** Canales de captación que se ven desde fuera: redes, blog, newsletter y tecnología publicitaria. */
export function canalesObservables(raw: RawData): CanalObservable[] {
  const facts = computeFacts(raw);
  const out: CanalObservable[] = [];
  if (facts.redes.length > 0) out.push({ tipo: "redes", detalle: `Redes sociales enlazadas: ${facts.redes.join(", ")}` });
  if (facts.blog === "si") out.push({ tipo: "blog", detalle: "Tiene blog" });
  if (facts.emailMarketing === "si") out.push({ tipo: "newsletter", detalle: "Herramienta de email marketing o newsletter" });
  const ads = Array.from(new Set(allTechnologies(raw).filter((t) => t.category === "publicidad").map((t) => t.name)));
  if (ads.length > 0) out.push({ tipo: "publicidad", detalle: `Tecnología publicitaria: ${ads.join(", ")}` });
  return out;
}

const NOMBRE_CANAL: Record<TipoCanal, string> = { redes: "redes sociales", blog: "blog", newsletter: "newsletter", publicidad: "tecnología publicitaria" };

/** Las cinco dimensiones con su interpretación de código (sin IA). */
export function interpretarDimensiones(raw: RawData, metricas: Metrica[], fricciones: FriccionPotencial[] = []): DimensionRendimiento[] {
  const porClave = new Map(metricas.map((m) => [m.clave, m]));
  return CLAVES_RENDIMIENTO.map((clave): DimensionRendimiento => {
    const presentes = METRICAS[clave].filter((k) => porClave.has(k));
    const frases = presentes.map((k) => interpretarMetrica(porClave.get(k)!)).filter((x): x is string => !!x);
    const dim: DimensionRendimiento = { clave, nombre: NOMBRES[clave], metricas: presentes, interpretacion: "" };
    if (clave === "experiencia") {
      dim.fricciones = fricciones;
      if (fricciones.length > 0) frases.push("Se detectaron fricciones potenciales: son posibles obstáculos para quien visita la web, no abandonos medidos.");
    }
    if (clave === "adquisicion") {
      const canales = canalesObservables(raw);
      dim.canales = canales;
      frases.push(
        canales.length > 0
          ? `Canales observables: ${canales.map((c) => NOMBRE_CANAL[c.tipo]).join(", ")}. Solo se ve que existen, no cuánto aportan.`
          : "No se observan canales de captación en la web; puede haberlos fuera de ella.",
      );
    }
    dim.interpretacion = frases.join(" ") || SIN_DATOS_DIMENSION;
    return dim;
  });
}

// ---------- Qué no se puede saber (por código) ----------

const SABER_COMUN = ["Visitas reales de la web: ninguna fuente gratuita las mide de forma fiable", "Márgenes y costes internos del negocio"];
const SABER_TIPO: Record<Tipologia, string> = {
  saas: "Número de suscriptores y cuántos renuevan",
  ecommerce: "Volumen de pedidos y ticket medio",
  marketplace: "Volumen de transacciones entre compradores y vendedores",
  servicio_profesional: "Cartera de clientes y facturación por proyecto",
  contenido: "Audiencia real e ingresos por publicidad",
  freemium: "Qué parte de los usuarios gratuitos pasa a pago",
  app: "Descargas y usuarios activos de la app",
  organizacion_social: "Financiación, personas atendidas e impacto real",
  negocio_local: "Afluencia y ocupación del local",
  web_informativa: "Qué aporta la web al negocio fuera de internet",
};

/** Lista por código según la tipología, con el item de backlinks siempre al final. */
export function noSePuedeSaberPorTipo(tipologias: Tipologia[]): string[] {
  const propios = Array.from(new Set(tipologias.map((t) => SABER_TIPO[t]).filter(Boolean)));
  return [...propios, ...SABER_COMUN].slice(0, MAX_SABER - 1).concat(BACKLINKS_ITEM);
}

function cerrarSaber(items: string[]): string[] {
  const otros = items
    .map((x) => limpiarAfirmacionesNoRespaldadas(quitarIdsEvidencia(x), { soloCifras: true }))
    .filter((x) => x.length > 0 && x !== BACKLINKS_ITEM);
  // El item de backlinks va siempre: ocupa un hueco y el resto se recorta.
  return [...Array.from(new Set(otros)).slice(0, MAX_SABER - 1), BACKLINKS_ITEM];
}

// ---------- Pulido opcional con IA ----------

const RendimientoIA = z.object({
  interpretaciones: z.record(z.string(), z.string().catch("")).catch({}),
  noSePuedeSaber: z.array(z.string().catch("")).catch([]),
});

/** Palabras que una interpretación de rendimiento nunca usa: no hay datos de negocio. */
const PROHIBIDAS = /\bventas?\b|\bclientes?\b|ingres|factur|conversi[oó]n|abandon|perd/i;
const numeros = (s: string): string[] => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

/** El texto pulido vale si pasa el filtro, no usa palabras prohibidas y no añade cifras al texto de código. */
export function pulidoValido(pulido: string, base: string): string | null {
  const t = limpiarAfirmacionesNoRespaldadas(quitarIdsEvidencia(pulido ?? ""));
  if (!t || PROHIBIDAS.test(t) || contieneCifraNoRespaldada(t)) return null;
  const permitidas = new Set(numeros(base));
  return numeros(t).every((n) => permitidas.has(n)) ? t : null;
}

function prompt(anatomia: Anatomia, dims: DimensionRendimiento[]): string {
  const textos = dims.map((d) => `- ${d.clave} (${d.nombre}): ${d.interpretacion}`).join("\n");
  return `Eres un analista de negocio. Pule las interpretaciones de rendimiento digital de este negocio y di qué NO se puede saber desde fuera.

${resumenAnatomia(anatomia)}

Interpretaciones calculadas por código (son la base; no añadas datos):
<<<DATOS_WEB
${escapeAngles(textos)}
DATOS_WEB>>>

Devuelve SOLO un JSON: { "interpretaciones": { "trafico": string, "seo": string, "tecnico": string, "experiencia": string, "adquisicion": string }, "noSePuedeSaber": string[] }

Reglas:
${REGLAS_COMUNES}
- "interpretaciones": reescribe cada texto en lenguaje llano para el dueño del negocio, en 1 o 2 frases. Usa SOLO las cifras que ya aparecen en su texto; no añadas cifras, porcentajes ni comparaciones con otras webs.
- No hables de ventas, clientes, ingresos, conversión ni abandono: estos datos no los permiten saber.
- "noSePuedeSaber": de 3 a 7 cosas concretas de este tipo de negocio que no se pueden saber con su web pública (por ejemplo cifras internas, márgenes, retención, ocupación), cada una en una frase corta que dice qué dato falta.`;
}

/**
 * Rendimiento y presencia digital. Las interpretaciones salen de reglas de código; una llamada de IA
 * opcional las pule (filtradas) y propone qué no se puede saber. Sin IA se usa el texto de código.
 * `score` y `fricciones` pueden llegar como promesas: la llamada de IA arranca sin esperarlas.
 */
export async function generarRendimiento(
  raw: RawData,
  metricas: Metrica[],
  anatomia: Anatomia,
  score: DnaScore | PromiseLike<DnaScore>,
  deps: SectionDeps,
  fricciones: FriccionPotencial[] | PromiseLike<FriccionPotencial[]> = [],
): Promise<Rendimiento> {
  const base = interpretarDimensiones(raw, metricas);
  const ia = runSection("rendimiento", prompt(anatomia, base), RendimientoIA, deps.models, deps.runOpts).catch(() => null);

  const [s, fr, pulido] = await Promise.all([score, Promise.resolve(fricciones).then((x) => x, () => []), ia]);
  const dimensiones = interpretarDimensiones(raw, metricas, fr).map((d) => {
    // Con fricciones, el texto de experiencia ya no es el que vio la IA: se queda el de código.
    if (d.clave === "experiencia" && fr.length > 0) return d;
    const p = pulido?.interpretaciones[d.clave];
    const t = p ? pulidoValido(p, d.interpretacion) : null;
    return t ? { ...d, interpretacion: t } : d;
  });
  const saberIa = pulido ? cerrarSaber(pulido.noSePuedeSaber) : [];
  const noSePuedeSaber = saberIa.length > 1 ? saberIa : noSePuedeSaberPorTipo(anatomia.tipologias.map((t) => t.tipo));
  return { dimensiones, score: s, noSePuedeSaber };
}
