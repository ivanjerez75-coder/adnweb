import { FX_TO_EUR } from "../anchors";
import type { Range, RawData } from "../types";

/**
 * Métricas v3.1 (docs/decisiones/0007-estimaciones-v3.md): cada cifra del informe es un registro
 * etiquetado con su tipo, confianza y limitaciones. Nunca se convierte un ranking en visitas.
 */
export type TipoMetrica = "observado" | "estimado" | "hipotetico";
export type ConfianzaMetrica = "alta" | "media" | "baja" | "insuficiente";
export type EstadoMetrica = "disponible" | "insuficiente" | "error" | "no_aplica";

export interface Metrica {
  clave: string;
  etiqueta: string;
  valor: number | string | Range | null;
  unidad: string;
  fuente: string;
  fuenteUrl?: string;
  tipo: TipoMetrica;
  metodologia: string;
  periodo?: string;
  obtenidoEn: string;
  confianza: ConfianzaMetrica;
  motivoConfianza: string;
  limitaciones: string[];
  supuestos: string[];
  estado: EstadoMetrica;
}

export type Periodicidad = "mes" | "año" | "unico";

export interface PrecioPublicado {
  importe: number;
  moneda: string;
  periodicidad: Periodicidad | null;
  plan: string | null;
  url: string;
  texto: string;
}

export const TEXTO_ESCENARIO = "Escenario ilustrativo: no son los ingresos de la empresa";
export const TEXTO_NO_FIABLE = "No hay datos fiables disponibles";
export const TEXTO_VALORACION = "No estimable con los datos disponibles";
const SUPUESTO_PERIODICIDAD = "periodicidad desconocida: se trata como mensual";
const CLIENTES_ESCENARIO = [100, 500, 1000];

// ---------- Precios ----------

const MONEDAS = [
  { codigo: "USD", re: /\$|USD/i },
  { codigo: "GBP", re: /£|GBP/i },
  { codigo: "EUR", re: /€|EUR/i },
];

const PERIODOS: { valor: Periodicidad; re: RegExp }[] = [
  { valor: "mes", re: /\/\s*mes|al\s+mes|mensual|por\s+mes|\/\s*mo\b|per\s+month|\bmonth/i },
  { valor: "año", re: /\/\s*a[ñn]o|al\s+a[ñn]o|anual|por\s+a[ñn]o|\/\s*yr\b|\/\s*year|per\s+year|\byear|\bannual/i },
  { valor: "unico", re: /pago\s+[úu]nico|one[-\s]?time|una\s+sola\s+vez/i },
];

function numero(texto: string): number | null {
  const m = texto.match(/\d[\d.,\s]*/);
  if (!m) return null;
  let num = m[0].trim().replace(/\s/g, "");
  const punto = num.lastIndexOf(".");
  const coma = num.lastIndexOf(",");
  if (punto >= 0 && coma >= 0) {
    const dec = Math.max(punto, coma);
    num = num.slice(0, dec).replace(/[.,]/g, "") + "." + num.slice(dec + 1);
  } else if (punto >= 0 || coma >= 0) {
    const sep = punto >= 0 ? "." : ",";
    const partes = num.split(sep);
    num = partes.length > 2 || (partes.length === 2 && partes[1].length === 3) ? partes.join("") : partes.join(".");
  }
  const n = Number(num);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Interpreta "29 €/mes", "$100 per month" o "9,99 €": importe y moneda originales y periodicidad si consta. */
export function parsearPrecio(texto: string): { importe: number; moneda: string; periodicidad: Periodicidad | null } | null {
  const moneda = MONEDAS.find((m) => m.re.test(texto))?.codigo;
  const importe = numero(texto);
  if (!moneda || importe === null) return null;
  // Si hay varias pistas de periodicidad, vale la que aparece primero.
  let periodicidad: Periodicidad | null = null;
  let pos = Infinity;
  for (const p of PERIODOS) {
    const i = texto.search(p.re);
    if (i >= 0 && i < pos) {
      pos = i;
      periodicidad = p.valor;
    }
  }
  return { importe, moneda, periodicidad };
}

/** Precios que la web publica, con la URL de la página donde se vieron. */
export function preciosPublicados(raw: RawData): PrecioPublicado[] {
  const site = raw.site;
  if (!site) return [];
  const urlDe = (texto: string): string => {
    const conTexto = site.pages.find((p) => p.text.includes(texto));
    if (conTexto) return conTexto.url;
    const precios = site.pages.find((p) => /precio|pricing|planes|plans/i.test(p.url));
    return (precios ?? site.pages[0])?.url ?? site.finalUrl;
  };
  const out: PrecioPublicado[] = [];
  for (const texto of site.pricesFound) {
    const p = parsearPrecio(texto);
    if (!p) continue;
    out.push({ ...p, plan: null, url: urlDe(texto), texto });
  }
  return out;
}

const mediana = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Precio mensual en euros de un precio recurrente; null si es un pago único o la moneda no se conoce. */
function mensualEur(p: PrecioPublicado): number | null {
  if (p.periodicidad === "unico") return null;
  const fx = FX_TO_EUR[p.moneda];
  if (!fx) return null;
  return (p.periodicidad === "año" ? p.importe / 12 : p.importe) * fx;
}

/** Clientes × mediana del precio mensual publicado. null si no hay ningún precio recurrente. */
export function escenarioIngresos(precios: PrecioPublicado[]): { clientes: number; ingresosMes: number }[] | null {
  const mensuales = precios.map(mensualEur).filter((x): x is number => x !== null);
  if (mensuales.length === 0) return null;
  const precio = mediana(mensuales);
  return CLIENTES_ESCENARIO.map((clientes) => ({ clientes, ingresosMes: Math.round(clientes * precio) }));
}

// ---------- Registro de métricas ----------

type Base = Pick<Metrica, "clave" | "etiqueta" | "fuente" | "obtenidoEn"> & Partial<Metrica>;

const metrica = (b: Base): Metrica => ({
  valor: null,
  unidad: "",
  tipo: "observado",
  metodologia: "",
  confianza: "insuficiente",
  motivoConfianza: "",
  limitaciones: [],
  supuestos: [],
  estado: "insuficiente",
  ...b,
});

function popularidad(raw: RawData): Metrica[] {
  const obtenidoEn = raw.collectedAt;
  const tr = raw.tranco;
  const ra = raw.radar;

  const tranco: Metrica =
    tr?.rank != null
      ? metrica({
          clave: "popularidad_tranco",
          etiqueta: "Puesto en el ranking Tranco",
          valor: tr.rank,
          unidad: "puesto",
          fuente: "Tranco",
          fuenteUrl: "https://tranco-list.eu/",
          metodologia: `Posición del dominio en la lista Tranco, que combina varios rankings públicos${tr.trend ? `; tendencia: ${tr.trend}` : ""}.`,
          obtenidoEn,
          confianza: "alta",
          motivoConfianza: "Dato publicado directamente por Tranco para este dominio.",
          limitaciones: ["No mide visitas: es un puesto relativo de popularidad, no tráfico.", "Un puesto bajo no implica pocos usuarios."],
          estado: "disponible",
        })
      : metrica({
          clave: "popularidad_tranco",
          etiqueta: "Puesto en el ranking Tranco",
          fuente: "Tranco",
          fuenteUrl: "https://tranco-list.eu/",
          obtenidoEn,
          metodologia: "Consulta del dominio en la lista Tranco.",
          motivoConfianza: raw.fuentes.tranco === "fallo" ? "No se pudo consultar Tranco." : "El dominio no aparece en la lista Tranco.",
          limitaciones: ["No mide visitas."],
          estado: raw.fuentes.tranco === "fallo" ? "error" : "insuficiente",
        });

  const radar: Metrica =
    ra && (ra.rank != null || ra.bucket != null)
      ? metrica({
          clave: "popularidad_radar",
          etiqueta: "Popularidad según Cloudflare Radar",
          valor: ra.rank ?? ra.bucket,
          unidad: ra.rank != null ? "puesto" : "franja (top N dominios)",
          fuente: "Cloudflare Radar",
          fuenteUrl: "https://radar.cloudflare.com/",
          metodologia: ra.rank != null ? "Posición exacta del dominio en el ranking de Radar." : "Franja de popularidad del dominio en Radar.",
          obtenidoEn,
          confianza: "alta",
          motivoConfianza: "Dato publicado directamente por Cloudflare Radar para este dominio.",
          limitaciones: [
            "No mide visitas: es un ranking de popularidad, no tráfico.",
            ra.rank == null ? "Solo da una franja, no una posición exacta." : "Se basa en las consultas DNS que ve Cloudflare.",
          ],
          estado: "disponible",
        })
      : metrica({
          clave: "popularidad_radar",
          etiqueta: "Popularidad según Cloudflare Radar",
          fuente: "Cloudflare Radar",
          fuenteUrl: "https://radar.cloudflare.com/",
          obtenidoEn,
          metodologia: "Consulta del dominio en Cloudflare Radar.",
          motivoConfianza: raw.fuentes.radar === "fallo" ? "No se pudo consultar Cloudflare Radar." : "El dominio no aparece en los rankings de Radar.",
          limitaciones: ["No mide visitas."],
          estado: raw.fuentes.radar === "fallo" ? "error" : "insuficiente",
        });

  return [tranco, radar];
}

const FUENTE_PS = "Google PageSpeed Insights";
const URL_PS = "https://pagespeed.web.dev/";

/** Cinco puntuaciones de Lighthouse y, al final, los datos reales de usuarios (CrUX). */
function pagespeedMetricas(raw: RawData): Metrica[] {
  const ps = raw.pagespeed;
  const obtenidoEn = ps?.obtenidoEn ?? raw.collectedAt;
  const sinDato = (): { estado: EstadoMetrica; motivo: string } =>
    ps?.error
      ? { estado: "error", motivo: `PageSpeed no respondió: ${ps.error}` }
      : !ps
        ? { estado: raw.fuentes.pagespeed === "fallo" ? "error" : "insuficiente", motivo: "No se consultó PageSpeed para este dominio." }
        : { estado: "insuficiente", motivo: "Google no devolvió esta puntuación." };

  const puntuacion = (clave: string, etiqueta: string, valor: number | null | undefined, que: string, dispositivo: string): Metrica => {
    if (ps && !ps.error && valor != null) {
      return metrica({
        clave,
        etiqueta,
        valor,
        unidad: "/100",
        fuente: FUENTE_PS,
        fuenteUrl: URL_PS,
        metodologia: `Auditoría de laboratorio de Lighthouse (${dispositivo}) sobre la página de inicio: ${que}.`,
        obtenidoEn,
        confianza: "alta",
        motivoConfianza: "Medición directa de Lighthouse sobre la página analizada.",
        limitaciones: ["Mide solo la página de inicio, en un único momento y con condiciones simuladas.", "No mide visitas."],
        estado: "disponible",
      });
    }
    const { estado, motivo } = sinDato();
    return metrica({
      clave,
      etiqueta,
      fuente: FUENTE_PS,
      fuenteUrl: URL_PS,
      obtenidoEn,
      metodologia: `Auditoría de laboratorio de Lighthouse (${dispositivo}): ${que}.`,
      motivoConfianza: motivo,
      estado,
    });
  };

  const c = ps?.campo;
  let crux: Metrica;
  if (ps && !ps.error && c) {
    const partes = [
      c.lcpMs != null ? `LCP ${Math.round(c.lcpMs)} ms` : null,
      c.inpMs != null ? `INP ${Math.round(c.inpMs)} ms` : null,
      c.cls != null ? `CLS ${c.cls}` : null,
    ].filter((x): x is string => x !== null);
    crux = metrica({
      clave: "usuarios_reales_crux",
      etiqueta: "Experiencia de usuarios reales en Chrome (CrUX)",
      valor: partes.join(" · ") || (c.categoria ?? "sin métricas"),
      unidad: "Core Web Vitals",
      fuente: "Chrome UX Report (vía PageSpeed Insights)",
      fuenteUrl: URL_PS,
      metodologia: `Datos reales de usuarios de Chrome de los últimos 28 días, a nivel de ${c.fuente === "url" ? "URL" : "origen"}${c.categoria ? `; veredicto de Google: ${c.categoria}` : ""}.`,
      periodo: "últimos 28 días",
      obtenidoEn,
      confianza: "alta",
      motivoConfianza: "Dato real medido por Chrome para este sitio; que exista indica tráfico suficiente.",
      limitaciones: ["Solo incluye usuarios de Chrome que comparten estadísticas.", "No mide cuántas visitas tiene la web, solo cómo la experimentan."],
      estado: "disponible",
    });
  } else {
    const { estado, motivo } =
      ps && !ps.error
        ? { estado: "insuficiente" as EstadoMetrica, motivo: "Chrome no tiene datos suficientes de usuarios reales para este sitio." }
        : sinDato();
    crux = metrica({
      clave: "usuarios_reales_crux",
      etiqueta: "Experiencia de usuarios reales en Chrome (CrUX)",
      fuente: "Chrome UX Report (vía PageSpeed Insights)",
      fuenteUrl: URL_PS,
      obtenidoEn,
      metodologia: "Datos reales de usuarios de Chrome de los últimos 28 días.",
      motivoConfianza: motivo,
      limitaciones: ["No mide visitas."],
      estado,
    });
  }

  return [
    puntuacion("pagespeed_movil", "PageSpeed en móvil", ps?.mobile, "rendimiento", "móvil"),
    puntuacion("pagespeed_escritorio", "PageSpeed en escritorio", ps?.desktop, "rendimiento", "escritorio"),
    puntuacion("accesibilidad", "Accesibilidad", ps?.accesibilidad, "accesibilidad", "móvil"),
    puntuacion("seo_tecnico", "SEO técnico", ps?.seo, "SEO técnico básico", "móvil"),
    puntuacion("buenas_practicas", "Buenas prácticas", ps?.buenasPracticas, "buenas prácticas web", "móvil"),
    crux,
  ];
}

function ingresosPublicados(raw: RawData, now: Date): Metrica {
  const rev = raw.wikidata?.revenue;
  const base = {
    clave: "ingresos_publicados",
    etiqueta: "Ingresos publicados",
    fuente: "Wikidata",
    fuenteUrl: raw.wikidata ? `https://www.wikidata.org/wiki/${raw.wikidata.id}` : undefined,
    obtenidoEn: raw.collectedAt,
  };
  if (!rev || !(rev.amount > 0)) {
    return metrica({
      ...base,
      fuente: "Ninguna fuente publica los ingresos",
      fuenteUrl: undefined,
      metodologia: "Solo se muestran ingresos que la empresa o una fuente abierta hayan publicado.",
      motivoConfianza: "No estimable: no hay ingresos publicados para esta empresa.",
      limitaciones: ["Los ingresos nunca se deducen de rankings, tráfico ni número de empleados."],
    });
  }
  const antiguedad = rev.year != null ? now.getUTCFullYear() - rev.year : null;
  const confianza: ConfianzaMetrica = antiguedad === null ? "baja" : antiguedad <= 2 ? "alta" : antiguedad <= 5 ? "media" : "baja";
  return metrica({
    ...base,
    valor: rev.amount,
    unidad: `${rev.currency}/año`,
    metodologia: "Importe de ingresos anuales publicado en Wikidata, sin convertir ni ajustar.",
    periodo: rev.year != null ? String(rev.year) : undefined,
    confianza,
    motivoConfianza:
      antiguedad === null
        ? "Wikidata no indica a qué año corresponde el dato."
        : `Dato de ${rev.year}, de hace ${antiguedad} año(s): alta si tiene 2 o menos, media hasta 5, baja después.`,
    limitaciones: ["Wikidata es editable por la comunidad y puede estar desactualizado.", "El dato puede referirse al grupo y no solo a esta web."],
    estado: "disponible",
  });
}

function escenarioMetrica(raw: RawData, precios: PrecioPublicado[]): Metrica | null {
  const esc = escenarioIngresos(precios);
  if (!esc) return null;
  const usados = precios.filter((p) => mensualEur(p) !== null);
  const supuestos = [
    "Número de clientes desconocido: se muestran 100, 500 y 1.000 como ilustración.",
    "Todos los clientes pagan el precio mediano publicado.",
  ];
  if (usados.some((p) => p.periodicidad === null)) supuestos.push(SUPUESTO_PERIODICIDAD);
  if (usados.some((p) => p.periodicidad === "año")) supuestos.push("Los precios anuales se dividen entre 12.");
  if (usados.some((p) => p.moneda !== "EUR")) supuestos.push("Los precios en otras monedas se convierten a euros con un tipo de cambio fijo.");
  if (usados.length < precios.length) supuestos.push("Los pagos únicos no se incluyen en el escenario.");
  return metrica({
    clave: "escenario_ingresos",
    etiqueta: "Escenario de ingresos mensuales",
    valor: { min: esc[0].ingresosMes, max: esc[esc.length - 1].ingresosMes },
    unidad: "€/mes",
    fuente: "Precios publicados en la web",
    tipo: "hipotetico",
    metodologia: `Clientes (${CLIENTES_ESCENARIO.join(", ")}) × mediana del precio mensual publicado, calculada sobre ${usados.length} precio(s).`,
    obtenidoEn: raw.collectedAt,
    confianza: "baja",
    motivoConfianza: "Es una ilustración: parte de precios reales, pero el número de clientes es inventado a propósito.",
    limitaciones: [
      TEXTO_ESCENARIO,
      "Un precio anunciado no es un ingreso medio por cliente.",
      "Para validarlo haría falta el número real de clientes y lo que paga cada uno.",
    ],
    supuestos,
    estado: "disponible",
  });
}

function seoMetricas(raw: RawData): Metrica[] {
  const obtenidoEn = raw.collectedAt;
  const sm = raw.sitemap;
  const paginas = raw.paginas ?? [];

  const paginasSitemap: Metrica =
    sm && sm.urlCount > 0
      ? metrica({
          clave: "paginas_sitemap",
          etiqueta: "Páginas en el sitemap",
          valor: sm.urlCount,
          unidad: "páginas",
          fuente: "sitemap.xml del sitio",
          metodologia: "Recuento de URLs declaradas en el sitemap.",
          obtenidoEn,
          confianza: sm.complete ? "alta" : "media",
          motivoConfianza: sm.complete ? "Se leyó el sitemap completo." : "Se leyó solo una parte del sitemap: el total es al menos esa cifra.",
          limitaciones: [
            ...(sm.complete ? [] : ["Sitemap incompleto: hay al menos esas páginas."]),
            "Un sitemap lista lo que el sitio quiere indexar, no todas sus páginas.",
          ],
          estado: "disponible",
        })
      : metrica({
          clave: "paginas_sitemap",
          etiqueta: "Páginas en el sitemap",
          fuente: "sitemap.xml del sitio",
          obtenidoEn,
          metodologia: "Recuento de URLs declaradas en el sitemap.",
          motivoConfianza: "No se encontró un sitemap legible.",
          estado: raw.fuentes.sitemap === "fallo" ? "error" : "insuficiente",
        });

  const conTitulo = paginas.filter((p) => p.titulo.trim().length > 0).length;
  const conDescripcion = paginas.filter((p) => p.tieneDescripcion).length;
  const titulos: Metrica =
    paginas.length > 0
      ? metrica({
          clave: "titulos_descripciones",
          etiqueta: "Títulos y descripciones",
          valor: `${conTitulo} de ${paginas.length} con título; ${conDescripcion} de ${paginas.length} con descripción`,
          unidad: "páginas analizadas",
          fuente: "Páginas leídas del sitio",
          metodologia: "Recuento sobre las páginas leídas en profundidad.",
          obtenidoEn,
          confianza: "media",
          motivoConfianza: "Dato directo, pero solo sobre una muestra de páginas.",
          limitaciones: ["Solo cubre las páginas leídas, no todo el sitio."],
          estado: "disponible",
        })
      : metrica({
          clave: "titulos_descripciones",
          etiqueta: "Títulos y descripciones",
          fuente: "Páginas leídas del sitio",
          obtenidoEn,
          metodologia: "Recuento sobre las páginas leídas en profundidad.",
          motivoConfianza: "No se leyeron páginas en profundidad.",
        });

  const idiomasLista = Array.from(new Set([...(raw.site?.languages ?? []), ...(raw.sitemap?.languages ?? [])]));
  const idiomas: Metrica =
    idiomasLista.length > 0
      ? metrica({
          clave: "idiomas",
          etiqueta: "Idiomas de la web",
          valor: idiomasLista.join(", "),
          unidad: "idiomas",
          fuente: "Web y sitemap",
          metodologia: "Idiomas declarados por la web (atributos de idioma) y por el sitemap.",
          obtenidoEn,
          confianza: "media",
          motivoConfianza: "Idiomas declarados por el propio sitio; no se verifica que todo esté traducido.",
          limitaciones: ["Declarar un idioma no garantiza que el contenido esté traducido."],
          estado: "disponible",
        })
      : metrica({
          clave: "idiomas",
          etiqueta: "Idiomas de la web",
          fuente: "Web y sitemap",
          obtenidoEn,
          metodologia: "Idiomas declarados por la web y por el sitemap.",
          motivoConfianza: "La web no declara idiomas.",
        });

  const blog: Metrica = sm
    ? metrica({
        clave: "blog_activo",
        etiqueta: "Blog activo",
        valor: sm.recentBlogPosts > 0 ? "Sí" : "No",
        fuente: "sitemap.xml del sitio",
        metodologia: "Hay URLs de blog con fecha de modificación en los últimos 90 días.",
        periodo: "últimos 90 días",
        obtenidoEn,
        confianza: sm.recentBlogPosts > 0 || sm.complete ? "media" : "baja",
        motivoConfianza:
          sm.recentBlogPosts > 0
            ? "El sitemap muestra entradas recientes de blog."
            : sm.complete
              ? "El sitemap completo no muestra entradas recientes."
              : "Sitemap incompleto: pueden existir entradas recientes que no se leyeron.",
        limitaciones: ["Depende de que el sitemap incluya fechas de modificación fiables."],
        estado: "disponible",
      })
    : metrica({
        clave: "blog_activo",
        etiqueta: "Blog activo",
        fuente: "sitemap.xml del sitio",
        obtenidoEn,
        metodologia: "Hay URLs de blog con fecha reciente en el sitemap.",
        motivoConfianza: "Sin sitemap no se puede saber si el blog está activo.",
      });

  return [paginasSitemap, titulos, idiomas, blog];
}

/** Todas las métricas del informe. Las que no tienen datos salen con su estado: nunca se omiten. */
export function construirMetricas(raw: RawData, now: Date): Metrica[] {
  const precios = preciosPublicados(raw);
  const escenario = escenarioMetrica(raw, precios);
  const [tranco, radar] = popularidad(raw);
  const ps = pagespeedMetricas(raw);

  const visitas = metrica({
    clave: "visitas_mensuales",
    etiqueta: "Visitas mensuales",
    tipo: "estimado",
    unidad: "visitas/mes",
    fuente: "Ninguna fuente gratuita",
    metodologia: `${TEXTO_NO_FIABLE}: ninguna fuente gratuita mide las visitas y no se deducen de rankings.`,
    obtenidoEn: raw.collectedAt,
    motivoConfianza: `${TEXTO_NO_FIABLE}.`,
    limitaciones: ["El puesto en un ranking no equivale a un número de visitas."],
  });

  const valoracion = metrica({
    clave: "valoracion",
    etiqueta: "Valor del negocio",
    tipo: "estimado",
    unidad: "€",
    fuente: "Sin base de cálculo",
    metodologia: `${TEXTO_VALORACION}.`,
    obtenidoEn: raw.collectedAt,
    motivoConfianza: `${TEXTO_VALORACION}: haría falta conocer ingresos, márgenes, crecimiento y comparables.`,
    limitaciones: ["Ninguna fuente gratuita aporta ingresos, márgenes, crecimiento ni comparables."],
    estado: "no_aplica",
  });

  return [
    visitas,
    tranco,
    radar,
    ps[5],
    ingresosPublicados(raw, now),
    ...(escenario ? [escenario] : []),
    valoracion,
    ...ps.slice(0, 5),
    ...seoMetricas(raw),
  ];
}
